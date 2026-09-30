# KandyPack — Group 23

Semester 3 database systems project.

## Project goal
Build a product-order distribution system using rail transport
from the Kandy factory to regional stores, followed by road delivery.

## Planned technologies
- React and Tailwind CSS
- Node.js and Express
- MySQL
- Docker Compose

## Responsibilities
- Developer 1: Platform, accounts, stores and routes
- Developer 2: Products and orders
- Developer 3: Rail allocation and receiving
- Developer 4: Road deliveries and staff rosters
- Developer 5: Reports, audit and automated verification

## Development approach
The team uses the supplied KandyPack development guides and reference
code as a starting point. Adaptations, checks and fixes will be
documented through commits and verification notes.

## Current progress

The Dev1 foundation includes:
- MySQL Docker configuration.
- Core tables and migration tracking.
- Restricted application database account.
- Authentication API with revocable sessions.
- React login/registration forms and shared application layout.
- Directory management API and page.
- JavaScript syntax checks and frontend build command.

Verified: database setup, application-account grants, API health,
registration/login, protected access, logout revocation, browser
login/logout, and syntax/build checks.

Directory management flows still need further verification.
Other developers' feature modules, demo fixtures and automated
integration tests are not included yet.

## Local setup — Dev1 foundation

### Requirements

- Git
- Node.js 24 and npm
- Docker Desktop running with its Linux engine
- VS Code or another editor

The commands below use PowerShell from the project root.

Each developer uses their own local MySQL database.
Git shares source files and migrations, not database contents.

### 1. Install dependencies

```powershell
npm ci
```

### 2. Create local settings

For a fresh setup, copy the example files:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

Do not overwrite existing configured .env files.

Before starting MySQL for the first time:
- Set MYSQL_ROOT_PASSWORD in the root .env.
- Put the same password in DB_ADMIN_PASSWORD in backend/.env.
- Set a different DB_PASSWORD of at least 12 characters for kp_app.
- Set DEMO_PASSWORD to a separate password of at least 12 characters.
- Keep SEED_DEMO=NO.
- Keep the supplied database name, username, host and port.

Generate a JWT secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output into JWT_SECRET in backend/.env.

Keep actual passwords and secrets in local .env files only.
The committed .env.example files must contain placeholders.

Changing MYSQL_ROOT_PASSWORD in .env after the database has been
initialized does not change the existing MySQL account password.

### 3. Start and prepare MySQL

```powershell
docker compose up -d db
docker compose ps
```

Wait until the database status is healthy, then run:

```powershell
npm run migrate
npm run provision
```

After receiving new migrations, run both commands again.
Do not edit migrations that have already been merged and applied.

### 4. Start the application

In one terminal:

```powershell
npm run api
```

In a second terminal:

```powershell
npm run web
```

Leave both terminals running.

Open http://localhost:5173.

The API health check is http://localhost:3000/api/health.
It should return {"status":"ok"}.

### 5. Try an account

Use Create customer account to register a synthetic test customer.
Passwords require at least 12 characters.

Registration creates CUSTOMER accounts only.
Then return to the sign-in form and log in.

Existing accounts on another teammate's laptop will not exist
automatically in your local database.

At this stage, customers see a message saying feature modules
will appear later. This is expected until the Orders module arrives.

Staff demo accounts and full demonstration data will be added
with Developer 5's seed script after all required modules are merged.

### 6. Run available checks

```powershell
npm run check
```

This checks backend JavaScript syntax and builds the frontend.
It does not run the full database/API test suite.

Do not run npm run seed or npm test yet; their required files
and feature modules are not included in the foundation.

### Restarting work

Start Docker Desktop, then run:

```powershell
docker compose up -d db
```

Restart the API and frontend in separate terminals.
Existing database data is retained in the Docker volume.

Do not use docker compose down -v unless you deliberately intend
to delete this project's local database data.