;(() => {
  const NAMESPACE = "https://prezo.app/game-embed"
  const STORAGE_KEY = "prezo:game-embed"
  const STORAGE_VERSION = 1
  // Lock key lives in localStorage (shared per origin) so any currently-running
  // embed in the same PowerPoint session is visible to every other embed on the
  // same machine. The XML part is presentation-scoped and can't distinguish
  // instances, so this lock is what prevents a newly-added embed from
  // inheriting the first embed's state.
  const CLAIM_KEY = "prezo:game-embed:claim"
  const CLAIM_TTL_MS = 15000
  const HEARTBEAT_MS = 5000

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
      if (isEmpty(state)) {
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
    const tag = (name, value) =>
      value ? `<${name}>${escapeXml(value)}</${name}>` : ""
    return `<?xml version="1.0" encoding="UTF-8"?>
<prezoGameEmbed xmlns="${NAMESPACE}">
  ${tag("sessionId", state.sessionId)}
  ${tag("pollId", state.pollId)}
  ${tag("artifactName", state.artifactName)}
  ${tag("presentMode", state.presentMode ? "1" : "")}
  ${tag("updatedAt", state.updatedAt)}
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
        artifactName: readNode("artifactName"),
        presentMode: readNode("presentMode") === "1",
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

  const generateInstanceId = () => {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID()
      }
    } catch {}
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  const instanceId = generateInstanceId()
  let ownsClaim = false
  let heartbeatTimer = null

  const readClaim = () => {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return null
      }
      const raw = window.localStorage.getItem(CLAIM_KEY)
      if (!raw) {
        return null
      }
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object") {
        return null
      }
      const ownerId = typeof parsed.ownerId === "string" ? parsed.ownerId : ""
      const lastSeenAt = Number(parsed.lastSeenAt)
      if (!ownerId || !Number.isFinite(lastSeenAt)) {
        return null
      }
      return { ownerId, lastSeenAt }
    } catch {
      return null
    }
  }

  const writeClaim = (ownerId) => {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return
      }
      window.localStorage.setItem(
        CLAIM_KEY,
        JSON.stringify({ ownerId, lastSeenAt: Date.now() })
      )
    } catch {}
  }

  const clearClaim = () => {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return
      }
      window.localStorage.removeItem(CLAIM_KEY)
    } catch {}
  }

  const claimIsActive = (claim) =>
    Boolean(claim) && Date.now() - claim.lastSeenAt < CLAIM_TTL_MS

  const tryClaim = () => {
    const existing = readClaim()
    if (claimIsActive(existing) && existing.ownerId !== instanceId) {
      return false
    }
    writeClaim(instanceId)
    // Short delay + re-read lets us detect a race where two embeds boot in the
    // same tick and both write their own ID; the last writer wins and the loser
    // gives up.
    const confirm = readClaim()
    if (!confirm || confirm.ownerId !== instanceId) {
      return false
    }
    ownsClaim = true
    startHeartbeat()
    return true
  }

  const startHeartbeat = () => {
    if (heartbeatTimer || typeof window === "undefined") {
      return
    }
    heartbeatTimer = window.setInterval(() => {
      const existing = readClaim()
      if (existing && existing.ownerId !== instanceId) {
        ownsClaim = false
        if (heartbeatTimer) {
          window.clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
        return
      }
      writeClaim(instanceId)
    }, HEARTBEAT_MS)
  }

  const releaseClaim = () => {
    if (!ownsClaim) {
      return
    }
    const existing = readClaim()
    if (existing && existing.ownerId === instanceId) {
      clearClaim()
    }
    ownsClaim = false
    if (heartbeatTimer && typeof window !== "undefined") {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", releaseClaim)
    window.addEventListener("beforeunload", releaseClaim)
  }

  const load = async () => {
    // Only the first embed to load in a PowerPoint session may claim ownership
    // of the saved state. Subsequent embeds (e.g. a second one added to the
    // deck during the same session) see an active heartbeat and start blank
    // so they don't inherit the first embed's session/poll/artifact.
    if (!tryClaim()) {
      return { ...EMPTY_STATE }
    }
    const fromLocal = readLocalStorage()
    const fromXml = await readCustomXml()
    // Custom XML is the authoritative source because it travels with the
    // .pptx across machines. localStorage is only a fast-path mirror.
    if (fromXml && !isEmpty(fromXml)) {
      writeLocalStorage(fromXml)
      return fromXml
    }
    return fromLocal || { ...EMPTY_STATE }
  }

  const save = async (partial) => {
    // Embeds that didn't win the claim shouldn't persist state — they'd
    // overwrite the owning embed's data.
    if (!ownsClaim) {
      return { ...EMPTY_STATE }
    }
    const current = readLocalStorage() || { ...EMPTY_STATE }
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
    writeLocalStorage(next)
    await writeCustomXml(next)
    return next
  }

  const clear = async () =>
    save({ sessionId: "", pollId: "", artifactName: "", presentMode: false })

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

  const ownsActiveClaim = () => ownsClaim

  window.PrezoEmbedState = { load, save, clear, onExternalChange, ownsActiveClaim }
})()
