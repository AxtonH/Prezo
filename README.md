# Prezo MVP

Minimal live Q&A + polls with a PowerPoint host add-in and a web audience page.

## Structure
- `backend` FastAPI API + WebSockets
- `frontend-addin` React host console (PowerPoint task pane)
- `frontend-audience` React audience page

## Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Optional environment variables (create `backend/.env`):
- `PUBLIC_BASE_URL` (default `http://localhost:5174`)
- `CORS_ORIGINS` (JSON array, default `["http://localhost:5173", "http://localhost:5174"]`)

## Frontend (Host Add-in)
```powershell
cd frontend-addin
npm install
npm run dev
```

Sideload the manifest in PowerPoint:
- `frontend-addin/manifest/manifest.xml`

The add-in points to `https://localhost:5173/` by default. For Office add-ins you will need HTTPS (self-signed cert or dev cert).

## Frontend (Audience)
```powershell
cd frontend-audience
npm install
npm run dev
```

Audience runs on `http://localhost:5174` by default. Join via:
- `http://localhost:5174/join/<SESSION_CODE>`

## Notes
- The backend is in-memory only for now. Restarting the server clears all sessions.
- For scaling, swap the store for Postgres + Redis pub/sub.
