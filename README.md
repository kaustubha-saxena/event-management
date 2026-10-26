# CampusFlow

CampusFlow helps students discover campus events, register for seats, save events, and access digital tickets. Organizers can manage events, review attendees, export reports, and check tickets in. The supplied source archive is preserved at `../_source_archive/campusflow`; this folder is the updated project.

## Features

- Responsive event discovery with search, category filters, and sorting.
- Google sign-in through Firebase Authentication and secure HttpOnly server session cookies.
- Supabase PostgreSQL persistence for profiles, events, registrations, saved events, and tickets.
- Organizer event management, attendee lists, attendance totals, and CSV export.
- One unpredictable digital QR ticket per active registration, encrypted at rest and invalidated on cancellation.
- Organizer ticket scanning with manual code entry fallback.
- Semantic HTML and accessible labels, status messages, dialogs, keyboard controls, and responsive styles.

All live functionality requires the Firebase and Supabase setup below. The app does not use mock event records as production data.

## Technology and architecture

- Frontend: HTML5, external CSS, vanilla JavaScript ES modules, Firebase Web SDK modules.
- Server: Node.js 22+, Express, Helmet, Zod, Firebase Admin, Supabase JavaScript client.
- Database: Supabase PostgreSQL with migrations, constraints, indexes, transaction-backed functions, and Row Level Security.
- QR: `qrcode` for ticket generation and `@undecaf/zbar-wasm` for browser scanning.
- Tests: Node.js built-in test runner, Supertest, Playwright, and axe.

The browser signs in with Google using Firebase, sends a Firebase ID token to Express, and receives an HttpOnly Firebase session cookie. Express verifies that cookie and reads the user's role from the Supabase profile. The server uses the Supabase service-role key; it never sends that key to the browser. Database functions lock event rows while reserving seats and ticket rows while checking them in.

### Database schema

`profiles` stores Firebase UIDs and server-controlled roles. `events` references its organizer profile. `registrations` enforces one user/event pair and a confirmed/cancelled lifecycle. `saved_events` has a composite primary key. `tickets` enforces one ticket per registration and a unique SHA-256 token hash; the token ciphertext is AES-256-GCM encrypted with a separate key. `supabase/migrations/` defines the schema and atomic database functions.

RLS is enabled on every application table. No browser `anon` or `authenticated` role receives table grants or policies; only the server service role can access the data. The service key must remain private.

## Local setup

1. Install Node.js 22 or newer. Firebase Admin 14 requires Node 22+.
2. Run `npm install` in this directory.
3. Copy `.env.example` to `.env` and replace every placeholder with your own provider settings. Never commit `.env`.
4. Create a Supabase project. Apply the migration using the Supabase CLI:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   Alternatively, run `supabase/migrations/202610270001_core_schema.sql` in the Supabase SQL Editor.
5. Create a Firebase project and web app. Enable Google in **Authentication → Sign-in method** and add the local and production hostnames under **Authorized domains**.
6. Create a Firebase service account and add its project ID, client email, and private key to the server `.env`. Add the Firebase web app API key, auth domain, project ID, and app ID to the same file. Web app settings are public configuration; Admin credentials are secret.
7. Generate a ticket encryption key, for example:

   ```powershell
   $keyBytes = [byte[]]::new(32)
   [Security.Cryptography.RandomNumberGenerator]::Fill($keyBytes)
   [Convert]::ToBase64String($keyBytes)
   ```

   Put the output in `TICKET_ENCRYPTION_KEY`. Store it securely and back it up; changing it makes existing ticket QR tokens unreadable.
8. Set `APP_URL` to the exact site origin and start the server:

   ```powershell
   npm start
   ```

   Open `http://localhost:3000`. `npm run preview` serves the static interface without configured data/auth services and reports those services as unavailable.

### Environment variables

See `.env.example`. `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PRIVATE_KEY`, and `TICKET_ENCRYPTION_KEY` are server-only secrets. `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, and `FIREBASE_APP_ID` are Firebase web app config. In production, set all variables in the host's secret manager and set `NODE_ENV=production` with an HTTPS `APP_URL`.

## Organizer provisioning

New accounts always receive the `student` role. After the organizer signs in once, provision the organizer from a trusted administrator environment:

```powershell
node --env-file-if-exists=.env scripts/promote-organizer.js FIREBASE_UID
```

The script confirms that the Firebase user exists before changing the Supabase profile. Never expose organizer provisioning through a public endpoint.

## Tests and checks

```powershell
npm test
npm run test:e2e
```

The standard tests cover input validation, session/origin protections, API responses, and ticket cryptography. To include the read-only Supabase smoke test, set `SUPABASE_INTEGRATION_TEST=1` and configure `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` in `.env` (PowerShell: `$env:SUPABASE_INTEGRATION_TEST = "1"`). Google account selection, production database behavior, and physical camera permissions require their real provider/browser setup. Results are recorded in `report/TEST_RESULTS.md`; unrun provider checks are not described as passing.

## Deployment

Deploy the Node service to a Node.js 22-compatible host. Configure all server variables in the host's secret manager, run the Supabase migrations against the target project, set production `APP_URL` and Firebase authorized domain, then start with `npm start`. TLS must terminate at the hosting provider. Keep Supabase service keys and Firebase Admin credentials out of client files, logs, images, and source control. Configure backups and retain the ticket encryption key before deploying.

## Existing source and data migration

The supplied project used MySQL and password accounts, which do not satisfy the required Supabase/Firebase stack. Its original files remain in `_source_archive/campusflow` and the legacy MySQL source files remain unconnected in this working tree. No live credentials or database dump were supplied, so no user records or events have been migrated. Back up and export any real MySQL data before planning a one-time mapping into the new PostgreSQL schema; Firebase identities must be established separately.

## Limitations and report

Google sign-in, Supabase persistence, hosted deployment, camera scanning, and real concurrency checks cannot be reported as live verified until provider credentials and a configured database are available. The current submission report is `report/FINAL_REPORT.md`; accessibility checklist and actual test results are also under `report/`.
