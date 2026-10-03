# Developer 2 notes — Products & Orders

Owner: D2 · Branch: `feature/d2-orders` · Reviewer: D1 · I review: D3

## SQL explanations

_To be filled in as each milestone is completed._

## Verification log

### Phase 0 — Environment check — 2026-10-04

- Branch `feature/d2-orders` was clean and already up to date with `origin/main`
  (D1 foundation, PR #6, included).
- Fresh clone: `.env` and `backend/.env` did not exist. Created them from the
  `.env.example` files with a newly generated random `JWT_SECRET`
  (both files are git-ignored and not committed).
- `npm ci` succeeded (175 packages, 0 vulnerabilities). It printed an
  `EBADENGINE` warning: this laptop has Node v22.21.0 while `package.json`
  requires `>=24 <25`. It did not block installation or the API.
- `docker compose up -d db` pulled `mysql:8.4`; the container became healthy
  on host port 3307.
- `npm run migrate` applied `001_core.sql` (fresh database).
- `npm run provision` ran successfully (runtime grants ready).
- Local test data created directly with the admin DB connection by a temporary
  script (deleted afterwards, not committed). There is no `POST /stores`
  endpoint in D1's API, so the store had to be inserted with SQL:

  | Item | Value |
  |---|---|
  | ADMIN | `d2-admin@kandypack.test` |
  | FACTORY | `d2-factory@kandypack.test` |
  | CUSTOMER | `d2-customer@kandypack.test` |
  | Store | `D2_TEST_STORE` (id 1) |
  | Route | `D2 Test Route`, coverage `D2 Test Coverage Zone` (id 1) |

- Started the API: `/api/health` returned `ok`; all three accounts signed in
  and `/api/me` returned the matching roles; `/api/directory` listed the test
  route for the customer.
- Reminder: D5's seed needs empty `stores` and `orders`, so this test store and
  route must be cleared (or a disposable DB used) before the seed is run.

## Bugs & trade-offs

_None recorded yet._

## Screenshots

_None yet._

## Review of D3

_Pending D3's pull request._
