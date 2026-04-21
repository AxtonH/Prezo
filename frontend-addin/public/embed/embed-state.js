;(() => {
  const NAMESPACE = "https://prezo.app/game-embed"
  const STORAGE_KEY = "prezo:game-embed"
  const STORAGE_VERSION = 1

  const normalize = (value) => {
    if (!value || typeof value !== "object") {
      return { sessionId: "", pollId: "", updatedAt: "" }
    }
    return {
      sessionId: typeof value.sessionId === "string" ? value.sessionId : "",
      pollId: typeof value.pollId === "string" ? value.pollId : "",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
    }
  }

  const readLocalStorage = () => {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return null
      }
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return null
      }
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.version !== STORAGE_VERSION) {
        return null
      }
      return normalize(parsed.state)
    } catch {
      return null
    }
  }

  const writeLocalStorage = (state) => {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return
      }
      if (!state.sessionId && !state.pollId) {
        window.localStorage.removeItem(STORAGE_KEY)
        return
      }
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: STORAGE_VERSION, state })
      )
    } catch {
      // localStorage may be blocked — custom XML fallback still runs.
    }
  }

  const escapeXml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")

  const buildXml = (state) => {
    const sessionTag = state.sessionId
      ? `<sessionId>${escapeXml(state.sessionId)}</sessionId>`
      : ""
    const pollTag = state.pollId ? `<pollId>${escapeXml(state.pollId)}</pollId>` : ""
    const updatedTag = state.updatedAt
      ? `<updatedAt>${escapeXml(state.updatedAt)}</updatedAt>`
      : ""
    return `<?xml version="1.0" encoding="UTF-8"?>
<prezoGameEmbed xmlns="${NAMESPACE}">
  ${sessionTag}
  ${pollTag}
  ${updatedTag}
</prezoGameEmbed>`
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

  const parseXml = (xml) => {
    try {
      const doc = new DOMParser().parseFromString(xml, "application/xml")
      const readNode = (name) =>
        doc.getElementsByTagNameNS(NAMESPACE, name)[0]?.textContent ||
        doc.getElementsByTagName(name)[0]?.textContent ||
        ""
      return normalize({
        sessionId: readNode("sessionId"),
        pollId: readNode("pollId"),
        updatedAt: readNode("updatedAt")
      })
    } catch {
      return null
    }
  }

  const readCustomXml = async () => {
    try {
      const parts = await getCommonParts()
      if (!parts.length) {
        return null
      }
      const xml = await readPartXml(parts[0])
      return parseXml(xml)
    } catch {
      return null
    }
  }

  const writeCustomXml = async (state) => {
    if (!hasCommonCustomXmlParts()) {
      return
    }
    const xml = buildXml(state)
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
    const fromLocal = readLocalStorage()
    if (fromLocal?.sessionId) {
      return fromLocal
    }
    const fromXml = await readCustomXml()
    if (fromXml?.sessionId) {
      writeLocalStorage(fromXml)
      return fromXml
    }
    return fromLocal || { sessionId: "", pollId: "", updatedAt: "" }
  }

  const save = async (partial) => {
    const current = readLocalStorage() || { sessionId: "", pollId: "", updatedAt: "" }
    const next = normalize({
      sessionId:
        typeof partial?.sessionId === "string" ? partial.sessionId : current.sessionId,
      pollId: typeof partial?.pollId === "string" ? partial.pollId : current.pollId,
      updatedAt: new Date().toISOString()
    })
    writeLocalStorage(next)
    await writeCustomXml(next)
    return next
  }

  const clear = async () => save({ sessionId: "", pollId: "" })

  const onExternalChange = (callback) => {
    if (typeof callback !== "function" || typeof window === "undefined") {
      return () => {}
    }
    const handler = (event) => {
      if (event.key !== STORAGE_KEY) {
        return
      }
      try {
        const parsed = event.newValue ? JSON.parse(event.newValue) : null
        callback(parsed?.state ? normalize(parsed.state) : null)
      } catch {
        callback(null)
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }

  window.PrezoEmbedState = { load, save, clear, onExternalChange }
})()
