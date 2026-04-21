;(() => {
  const NAMESPACE = "https://prezo.app/game-embed"
  const STORAGE_KEY = "prezo:game-embed"
  const STORAGE_VERSION = 2
  // Slide tag key used to mint a stable per-embed identity. Slide IDs alone
  // aren't guaranteed stable across saves/machines, so each embed writes its
  // own UUID into the host slide's tag collection on first load and uses that
  // UUID to key its state. The tag travels with the .pptx.
  const EMBED_TAG_KEY = "prezoEmbedId"
  // Used when the PowerPoint API isn't available (older hosts, snapshot mode)
  // so the embed still works with a single shared state entry.
  const FALLBACK_EMBED_ID = "__fallback__"

  const EMPTY_STATE = {
    sessionId: "",
    pollId: "",
    artifactName: "",
    presentMode: false,
    updatedAt: ""
  }

  const normalize = (value) => {
    if (!value || typeof value !== "object") {
      return { ...EMPTY_STATE }
    }
    return {
      sessionId: typeof value.sessionId === "string" ? value.sessionId : "",
      pollId: typeof value.pollId === "string" ? value.pollId : "",
      artifactName: typeof value.artifactName === "string" ? value.artifactName : "",
      presentMode:
        value.presentMode === true ||
        value.presentMode === "true" ||
        value.presentMode === 1 ||
        value.presentMode === "1",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
    }
  }

  const isEmpty = (state) =>
    !state.sessionId && !state.pollId && !state.artifactName && !state.presentMode

  const escapeXml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")

  const generateEmbedId = () => {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID()
      }
    } catch {}
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  const hasPowerPointRun = () =>
    typeof PowerPoint !== "undefined" && typeof PowerPoint.run === "function"

  // Resolve (and cache for the lifetime of this iframe) the UUID that
  // identifies *this* embed instance. First activation queries the host
  // slide's tag collection; if the tag exists we inherit the saved ID,
  // otherwise we mint a fresh UUID and write it back to the tag.
  //
  // Identity resolution is DEFERRED until activate() is called (typically
  // after a user click) because `getSelectedSlides()` returns the UI-selected
  // slide, not the embed's host slide. At presentation-open time only one
  // slide is selected, so if every embed queried immediately they would all
  // identify as the same slide. A user click on an embed selects that
  // embed's slide first, which is when identity can be resolved reliably.
  let embedIdPromise = null

  const resolveEmbedId = async () => {
    if (!hasPowerPointRun()) {
      return FALLBACK_EMBED_ID
    }
    try {
      return await PowerPoint.run(async (context) => {
        const slides = context.presentation.getSelectedSlides()
        slides.load("items/id")
        await context.sync()
        if (!slides.items.length) {
          return FALLBACK_EMBED_ID
        }
        const slide = slides.items[0]
        const tags = slide.tags
        tags.load("items/key,items/value")
        await context.sync()
        const existing = tags.items.find((t) => t.key === EMBED_TAG_KEY)
        if (existing && existing.value) {
          return existing.value
        }
        const fresh = generateEmbedId()
        slide.tags.add(EMBED_TAG_KEY, fresh)
        await context.sync()
        return fresh
      })
    } catch (error) {
      console.warn("Prezo embed state: failed to resolve embed ID, using fallback", error)
      return FALLBACK_EMBED_ID
    }
  }

  const activate = () => {
    if (!embedIdPromise) {
      embedIdPromise = resolveEmbedId()
    }
    return embedIdPromise
  }

  const getEmbedId = async () => {
    if (!embedIdPromise) {
      return null
    }
    return embedIdPromise
  }

  const isActivated = () => embedIdPromise !== null

  const readLocalAll = () => {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return {}
      }
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return {}
      }
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.version !== STORAGE_VERSION) {
        return {}
      }
      return parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {}
    } catch {
      return {}
    }
  }

  const writeLocalAll = (entries) => {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return
      }
      if (!entries || Object.keys(entries).length === 0) {
        window.localStorage.removeItem(STORAGE_KEY)
        return
      }
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: STORAGE_VERSION, entries })
      )
    } catch {
      // localStorage may be blocked — custom XML fallback still runs.
    }
  }

  const hasCommonCustomXmlParts = () =>
    typeof Office !== "undefined" && Boolean(Office?.context?.document?.customXmlParts)

  const getCommonParts = () =>
    new Promise((resolve, reject) => {
      if (!hasCommonCustomXmlParts()) {
        resolve([])
        return
      }
      Office.context.document.customXmlParts.getByNamespaceAsync(NAMESPACE, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value || [])
        } else {
          reject(result.error)
        }
      })
    })

  const readPartXml = (part) =>
    new Promise((resolve, reject) => {
      part.getXmlAsync((result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value || "")
        } else {
          reject(result.error)
        }
      })
    })

  const setPartXml = (part, xml) =>
    new Promise((resolve, reject) => {
      if (typeof part.setXmlAsync !== "function") {
        reject(new Error("CustomXmlPart.setXmlAsync is not available."))
        return
      }
      part.setXmlAsync(xml, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve()
        } else {
          reject(result.error)
        }
      })
    })

  const addPartXml = (xml) =>
    new Promise((resolve, reject) => {
      Office.context.document.customXmlParts.addAsync(xml, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve()
        } else {
          reject(result.error)
        }
      })
    })

  const parseAllStates = (xml) => {
    const map = new Map()
    try {
      const doc = new DOMParser().parseFromString(xml, "application/xml")
      const nsNodes = doc.getElementsByTagNameNS(NAMESPACE, "instance")
      const plainNodes = doc.getElementsByTagName("instance")
      const seen = new Set()
      const nodes = []
      for (const n of nsNodes) {
        nodes.push(n)
        seen.add(n)
      }
      for (const n of plainNodes) {
        if (!seen.has(n)) {
          nodes.push(n)
        }
      }
      for (const el of nodes) {
        const id = el.getAttribute("id")
        if (!id) {
          continue
        }
        const read = (name) =>
          el.getElementsByTagNameNS(NAMESPACE, name)[0]?.textContent ||
          el.getElementsByTagName(name)[0]?.textContent ||
          ""
        map.set(
          id,
          normalize({
            sessionId: read("sessionId"),
            pollId: read("pollId"),
            artifactName: read("artifactName"),
            presentMode: read("presentMode") === "1",
            updatedAt: read("updatedAt")
          })
        )
      }
    } catch {
      // Fall through with whatever we collected.
    }
    return map
  }

  const buildAllStatesXml = (map) => {
    const tag = (name, value) =>
      value ? `<${name}>${escapeXml(value)}</${name}>` : ""
    const instances = [...map.entries()]
      .filter(([, state]) => state && !isEmpty(state))
      .map(
        ([id, state]) =>
          `  <instance id="${escapeXml(id)}">` +
          tag("sessionId", state.sessionId) +
          tag("pollId", state.pollId) +
          tag("artifactName", state.artifactName) +
          tag("presentMode", state.presentMode ? "1" : "") +
          tag("updatedAt", state.updatedAt) +
          `</instance>`
      )
      .join("\n")
    return `<?xml version="1.0" encoding="UTF-8"?>
<prezoGameEmbed xmlns="${NAMESPACE}">
${instances}
</prezoGameEmbed>`
  }

  const readAllStatesFromXml = async () => {
    try {
      const parts = await getCommonParts()
      if (!parts.length) {
        return new Map()
      }
      const xml = await readPartXml(parts[0])
      return parseAllStates(xml)
    } catch {
      return new Map()
    }
  }

  const writeAllStatesToXml = async (map) => {
    if (!hasCommonCustomXmlParts()) {
      return
    }
    const xml = buildAllStatesXml(map)
    try {
      const parts = await getCommonParts()
      if (parts.length) {
        await setPartXml(parts[0], xml)
      } else {
        await addPartXml(xml)
      }
    } catch (error) {
      console.warn("Prezo embed state: failed to persist custom XML part", error)
    }
  }

  const load = async () => {
    const embedId = await getEmbedId()
    if (!embedId) {
      return { ...EMPTY_STATE }
    }
    const localAll = readLocalAll()
    const fromLocal = localAll[embedId] ? normalize(localAll[embedId]) : null
    const xmlStates = await readAllStatesFromXml()
    const fromXml = xmlStates.get(embedId)
    // Custom XML is authoritative because it travels with the .pptx across
    // machines. localStorage is only a fast-path mirror for this origin.
    if (fromXml && !isEmpty(fromXml)) {
      localAll[embedId] = fromXml
      writeLocalAll(localAll)
      return fromXml
    }
    return fromLocal || { ...EMPTY_STATE }
  }

  const save = async (partial) => {
    const embedId = await getEmbedId()
    if (!embedId) {
      // Not yet activated — silently drop. The shell will retry after the
      // user clicks to activate this embed.
      return { ...EMPTY_STATE }
    }
    const localAll = readLocalAll()
    const current = localAll[embedId] ? normalize(localAll[embedId]) : { ...EMPTY_STATE }
    const next = normalize({
      sessionId:
        typeof partial?.sessionId === "string" ? partial.sessionId : current.sessionId,
      pollId: typeof partial?.pollId === "string" ? partial.pollId : current.pollId,
      artifactName:
        typeof partial?.artifactName === "string"
          ? partial.artifactName
          : current.artifactName,
      presentMode:
        typeof partial?.presentMode === "boolean"
          ? partial.presentMode
          : current.presentMode,
      updatedAt: new Date().toISOString()
    })
    if (isEmpty(next)) {
      delete localAll[embedId]
    } else {
      localAll[embedId] = next
    }
    writeLocalAll(localAll)
    const xmlStates = await readAllStatesFromXml()
    if (isEmpty(next)) {
      xmlStates.delete(embedId)
    } else {
      xmlStates.set(embedId, next)
    }
    await writeAllStatesToXml(xmlStates)
    return next
  }

  const clear = async () =>
    save({ sessionId: "", pollId: "", artifactName: "", presentMode: false })

  const onExternalChange = (callback) => {
    if (typeof callback !== "function" || typeof window === "undefined") {
      return () => {}
    }
    const handler = async (event) => {
      if (event.key !== STORAGE_KEY) {
        return
      }
      try {
        const embedId = await getEmbedId()
        if (!embedId) {
          return
        }
        const parsed = event.newValue ? JSON.parse(event.newValue) : null
        const entries = parsed?.entries && typeof parsed.entries === "object" ? parsed.entries : {}
        const entry = entries[embedId]
        callback(entry ? normalize(entry) : null)
      } catch {
        callback(null)
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }

  // Retained for backwards compatibility with the previous claim-based API.
  // Per-embed keying means every instance owns its own state naturally, so
  // this always returns true now.
  const ownsActiveClaim = () => true

  window.PrezoEmbedState = {
    load,
    save,
    clear,
    onExternalChange,
    activate,
    isActivated,
    ownsActiveClaim
  }
})()
