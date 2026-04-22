/**
 * Thin fetch client for the backend /embed-instances API.
 *
 * Exposed as window.PrezoEmbedStateClient so the classic-script embed page
 * can use it without a module loader. All methods accept an explicit
 * `{ apiBase, token }` options object so the module stays decoupled from
 * wherever the caller stores its auth state.
 *
 * HTTP surface:
 *   POST   /embed-instances             create (id comes from caller)
 *   GET    /embed-instances/{embedId}   fetch state (also touches last_seen)
 *   PATCH  /embed-instances/{embedId}   update selected fields
 *
 * Returns plain parsed JSON. Throws on non-2xx with a typed error.
 */
(function installPrezoEmbedStateClient(globalObj) {
  "use strict"

  function buildUrl(apiBase, path) {
    var base = String(apiBase || "").replace(/\/$/, "")
    var trailing = path.startsWith("/") ? path : "/" + path
    return base + trailing
  }

  function buildHeaders(token) {
    var headers = { "Content-Type": "application/json" }
    if (token) {
      headers["Authorization"] = "Bearer " + token
    }
    return headers
  }

  function EmbedStateClientError(status, detail) {
    this.name = "EmbedStateClientError"
    this.status = status
    this.detail = detail
    this.message = "Embed state request failed (" + status + "): " + detail
  }
  EmbedStateClientError.prototype = Object.create(Error.prototype)

  async function parseJsonSafely(response) {
    var text = await response.text()
    if (!text) {
      return null
    }
    try {
      return JSON.parse(text)
    } catch (error) {
      return null
    }
  }

  async function requestEmbedStateEndpoint(options, method, path, body) {
    if (!options || !options.apiBase) {
      throw new EmbedStateClientError(0, "Missing apiBase")
    }
    var response
    try {
      response = await globalObj.fetch(buildUrl(options.apiBase, path), {
        method: method,
        headers: buildHeaders(options.token),
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      throw new EmbedStateClientError(
        0,
        "Network error: " + (error && error.message ? error.message : String(error))
      )
    }
    if (!response.ok) {
      var payload = await parseJsonSafely(response)
      var detail =
        payload && typeof payload.detail === "string"
          ? payload.detail
          : "HTTP " + response.status
      throw new EmbedStateClientError(response.status, detail)
    }
    if (response.status === 204) {
      return null
    }
    return parseJsonSafely(response)
  }

  function createEmbedInstance(options, payload) {
    return requestEmbedStateEndpoint(options, "POST", "/embed-instances", payload)
  }

  function fetchEmbedInstance(options, embedId) {
    var encoded = encodeURIComponent(embedId)
    return requestEmbedStateEndpoint(options, "GET", "/embed-instances/" + encoded)
  }

  function updateEmbedInstance(options, embedId, patch) {
    var encoded = encodeURIComponent(embedId)
    return requestEmbedStateEndpoint(
      options,
      "PATCH",
      "/embed-instances/" + encoded,
      patch
    )
  }

  /**
   * Loads the row for `embedId` if it exists, otherwise creates a minimal
   * row with the provided defaults and returns that. Useful as a single
   * call the embed page can make on first render: "give me my row,
   * creating it if this is the first time I'm loading."
   */
  async function ensureEmbedInstance(options, embedId, defaults) {
    try {
      return await fetchEmbedInstance(options, embedId)
    } catch (error) {
      if (!(error instanceof EmbedStateClientError) || error.status !== 404) {
        throw error
      }
    }
    var createBody = { id: embedId }
    if (defaults && typeof defaults === "object") {
      if (defaults.session_id) createBody.session_id = defaults.session_id
      if (defaults.poll_id) createBody.poll_id = defaults.poll_id
      if (defaults.artifact_kind) createBody.artifact_kind = defaults.artifact_kind
      if (defaults.screen_mode) createBody.screen_mode = defaults.screen_mode
      if (defaults.metadata) createBody.metadata = defaults.metadata
    }
    return createEmbedInstance(options, createBody)
  }

  globalObj.PrezoEmbedStateClient = {
    EmbedStateClientError: EmbedStateClientError,
    create: createEmbedInstance,
    fetch: fetchEmbedInstance,
    update: updateEmbedInstance,
    ensure: ensureEmbedInstance,
  }
})(typeof window !== "undefined" ? window : this)
