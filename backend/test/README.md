# Backend tests

Developer 5 will add the automated database and API tests here.

At the foundation stage, npm run check validates JavaScript syntax
and builds the frontend. The full npm test suite is not available yet.

## Dev1 backup and restore verification — 2026-09-30

- Created a database backup using backend/scripts/backup.ps1.
- Imported it into a separate kandypack_restore_test database.
- Verified all six tables, migration 001_core.sql, and one user.
- Import completed without errors; three warnings were reported
  but their details were not captured.
- Removed the temporary database after verification.

## Customer permission checks — 2026-09-30

Using a signed-in CUSTOMER account:
- GET /api/me returned the CUSTOMER role.
- GET /api/users rejected access.
- POST /api/staff-users rejected access.

Both restricted endpoints returned:
"This action is not allowed for your role"

## Admin and staff verification — 2026-09-30

- Created a separate local ADMIN account using create-dev-admin.js.
- Confirmed administrator login and access to GET /api/users.
- Created a FACTORY account through POST /api/staff-users.
- Signed in using the new FACTORY account.
- Confirmed that GET /api/users rejected the FACTORY account
  with "This action is not allowed for your role".


  ## Disabled-account verification — 2026-09-30

- Disabled the FACTORY test account through the ADMIN API.
- Confirmed active = 0.
- Confirmed its existing session could not access GET /api/me.
- Re-enabled the test account after the check.
- Disabling blocks access but does not permanently revoke sessions.

## Inactivity timeout verification — 2026-09-30

- Confirmed the enabled FACTORY account's session could access /api/me.
- Simulated inactivity by setting last_seen to 31 minutes earlier.
- Retried /api/me using the same token.
- Received "Session expired; sign in again".


## Database session expiry verification — 2026-09-30

- Started with a working FACTORY session.
- Set expires_at to one minute in the past and last_seen to now.
- Retried /api/me with the same token.
- Received "Session expired; sign in again".
- This checks database expiry enforcement, not JWT expiry.