"""Collector for the embed slideshow-lifecycle spike.

Receives timestamped events from the content add-in's probe
(frontend-addin/public/embed/spike-lifecycle-probe.js) and from the
slideshow driver script's markers, keeps them in a bounded in-memory ring
buffer, appends them to a JSONL file under settings.data_dir, and serves a
live viewer at GET /spike.

Unauthenticated by design: the probe runs before any auth exists (including
cold-loading inside a slideshow), and the driver posts markers from plain
PowerShell. Exposure is bounded — fixed-size buffer, no reads of any other
store, dev-only data. Remove together with the probe when the auto poll
view control spike concludes.
"""

from __future__ import annotations

import json
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse

from ..config import settings

router = APIRouter(prefix="/spike", tags=["spike"])

_MAX_EVENTS = 10000
_events: deque[dict[str, Any]] = deque(maxlen=_MAX_EVENTS)
_seq = 0


def _log_path() -> Path:
    directory = Path(settings.data_dir) / "spike"
    directory.mkdir(parents=True, exist_ok=True)
    return directory / "embed-lifecycle.jsonl"


@router.post("/lifecycle")
async def ingest_event(request: Request) -> dict[str, Any]:
    # sendBeacon delivers text/plain bodies, fetch delivers application/json;
    # parse the raw body instead of trusting the content type.
    raw = await request.body()
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return JSONResponse(status_code=400, content={"detail": "body must be JSON"})  # type: ignore[return-value]
    if not isinstance(payload, dict):
        return JSONResponse(status_code=400, content={"detail": "body must be a JSON object"})  # type: ignore[return-value]

    global _seq
    _seq += 1
    event = {
        **payload,
        "server_seq": _seq,
        "server_ts": datetime.now(timezone.utc).isoformat(),
    }
    _events.append(event)
    try:
        with _log_path().open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    except OSError:
        pass
    return {"ok": True, "server_seq": _seq}


@router.get("/lifecycle")
async def list_events(after: int = 0, limit: int = 2000) -> dict[str, Any]:
    limit = max(1, min(limit, _MAX_EVENTS))
    items = [event for event in _events if event["server_seq"] > after][:limit]
    return {"events": items, "last_seq": _seq}


@router.delete("/lifecycle")
async def clear_events() -> dict[str, Any]:
    cleared = len(_events)
    _events.clear()
    log_path = _log_path()
    rotated = None
    if log_path.exists():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        rotated = log_path.with_name(f"embed-lifecycle-{stamp}.jsonl")
        try:
            log_path.rename(rotated)
        except OSError:
            rotated = None
    return {"cleared": cleared, "rotated_to": str(rotated) if rotated else None}


_VIEWER_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Embed lifecycle spike</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 13px/1.45 ui-monospace, Consolas, monospace; background: #0d1117; color: #d7dde4; }
  header { display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: #161b22; position: sticky; top: 0; flex-wrap: wrap; }
  header h1 { font-size: 14px; margin: 0 12px 0 0; color: #f0f4f8; }
  button, input { font: inherit; background: #21262d; color: inherit; border: 1px solid #30363d; border-radius: 6px; padding: 4px 10px; }
  button:hover { background: #30363d; cursor: pointer; }
  #instances { display: flex; gap: 10px; padding: 10px 14px; flex-wrap: wrap; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 8px 12px; min-width: 210px; }
  .card b { color: #79c0ff; }
  .card .dead { color: #f85149; }
  .card .alive { color: #56d364; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 3px 10px; border-bottom: 1px solid #21262d; white-space: nowrap; }
  td.detail { white-space: normal; color: #9da7b3; }
  tr.marker td { color: #e3b341; font-weight: 600; }
  tr.boot td { color: #56d364; }
  tr.terminal td { color: #f85149; }
  tr.view td { color: #79c0ff; }
</style>
</head>
<body>
<header>
  <h1>Embed lifecycle spike</h1>
  <button id="pause">Pause</button>
  <button id="clear">Clear run</button>
  <input id="marker-label" placeholder="marker label" size="28" />
  <button id="mark">Add marker</button>
  <span id="status"></span>
</header>
<div id="instances"></div>
<table>
  <thead><tr><th>server_ts</th><th>instance</th><th>embedId</th><th>event</th><th>detail</th></tr></thead>
  <tbody id="rows"></tbody>
</table>
<script>
  const rows = document.getElementById('rows')
  const cards = document.getElementById('instances')
  const statusEl = document.getElementById('status')
  let after = 0
  let paused = false
  const instances = new Map()
  const short = (value) => value ? String(value).slice(0, 8) : '—'

  const detailFor = (e) => {
    const skip = new Set(['event','instanceId','embedId','seq','tMono','wall','server_seq','server_ts'])
    return Object.keys(e).filter(k => !skip.has(k)).map(k => k + '=' + JSON.stringify(e[k])).join(' ')
  }

  const classFor = (e) => {
    if (e.event === 'marker') return 'marker'
    if (e.event === 'boot' || e.event === 'office-ready') return 'boot'
    if (e.event === 'pagehide' || e.event === 'beforeunload' || e.event === 'freeze') return 'terminal'
    if (e.event === 'active-view' || e.event === 'handler-registered') return 'view'
    return ''
  }

  const render = (events) => {
    for (const e of events) {
      if (e.instanceId) {
        const info = instances.get(e.instanceId) || { count: 0 }
        info.count += 1
        info.lastTs = Date.parse(e.server_ts)
        if (e.embedId) info.embedId = e.embedId
        if (e.event === 'heartbeat' || e.event === 'active-view') info.view = e.view
        if (e.event === 'pagehide' || e.event === 'beforeunload') info.terminated = true
        if (e.event === 'boot') info.bootTs = e.server_ts
        instances.set(e.instanceId, info)
      }
      const tr = document.createElement('tr')
      tr.className = classFor(e)
      tr.innerHTML = '<td>' + e.server_ts.replace('T', ' ').slice(11, 23) + '</td><td>' + short(e.instanceId) +
        '</td><td>' + short(e.embedId) + '</td><td>' + e.event + '</td><td class="detail">' + detailFor(e) + '</td>'
      rows.prepend(tr)
    }
    while (rows.children.length > 600) rows.removeChild(rows.lastChild)
    const now = Date.now()
    cards.innerHTML = ''
    for (const [id, info] of instances) {
      const age = ((now - info.lastTs) / 1000).toFixed(1)
      const state = info.terminated ? '<span class="dead">ended</span>' :
        (now - info.lastTs > 5000 ? '<span class="dead">silent ' + age + 's</span>' : '<span class="alive">live</span>')
      cards.innerHTML += '<div class="card"><b>' + short(id) + '</b> ' + state +
        '<br/>embedId ' + short(info.embedId) + '<br/>view ' + (info.view || '?') +
        '<br/>' + info.count + ' events, last ' + age + 's ago</div>'
    }
  }

  const tick = async () => {
    if (paused) return
    try {
      const res = await fetch('/spike/lifecycle?after=' + after)
      const data = await res.json()
      if (data.events.length) {
        after = data.events[data.events.length - 1].server_seq
        render(data.events)
      }
      statusEl.textContent = 'seq ' + data.last_seq
    } catch (err) {
      statusEl.textContent = 'collector unreachable'
    }
  }
  setInterval(tick, 1000)
  tick()

  document.getElementById('pause').onclick = (e) => { paused = !paused; e.target.textContent = paused ? 'Resume' : 'Pause' }
  document.getElementById('clear').onclick = async () => {
    await fetch('/spike/lifecycle', { method: 'DELETE' })
    rows.innerHTML = ''; cards.innerHTML = ''; instances.clear(); after = 0
  }
  document.getElementById('mark').onclick = async () => {
    const label = document.getElementById('marker-label').value || 'mark'
    await fetch('/spike/lifecycle', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'marker', label }) })
    document.getElementById('marker-label').value = ''
  }
</script>
</body>
</html>
"""


@router.get("/e2e-token")
async def e2e_token() -> Any:
    """Library-sync token for the local end-to-end harness.

    PowerPoint content add-ins cannot read customXmlParts (Word-only common
    API), so the harness delivers the token the way production does: the
    probe writes it to the shared-origin localStorage the embed reads.
    Serves data only when run_spike_e2e_server.py has written a seed file —
    404s (and holds no secrets) everywhere else.
    """
    seed_path = Path(settings.data_dir) / "spike" / "e2e-seed.json"
    if not seed_path.exists():
        return JSONResponse(status_code=404, content={"detail": "no e2e seed"})
    try:
        seed = json.loads(seed_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return JSONResponse(status_code=404, content={"detail": "seed unreadable"})
    return {
        "token": seed.get("token"),
        "expiresAt": seed.get("token_expires_at"),
        "apiBaseUrl": seed.get("api_base"),
    }


@router.get("", include_in_schema=False)
async def viewer() -> HTMLResponse:
    return HTMLResponse(_VIEWER_HTML)
