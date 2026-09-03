# Batmeori backend

FastAPI service for the contract in `../docs/openapi.yaml`.

## Run

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

`/health` checks only that the process is alive. `/ready` returns `503` until
Supabase and the required server settings are configured.

The service uses the Supabase secret key only on the server. P0 has no worker
registration, phone, SMS, or worker login. `CO_PRESENT` uses the owner's PIN
session for an in-person briefing; `REMOTE` issues one anonymous language link
that expires after 24 hours. Raw audio and token hashes are never exposed.

With `DEMO_FALLBACK=1`, only the three checked-in synthetic WAV fixtures under
`../evals/audio/` are accepted. This is a clearly marked demo path, not a live
STT/LLM provider. Leave it at `0` until server-side providers are configured.
