/**
 * Slideshow lifecycle probe — spike instrumentation for auto poll view
 * control. Answers, with timestamped evidence: when does PowerPoint create
 * this content add-in's webview, what does getActiveViewAsync report inside
 * it, does ActiveViewChanged fire here, and when is the webview torn down
 * as the host navigates a slideshow.
 *
 * Every event is POSTed to a local collector (backend /spike/lifecycle,
 * see backend/app/api/spike.py) which also serves a live viewer at /spike.
 *
 * Safety stance: inert unless the page is served from localhost/127.0.0.1,
 * or ?spike=1 is in the URL, or localStorage["prezo:spike-lifecycle"]="1".
 * Reads embed identity via PrezoEmbedIdentity.peek() only — never mints or
 * replaces an id. Delete this file (and its script tag) when the spike
 * concludes.
 */
(function installSpikeLifecycleProbe(globalObj) {
  "use strict"

  var DEFAULT_TARGET = "http://localhost:8000"
  var TARGET_STORAGE_KEY = "prezo:spike-target"
  var ENABLE_STORAGE_KEY = "prezo:spike-lifecycle"
  var HEARTBEAT_MS = 2000

  var doc = globalObj.document
  if (!doc || !globalObj.location) {
    return
  }

  function readStorage(key) {
    try {
      return globalObj.localStorage ? globalObj.localStorage.getItem(key) : null
    } catch (error) {
      return null
    }
  }

  var params = null
  try {
    params = new URLSearchParams(globalObj.location.search)
  } catch (error) {
    params = null
  }

  var isLocalhost =
    globalObj.location.hostname === "localhost" ||
    globalObj.location.hostname === "127.0.0.1"
  var enabled =
    isLocalhost ||
    (params && params.get("spike") === "1") ||
    readStorage(ENABLE_STORAGE_KEY) === "1"
  if (!enabled) {
    return
  }

  var target =
    (params && params.get("spikeTarget")) ||
    readStorage(TARGET_STORAGE_KEY) ||
    DEFAULT_TARGET
  target = target.replace(/\/+$/, "")
  var endpoint = target + "/spike/lifecycle"

  function generateUuid() {
    if (globalObj.crypto && typeof globalObj.crypto.randomUUID === "function") {
      return globalObj.crypto.randomUUID()
    }
    var template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    return template.replace(/[xy]/g, function (character) {
      var random = (Math.random() * 16) | 0
      var value = character === "x" ? random : (random & 0x3) | 0x8
      return value.toString(16)
    })
  }

  var instanceId = generateUuid()
  var seq = 0
  var lastEmbedId = null
  var heartbeatCount = 0

  // Slide-display signals. Run 1 showed webviews are long-lived and blind to
  // slide navigation through view/visibility/focus, so heartbeats also carry:
  // - rAF cadence (compositors stop painting frames that aren't displayed)
  // - window size + devicePixelRatio (re-parenting into the fullscreen show
  //   window should resize the page)
  // - getSelectedDataAsync(SlideRange) (does the host expose the current
  //   slide during a show?)
  var rafCount = 0
  function rafLoop() {
    rafCount += 1
    globalObj.requestAnimationFrame(rafLoop)
  }
  if (typeof globalObj.requestAnimationFrame === "function") {
    globalObj.requestAnimationFrame(rafLoop)
  }

  function peekEmbedId() {
    try {
      if (globalObj.PrezoEmbedIdentity && typeof globalObj.PrezoEmbedIdentity.peek === "function") {
        var value = globalObj.PrezoEmbedIdentity.peek()
        if (typeof value === "string" && value.length > 0) {
          return value
        }
      }
    } catch (error) {
      /* identity not readable yet */
    }
    return null
  }

  function buildBody(event, fields) {
    seq += 1
    var payload = {
      event: event,
      instanceId: instanceId,
      embedId: lastEmbedId,
      seq: seq,
      tMono: Math.round(globalObj.performance && globalObj.performance.now ? globalObj.performance.now() : 0),
      wall: new Date().toISOString(),
    }
    if (fields) {
      for (var key in fields) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
          payload[key] = fields[key]
        }
      }
    }
    return JSON.stringify(payload)
  }

  function post(event, fields) {
    var body = buildBody(event, fields)
    try {
      globalObj
        .fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
        })
        .catch(function () {
          /* collector down — stay silent */
        })
    } catch (error) {
      /* fetch unavailable — stay silent */
    }
  }

  // Terminal events ride sendBeacon: it survives page teardown, and a
  // text/plain body is a "simple" CORS request that needs no preflight.
  function beacon(event, fields) {
    var body = buildBody(event, fields)
    try {
      if (globalObj.navigator && typeof globalObj.navigator.sendBeacon === "function") {
        var blob = new Blob([body], { type: "text/plain" })
        if (globalObj.navigator.sendBeacon(endpoint, blob)) {
          return
        }
      }
    } catch (error) {
      /* fall through to fetch */
    }
    try {
      globalObj
        .fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: body,
          keepalive: true,
        })
        .catch(function () {})
    } catch (error) {
      /* nothing left to try */
    }
  }

  function officeDocumentReady() {
    return Boolean(
      globalObj.Office &&
        globalObj.Office.context &&
        globalObj.Office.context.document
    )
  }

  // getActiveViewAsync callbacks can stall for long stretches (observed while
  // the host is busy); without a watchdog one stalled call would block every
  // later check behind the in-flight guard.
  var viewCheckPending = false
  var viewCheckStartedAt = 0
  var VIEW_CHECK_STALL_MS = 5000

  function getActiveView(callback) {
    if (!officeDocumentReady() || typeof globalObj.Office.context.document.getActiveViewAsync !== "function") {
      callback("unavailable")
      return
    }
    try {
      globalObj.Office.context.document.getActiveViewAsync(function (result) {
        if (result && result.status === globalObj.Office.AsyncResultStatus.Succeeded) {
          callback(result.value)
          return
        }
        var detail = result && result.error && result.error.message ? result.error.message : "failed"
        callback("error:" + detail)
      })
    } catch (error) {
      callback("threw:" + String(error && error.message))
    }
  }

  function getSlideRange(callback) {
    if (
      !officeDocumentReady() ||
      typeof globalObj.Office.context.document.getSelectedDataAsync !== "function" ||
      !globalObj.Office.CoercionType
    ) {
      callback("unavailable")
      return
    }
    try {
      globalObj.Office.context.document.getSelectedDataAsync(
        globalObj.Office.CoercionType.SlideRange,
        function (result) {
          if (result && result.status === globalObj.Office.AsyncResultStatus.Succeeded) {
            var slides = result.value && result.value.slides
            if (slides && slides.length > 0) {
              callback("i" + slides[0].index + " n" + slides.length)
              return
            }
            callback("empty")
            return
          }
          var detail = result && result.error && result.error.message ? result.error.message : "failed"
          callback("err:" + detail)
        }
      )
    } catch (error) {
      callback("threw:" + String(error && error.message))
    }
  }

  post("boot", {
    href: globalObj.location.href,
    referrer: doc.referrer || "",
    visibility: doc.visibilityState,
    ua: globalObj.navigator ? globalObj.navigator.userAgent : "",
    w: globalObj.innerWidth,
    h: globalObj.innerHeight,
    dpr: globalObj.devicePixelRatio || null,
  })

  // E2E harness auth: PowerPoint content add-ins can't read customXmlParts,
  // so production tokens arrive via the taskpane writing shared-origin
  // localStorage. The harness does the same — if the local collector has an
  // e2e seed, mirror its token into the key the wrapper polls. No-op (404)
  // outside a seeded dev run.
  ;(function seedE2eToken() {
    try {
      var existing = globalObj.localStorage
        ? globalObj.localStorage.getItem("prezo:library-sync")
        : null
      if (existing) {
        var parsed = JSON.parse(existing)
        if (parsed && parsed.expiresAt && Date.parse(parsed.expiresAt) > Date.now()) {
          return
        }
      }
    } catch (error) {
      /* fall through to fetch */
    }
    try {
      globalObj
        .fetch(target + "/spike/e2e-token")
        .then(function (resp) {
          if (!resp.ok) {
            return null
          }
          return resp.json()
        })
        .then(function (data) {
          if (!data || !data.token || !data.expiresAt) {
            return
          }
          globalObj.localStorage.setItem(
            "prezo:library-sync",
            JSON.stringify({
              token: data.token,
              expiresAt: data.expiresAt,
              apiBaseUrl: data.apiBaseUrl || "",
            })
          )
          post("e2e-token-seeded", { expiresAt: data.expiresAt })
        })
        .catch(function () {})
    } catch (error) {
      /* no fetch — nothing to seed */
    }
  })()

  var resizeTimer = null
  globalObj.addEventListener("resize", function () {
    if (resizeTimer) {
      globalObj.clearTimeout(resizeTimer)
    }
    resizeTimer = globalObj.setTimeout(function () {
      resizeTimer = null
      post("resize", {
        w: globalObj.innerWidth,
        h: globalObj.innerHeight,
        dpr: globalObj.devicePixelRatio || null,
      })
    }, 200)
  })

  doc.addEventListener("visibilitychange", function () {
    post("visibility", { visibility: doc.visibilityState })
  })

  // Mirror the wrapper page's status pill into the timeline — shows how far
  // the wrapper's init progressed (initializing → loading → connected /
  // not signed in / error) without touching wrapper code.
  function watchStatusPill() {
    var label = doc.querySelector("#status .status-label")
    if (!label) {
      globalObj.setTimeout(watchStatusPill, 500)
      return
    }
    var lastText = ""
    var report = function () {
      var text = String(label.textContent || "").trim()
      if (text && text !== lastText) {
        lastText = text
        post("wrapper-status", { status: text })
      }
    }
    report()
    try {
      new MutationObserver(report).observe(label, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    } catch (error) {
      /* observer unavailable — initial value already posted */
    }
  }
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", watchStatusPill)
  } else {
    watchStatusPill()
  }
  globalObj.addEventListener("pagehide", function (event) {
    beacon("pagehide", { persisted: Boolean(event && event.persisted) })
  })
  globalObj.addEventListener("beforeunload", function () {
    beacon("beforeunload", {})
  })
  globalObj.addEventListener("freeze", function () {
    beacon("freeze", {})
  })

  globalObj.setInterval(function () {
    heartbeatCount += 1
    lastEmbedId = peekEmbedId() || lastEmbedId
    var rafDelta = rafCount
    rafCount = 0
    var base = {
      n: heartbeatCount,
      visibility: doc.visibilityState,
      focused: typeof doc.hasFocus === "function" ? doc.hasFocus() : null,
      raf: rafDelta,
      w: globalObj.innerWidth,
      h: globalObj.innerHeight,
    }
    if (viewCheckPending && Date.now() - viewCheckStartedAt < VIEW_CHECK_STALL_MS) {
      base.view = "pending"
      post("heartbeat", base)
      return
    }
    var stalled = viewCheckPending
    viewCheckPending = true
    viewCheckStartedAt = Date.now()
    var ticket = viewCheckStartedAt
    getActiveView(function (view) {
      getSlideRange(function (slide) {
        if (viewCheckStartedAt === ticket) {
          viewCheckPending = false
        }
        base.view = stalled ? view + " (after stall)" : view
        base.slide = slide
        post("heartbeat", base)
      })
    })
  }, HEARTBEAT_MS)

  // E2E diagnosis: can this frame see the library-sync custom XML part the
  // host (taskpane in production, COM in the harness) wrote into the deck?
  function checkCustomXml(label) {
    try {
      var parts = globalObj.Office.context.document.customXmlParts
      if (!parts || typeof parts.getByNamespaceAsync !== "function") {
        post("customxml-check", { at: label, result: "api-unavailable" })
        return
      }
      parts.getByNamespaceAsync("https://prezo.app/library-sync", function (result) {
        if (!result || result.status !== globalObj.Office.AsyncResultStatus.Succeeded) {
          post("customxml-check", {
            at: label,
            result: "error:" + String(result && result.error && result.error.message),
          })
          return
        }
        var found = result.value || []
        if (found.length === 0) {
          post("customxml-check", { at: label, result: "no-parts" })
          return
        }
        try {
          found[0].getXmlAsync(function (xmlResult) {
            var ok = xmlResult && xmlResult.status === globalObj.Office.AsyncResultStatus.Succeeded
            var xml = ok ? String(xmlResult.value || "") : ""
            post("customxml-check", {
              at: label,
              result: "parts:" + found.length,
              xmlLen: xml.length,
              hasToken: xml.indexOf("<token>") !== -1 || /token/i.test(xml),
            })
          })
        } catch (error) {
          post("customxml-check", { at: label, result: "getXml-threw:" + String(error && error.message) })
        }
      })
    } catch (error) {
      post("customxml-check", { at: label, result: "threw:" + String(error && error.message) })
    }
  }

  if (globalObj.Office && typeof globalObj.Office.onReady === "function") {
    globalObj.Office.onReady(function (info) {
      checkCustomXml("ready")
      globalObj.setTimeout(function () {
        checkCustomXml("ready+6s")
      }, 6000)
      globalObj.setTimeout(function () {
        checkCustomXml("ready+15s")
      }, 15000)
      var diagnostics = {}
      try {
        var diag = globalObj.Office.context && globalObj.Office.context.diagnostics
        if (diag) {
          diagnostics = { host: String(diag.host), platform: String(diag.platform), version: String(diag.version) }
        }
      } catch (error) {
        /* diagnostics unavailable */
      }
      lastEmbedId = peekEmbedId() || lastEmbedId
      post("office-ready", {
        host: info && info.host ? String(info.host) : null,
        platform: info && info.platform ? String(info.platform) : null,
        diagHost: diagnostics.host || null,
        diagPlatform: diagnostics.platform || null,
        diagVersion: diagnostics.version || null,
        docUrl:
          officeDocumentReady() && typeof globalObj.Office.context.document.url === "string"
            ? globalObj.Office.context.document.url
            : null,
      })

      getActiveView(function (view) {
        post("active-view", { via: "initial", view: view })
      })

      if (officeDocumentReady() && typeof globalObj.Office.context.document.addHandlerAsync === "function") {
        try {
          globalObj.Office.context.document.addHandlerAsync(
            globalObj.Office.EventType.ActiveViewChanged,
            function (args) {
              post("active-view", {
                via: "changed",
                view: args && args.activeView ? String(args.activeView) : "unknown",
              })
            },
            function (result) {
              var ok = result && result.status === globalObj.Office.AsyncResultStatus.Succeeded
              post("handler-registered", {
                ok: Boolean(ok),
                error: ok ? null : String(result && result.error && result.error.message),
              })
            }
          )
        } catch (error) {
          post("handler-registered", { ok: false, error: "threw:" + String(error && error.message) })
        }
      } else {
        post("handler-registered", { ok: false, error: "addHandlerAsync unavailable" })
      }
    })
  } else {
    post("probe-error", { message: "Office.onReady unavailable at boot" })
  }
})(typeof window !== "undefined" ? window : this)
