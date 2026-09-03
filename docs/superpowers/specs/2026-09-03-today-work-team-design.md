# Today Work Team Design

## Goal

Specify the future owner-present QR team flow without changing the current P0
contract: P0 has no worker registration or roster. The feature is P1 work and
must preserve onion-only, `vi|ne`, safety, and latest-`PUBLISHED` contracts
when it is implemented.

## Scope and ownership

`TodayWorkTeam` is a P1 ephemeral owner-owned roster for one farm workday.
Workers join through one QR link, select `vi|ne`, and enter a display
nickname. It is not a worker account, login, phone number, or recurring
profile. A `TodayTeamMember` can receive one or more owner-created
`TeamAssignment` values, each resolving a latest `PUBLISHED` WorkSession.

The backend owns QR token issue/expiry, nickname validation and storage,
membership reads, assignment persistence, authorization, and worker HTTP
responses. The frontend owns QR display, join form, owner roster, and
assignment controls. Frequent reusable workers are P1 because they require
retained identity and consent rules.

## AI boundary

AI never receives, infers, translates, stores, or uses a member nickname to
choose work. After backend authorization resolves a member's assigned,
validated `structure-v1`, it calls the existing
`workerBriefing(structure, languageCode)` with that member's selected `vi` or
`ne`. The result remains language-specific, source-traceable, safety-gated,
and cacheable by work content plus language; it contains no team identity.

The only AI-runtime repair in this change is to return the same owner
preflight fields after an audio supplement as after an initial audio draft.
This lets the backend apply the existing publish/override gate to the new
structure without duplicating AI safety reasoning.

## Delivery levels

- No roster (P0): owner chooses one language and gives the same briefing to
  the group using the existing `CO_PRESENT` flow.
- Today Work Team (P1): a temporary QR join link collects nickname and language;
  the owner sees the roster and assigns different WorkSessions when needed.
- Frequent workers: P1; owner selects consented saved workers. It is outside
  P0 and creates no current runtime or storage behavior.

## Failure and safety rules

An unassigned member receives no work. An invalid/expired join token is a
generalized external access failure. Team membership never bypasses the
existing `HIGH`/`UNKNOWN`, blocking ambiguity, schema, source-provenance, or
latest-version gates. The worker-facing response excludes transcript, raw
audio, risk assessment, join token, and other member data.
