# Temporary team access and assignment acknowledgement

**Goal:** Start with work input, activate one team's management PIN and QR for 24 hours at first publish, and record explicit worker acknowledgement of each assigned version.

**Architecture:** Reuse existing farm isolation as an automatically created private boundary per temporary team. Preserve legacy farm authentication and immutable work/briefing contracts. Mutable assignment receipts drive in-app notifications and owner confirmation states.

**Tech Stack:** Existing FastAPI, PostgreSQL RPC/trigger, React, Playwright; no new product dependency.

**Spec:** `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/openapi.yaml`, `docs/DATA_MODEL.md`.

## Constraints

- User approved the team-level design; no repeated design approval.
- Two crops (onion/strawberry), two worker languages (vi/ne), quantity changes only.
- No reset or destructive migration; pending workspace expires in 1 hour, activated team in 24 hours.
- PIN and worker QR never share credentials. Owner/member isolation and publish safety gates remain.
- Confirmation means explicit acknowledgement, not task completion. OS push delivery is outside foreground polling's guarantee.

## Execution

- [x] Update authoritative product/domain/API/storage/failure contracts before implementation.
- [x] SQL: add temporary team fields and assignment receipt columns; service-role bootstrap/auth/ack RPCs; first-publish atomic activation and expiry guards. Run SQL tests through existing PGlite replay with wrong PIN, rollback, stale acknowledgement, expiry and isolation checks.
- [x] Backend: signed team claims, input-free `/owner/start`, link+PIN `/owner/team-session`, fixed-expiry team lookup, receipt read/ack routes. Write tests first and run backend unittest discovery.
- [x] Frontend: immediate recording, active-team access panel, PIN-only management route, persistent QR, vi/ne alerts and explicit acknowledgement, owner receipt labels. Update mocks and browser tests, preserving legacy fixture compatibility.
- [x] Integration: frontend contracts/build, SQL replay, backend and browser suites; inspect changes for expired/cross-team access and stale-version races.
- [x] Apply verified additive migration and deploy using established production projects if authorized access remains available. Report actual release and any delivery limits, never label foreground polling OS push. Migration 018 and application revision `a12aca0b059f2e57c37ee04d663188e8abdf3962` are live; real API assignment acknowledgements and the post-deployment browser cookie checks passed. Foreground notification only; OS push remains unimplemented.
