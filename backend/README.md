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

`/health` reports process liveness and the running source revision. `/ready`
returns `503` until the current DB contract, worker briefing package storage,
Node provider, and required public URL settings are ready.

The service uses the Supabase secret key only on the server. P0 has no worker
registration, phone, SMS, or worker login. `CO_PRESENT` uses the owner's PIN
session for an in-person briefing; `REMOTE` issues one anonymous language link
that expires after 24 hours. Raw audio and token hashes are never exposed.

The Node bridge needs its server-only provider environment (`OPENAI_API_KEY`,
optional `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TRANSCRIBE_VERIFICATION_MODEL`, `OPENAI_TRANSCRIBE_LOGPROB_THRESHOLD`, `OPENAI_TRANSCRIPT_REVIEW_MODEL`, and `OPENAI_TTS_VOICE`). `DEMO_FALLBACK=1`
only permits local public URL defaults for the UI demo; it never replaces Node
STT, structure, translation, visual matching, or TTS.

## Provision a farm and deploy visual assets

After migrations, set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`OWNER_SESSION_SECRET`, `PUBLIC_WEB_BASE_URL`, `PUBLIC_API_BASE_URL`,
`FRONTEND_ORIGINS`, and the Node provider environment. With Vercel's
same-origin `/api` rewrite, all three public URL settings must use the public
Vercel origin, not Render's direct origin. To issue or rotate one farm's access, set
`FARM_CODE`, `FARM_DISPLAY_NAME`, and `FARM_OWNER_PIN` only in the
operator environment, then run:

```powershell
python .\provision_farm_owner.py
python .\import_visual_assets.py
```

The provisioning command reads its PIN only from the environment and never
prints it. The farm code is not a secret; the PIN remains server-side input.
Keep `OWNER_SESSION_SECRET` stable across restarts and deployments. Rotating it
invalidates owner sessions, TodayWorkTeam QR URLs, TeamMember browser cookies,
and WorkerLinks; create a new team QR and reissue any remote links afterward.
`import_visual_assets.py --check` validates the checked-in manifest without a
database call; normal execution makes one transaction-safe service-role RPC.

`live_e2e.py` resends extracted cookies for its API checks, then runs
`scripts/check-live-browser-sessions.mjs` in isolated real browser contexts.
The browser check verifies owner login, subsequent authenticated requests,
anonymous team join, member cookie retention, and owner/member isolation
without injecting Cookie headers. Run against a Vercel preview to verify
the deployed rewrite; a local pass proves only the Vite proxy path.
It requires explicit `LIVE_API_BASE_URL`, `LIVE_FRONTEND_ORIGIN`, and
`LIVE_EXPECTED_REVISION`; there are no local defaults that can silently select
an old process.
