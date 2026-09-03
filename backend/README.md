# Batmeori backend

FastAPI service for the contract in `../docs/openapi.yaml`.

## Run

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

`/health` checks only that the process is alive. `/ready` returns `503` until
Supabase and the required server settings are configured.

The service uses the Supabase secret key only on the server. P0 has no worker
registration, phone, SMS, or worker login. `CO_PRESENT` uses the owner's PIN
session for an in-person briefing; `REMOTE` issues one anonymous language link
that expires after 24 hours. Raw audio and token hashes are never exposed.

The Node bridge needs its server-only provider environment (`OPENAI_API_KEY`,
optional `OPENAI_MODEL`, and optional `OPENAI_TTS_VOICE`). `DEMO_FALLBACK=1`
only permits local public URL defaults for the UI demo; it never replaces Node
STT, structure, translation, visual matching, or TTS.

## Deploy seed and visual assets

After migrations, set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`OWNER_SESSION_SECRET`, `PUBLIC_WEB_BASE_URL`, `PUBLIC_API_BASE_URL`, the Node
provider environment, and deployment secret `DEMO_OWNER_PIN`, then run:

```powershell
python .\seed_demo_owner.py
python .\import_visual_assets.py
```

The owner seed reads its PIN only from the environment and never prints it.
`import_visual_assets.py --check` validates the checked-in manifest without a
database call; normal execution makes one transaction-safe service-role RPC.
