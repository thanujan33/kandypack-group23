# KandyPack — Group 23

Semester 3 Database Systems Project.

## Project Overview

**KandyPack** is a full-stack product-order distribution management system for a factory based in Kandy, Sri Lanka. It models a two-leg supply chain:

1. **Rail Leg:** Goods are loaded from the Kandy factory onto scheduled train trips and dispatched to regional store depots.
2. **Road Leg:** Regional store depots receive the goods, then plan and dispatch last-mile delivery truck trips (with assigned drivers and assistants) to customers.

---

## Architecture & Technology Stack

- **Frontend:** React 19 SPA, Vite 7, Tailwind CSS 4
- **Backend:** Node.js 24 (ES Modules), Express 5, `mysql2/promise`
- **Database:** MySQL 8.4 Community Server (running in Docker container, port `3307`)
- **Security & RBAC:** Role-Based Access Control (`ADMIN`, `FACTORY`, `STORE`, `CUSTOMER`), bcrypt password hashing (cost factor 12), rolling JWT session management, and restricted MySQL user privileges (`kp_app`).
- **Audit Logging:** Database triggers automatically record mutating actions into `audit_log` with user actor tracking.

---

## Module Responsibilities

| Role / Module | Developer | Domain & Responsibilities |
| :--- | :--- | :--- |
| **Dev 1 — Platform** | Developer 1 | System authentication, users, stores, delivery routes, and directory APIs |
| **Dev 2 — Orders** | Developer 2 | Product catalog management, customer order placement (`sp_place_order`), snapshot pricing |
| **Dev 3 — Rail** | Developer 3 | Train scheduling, order capacity allocation (`sp_allocate_order`), train dispatch, depot receiving |
| **Dev 4 — Road** | Developer 4 | Store fleet/staff management, delivery trip scheduling (`sp_schedule_delivery`), dispatch, return logging |
| **Dev 5 — Reports** | Developer 5 | Sales analytics, roster hour tracking, truck utilization, audit logs, and automated integration tests |

---

## Quickstart Setup Guide

### Prerequisites

- **Git**
- **Node.js 24** and **npm** (`node -v` should report `>=24 <25`)
- **Docker Desktop** (running with its Linux engine)
- PowerShell (Windows) or standard terminal

All commands below should be executed from the **repository root directory**.

---

### Step 1: Clone & Install Dependencies

```powershell
npm ci
```

---

### Step 2: Configure Environment Settings

If setting up for the first time, copy the template `.env` files:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

Ensure the configuration variables in `backend/.env` match your local environment:
- `MYSQL_ROOT_PASSWORD` in root `.env` must match `DB_ADMIN_PASSWORD` in `backend/.env`.
- `DB_PORT=3307` and `DB_HOST=127.0.0.1`.
- `DEMO_PASSWORD` must be at least 12 characters (used for test and seed accounts).
- `JWT_SECRET` must be a secure random 64-character hex string.

---

### Step 3: Start the MySQL Database

Start the MySQL container in the background:

```powershell
docker compose up -d db
```

Verify that the database is running and healthy:

```powershell
docker compose ps
```

---

### Step 4: Run Migrations & Provision Users

Run the database migrations and provision the restricted application database user (`kp_app`):

```powershell
npm run migrate
npm run provision
```

---

### Step 5: Create Local Administrator Account

Initialize a developer administrator account in your local database:

```powershell
node backend/scripts/create-dev-admin.js
```

This creates an administrator account:
- **Email:** `dev1-admin@kandypack.test`
- **Password:** The `DEMO_PASSWORD` configured in `backend/.env` (default: `abcdef123456`)

---

### Step 6: Verify System Health & Tests

Run syntax checks, bundle builds, and the automated integration test suite:

```powershell
npm run check
npm test
```

All 14 integration test suites should pass, covering authentication, order placement, rail allocation, roster limits, and audit triggers.

---

### Step 7: Launch the Application

Start the backend API server and frontend Vite development server in separate terminals:

**Terminal 1 (Backend API):**
```powershell
npm run api
```
*API will be listening at: `http://localhost:3000` (Health check: `http://localhost:3000/api/health`)*

**Terminal 2 (Frontend Web):**
```powershell
npm run web
```
*Web application will be accessible at: `http://localhost:5173`*

Open [http://localhost:5173](http://localhost:5173) in your browser and sign in using the administrator credentials created in Step 5.

---

## Available NPM Scripts

From the repository root:

| Command | Action |
| :--- | :--- |
| `npm run api` | Starts backend server with automatic reload on changes (`--watch`) |
| `npm run web` | Starts Vite frontend development server on port `5173` |
| `npm run build` | Builds the production frontend bundle into `frontend/dist/` |
| `npm run check` | Checks backend JavaScript syntax and validates frontend build |
| `npm run migrate` | Runs pending database migrations in `backend/db/migrations/` |
| `npm run provision` | Provisions or refreshes privileges for the `kp_app` database user |
| `npm test` | Runs the automated integration test suite on an isolated test database |
| `npm run seed` | Seeds demo fixtures (stores, routes, products, staff, orders) when `SEED_DEMO=YES` |