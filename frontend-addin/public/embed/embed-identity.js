/**
 * Resolves a stable, per-instance embed id for a PowerPoint content add-in.
 *
 * The id lives in Office.context.document.settings["embedId"], which the
 * PowerPoint host serializes into a <we:webextensionproperty> inside the
 * .pptx. That property is per-instance (verified empirically — instance 1
 * can hold "A" while instance 2 holds "B"). Any user who opens the file
 * with the add-in installed reads back the same id from the same instance.
 *
 * Exposed as a global (window.PrezoEmbedIdentity) so the classic-script
 * embed page can call it without a module loader.
 */
(function installPrezoEmbedIdentity(globalObj) {
  "use strict"

  var SETTINGS_KEY = "embedId"

  function generateUuid() {
    if (globalObj.crypto && typeof globalObj.crypto.randomUUID === "function") {
      return globalObj.crypto.randomUUID()
    }
    // Fallback — RFC4122 v4-shaped, seeded by Math.random (good enough for an
    // identity token that we only need to be collision-resistant in practice).
    var template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    return template.replace(/[xy]/g, function (character) {
      var random = (Math.random() * 16) | 0
      var value = character === "x" ? random : (random & 0x3) | 0x8
      return value.toString(16)
    })
  }

  function isOfficeReady() {
    return Boolean(
      globalObj.Office &&
        globalObj.Office.context &&
        globalObj.Office.context.document &&
        globalObj.Office.context.document.settings
    )
  }

  function readExistingEmbedId() {
    if (!isOfficeReady()) {
      return null
    }
    try {
      var value = globalObj.Office.context.document.settings.get(SETTINGS_KEY)
      if (typeof value === "string" && value.length > 0) {
        return value
      }
      return null
    } catch (error) {
      return null
    }
  }

  function saveSettingsAsync() {
    return new Promise(function (resolve) {
      if (!isOfficeReady()) {
        resolve({ ok: false, error: "Office not ready" })
        return
      }
      try {
        globalObj.Office.context.document.settings.saveAsync(function (result) {
          if (
            result &&
            result.status === globalObj.Office.AsyncResultStatus.Succeeded
          ) {
            resolve({ ok: true })
            return
          }
          var detail =
            result && result.error && result.error.message
              ? result.error.message
              : "saveAsync failed"
          resolve({ ok: false, error: detail })
        })
      } catch (error) {
        resolve({ ok: false, error: String(error && error.message) || "saveAsync threw" })
      }
    })
  }

  /**
   * Resolve the embed id. If one already exists in settings, return it as
   * existed=true. If not, mint a new uuid, set it, and saveAsync. The
   * returned object reports persistence status so callers can show a clear
   * error when saveAsync fails (e.g. read-only / protected view).
   */
  async function resolveEmbedIdentity() {
    if (!isOfficeReady()) {
      return {
        id: null,
        existed: false,
        persisted: false,
        error: "Office not ready",
      }
    }
    var existing = readExistingEmbedId()
    if (existing) {
      return { id: existing, existed: true, persisted: true, error: null }
    }
    var minted = generateUuid()
    try {
      globalObj.Office.context.document.settings.set(SETTINGS_KEY, minted)
    } catch (error) {
      return {
        id: null,
        existed: false,
        persisted: false,
        error: String(error && error.message) || "settings.set threw",
      }
    }
    var saveResult = await saveSettingsAsync()
    return {
      id: minted,
      existed: false,
      persisted: saveResult.ok,
      error: saveResult.ok ? null : saveResult.error,
    }
  }

  /**
   * Write a new embed id into settings, overwriting any existing value, and
   * saveAsync. Used when the fork logic decides this instance must adopt a
   * fresh uuid because it shares a uuid with a sibling (slide duplicate or
   * copy-paste). Returns the same shape as resolveEmbedIdentity.
   */
  async function replaceEmbedIdentity(nextId) {
    if (!isOfficeReady()) {
      return {
        id: null,
        existed: false,
        persisted: false,
        error: "Office not ready",
      }
    }
    if (typeof nextId !== "string" || nextId.length === 0) {
      return {
        id: null,
        existed: false,
        persisted: false,
        error: "replaceEmbedIdentity requires a non-empty id",
      }
    }
    try {
      globalObj.Office.context.document.settings.set(SETTINGS_KEY, nextId)
    } catch (error) {
      return {
        id: null,
        existed: false,
        persisted: false,
        error: String(error && error.message) || "settings.set threw",
      }
    }
    var saveResult = await saveSettingsAsync()
    return {
      id: nextId,
      existed: false,
      persisted: saveResult.ok,
      error: saveResult.ok ? null : saveResult.error,
    }
  }

  globalObj.PrezoEmbedIdentity = {
    SETTINGS_KEY: SETTINGS_KEY,
    resolve: resolveEmbedIdentity,
    replace: replaceEmbedIdentity,
    peek: readExistingEmbedId,
    generateUuid: generateUuid,
  }
})(typeof window !== "undefined" ? window : this)
