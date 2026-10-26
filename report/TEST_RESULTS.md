# Verification results

> Latest configured run (27 October 2026): Node.js 22.18.0 `npm test` — **16 passed, 0 failed, 0 skipped**, including the live Supabase `search_events` RPC smoke test. Playwright — **3 passed**. The sign-in diagnostic confirmed the Google popup opens and the configured API config/me/events endpoints return HTTP 200; no Google account was selected, so a complete authenticated session was not exercised.

> Current verification for the Supabase/Firebase working implementation (27 October 2026): `npm test` under Node 22.18.0 reports 13 passed, 0 failed, 1 skipped (live Supabase integration requires credentials). Playwright reports 3 passed, including responsive and axe checks. Historical MySQL results below refer to the original supplied project and are not evidence for the current implementation.

Verified on 26 October 2026 against real MySQL 8.0.46, Node.js 24.22.1, and Chromium 153.

- API: **13 subtests passed**; Node reports 14 tests including the parent test.
- Browser: **4 tests passed**. Student search, category filters, save persistence after reload, booking, cancellation; organizer create/edit/delete and attendee view; 390px mobile overflow and keyboard checks; axe on home and sign-in.
- Accessibility: zero automated WCAG 2 A/AA and WCAG 2.1 AA violations in the two scanned states. This does not establish full-site WCAG conformance.
- Desktop and mobile screenshots inspected. Main body and form text are 16px; smaller labels and metadata use explicit contrast and spacing.
- Password hashes and session data are stored in MySQL. No browser localStorage database is used.
- Concurrent requests to the same single-seat event produced one success and one capacity error; the database contained exactly one registration.
- Source was formatted using Prettier; Node syntax checks passed.

Raw successful test output is included in api-test-output.txt and ui-test-output.txt. Tests need a running local MySQL database; browser tests also need the Node app running. Test-created API users and events are removed in cleanup. Browser tests use seeded demo accounts. Docker configuration is provided but was not executed here. Screen-reader behavior and a complete manual accessibility audit were not tested.
