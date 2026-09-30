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