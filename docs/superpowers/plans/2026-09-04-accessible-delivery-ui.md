# Accessible Delivery UI Implementation Plan

**Goal:** Make worker start, owner delivery, reading hierarchy, desktop worker navigation, and Korean landing copy clearer without changing product contracts.

**Scope:** `src/webapp/WorkerScreens.tsx`, `src/webapp/OwnerScreens.tsx`, `src/webapp/AppShell.tsx`, `src/webapp/ScreenUI.tsx`, landing copy/components, and focused Playwright tests only.

1. Add a failing worker-start test, then reduce first-screen choices to a primary first-step action with secondary detail.
2. Add a failing owner-delivery test, then reveal one delivery method at a time while retaining QR, in-person, and language-link safeguards.
3. Add failing readability/navigation tests, increase FactRow line height, and remove worker-only desktop side rail.
4. Add failing landing assertions, revise Korean copy and remove forced line breaks that create awkward wrapping.
5. Run focused tests, then complete the web test suite and production build.
