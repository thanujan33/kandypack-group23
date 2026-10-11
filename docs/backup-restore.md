# KandyPack — Database Backup & Disaster Recovery Guide

> **Semester 3 Database Systems · Group 23**  
> **Database Engine:** MySQL 8.4 Community Edition (InnoDB)  
> **Primary Script:** [`backend/scripts/backup.ps1`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/scripts/backup.ps1)  
> **Verification Script:** [`backend/scripts/verify-restore.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/scripts/verify-restore.js)  
> **Backup Storage Directory:** `backups/` (Git-ignored)

---

## 1. Backup Architecture & Command Flags

Enterprise database recovery requires not only copying raw table rows, but guaranteeing transaction consistency, procedural routines, and trigger integrity across foreign-key dependencies.

### 1.1 The Production Backup Command
The KandyPack backup pipeline executes via `backend/scripts/backup.ps1`:

```powershell
docker compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --no-tablespaces \
  kandypack'
```

### 1.2 Critical `mysqldump` Flags Explained

| Flag | Purpose & Guarantee | Failure Consequence if Omitted |
| :--- | :--- | :--- |
| `--single-transaction` | Sets transaction isolation to `REPEATABLE READ` and takes an atomic, consistent point-in-time snapshot of all InnoDB tables **without locking tables or interrupting active users**. | Inconsistent state where `orders` records are dumped before a concurrent transaction commits, but child `order_items` are dumped after, causing foreign key violations during restore. |
| `--routines` | Dumps all Stored Procedures (`sp_place_order`, `sp_allocate_order`, etc.) and Stored Functions (`fn_work_minutes`). | Restored database lacks core business logic; application crashes with `PROCEDURE does not exist`. |
| `--triggers` | Dumps all BEFORE/AFTER triggers (`orders_lead_insert`, `allocation_guard`, `audit_*`). | Invariants bypassed; audit logging fails silently upon restart. |
| `--events` | Dumps any scheduled database events. | Maintenance automation lost. |
| `--no-tablespaces` | Suppresses `PROCESS` privilege checks for tablespace info. | Fails on least-privilege administrative accounts without `PROCESS` grant. |

---

## 2. Disaster Recovery & Restoration Procedure

To restore KandyPack from an existing backup SQL dump into a target database:

### Step 1: Create Target Database
```powershell
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS kandypack;"'
```

### Step 2: Stream Backup SQL Dump into MySQL
```powershell
Get-Content backups/kandypack-<TIMESTAMP>.sql | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" kandypack'
```

### Step 3: Re-provision Least-Privilege Application Grants
Ensure the application user (`kp_app`) has execution permissions on all restored routines:
```powershell
npm run provision
```

---

## 3. Real-World Restoration Verification Test

To prove the validity of the backup artifact, a disaster recovery simulation was executed by backing up the live database, restoring the SQL dump into an isolated scratch database (`kandypack_scratch_restore`), and comparing row counts, routines, and triggers.

### 3.1 Test Execution Commands
```powershell
# 1. Generate timestamped production dump
powershell -ExecutionPolicy Bypass -File backend/scripts/backup.ps1
# Saved: backups/kandypack-20261010-175040.sql (105,252 bytes)

# 2. Provision isolated scratch database
docker compose exec -T db sh -c "mysql -uroot -p`$MYSQL_ROOT_PASSWORD -e 'DROP DATABASE IF EXISTS kandypack_scratch_restore; CREATE DATABASE kandypack_scratch_restore;'"

# 3. Stream dump into scratch database
Get-Content backups/kandypack-20261010-175040.sql | docker compose exec -T db sh -c "mysql -uroot -p`$MYSQL_ROOT_PASSWORD kandypack_scratch_restore"

# 4. Execute automated verification script
node --env-file=backend/.env backend/scripts/verify-restore.js
```

### 3.2 Verification Results & Parity Matrix

```
| Table Name                 | kandypack (Source) | kandypack_scratch_restore (Target) | Status |
| :------------------------- | :----------------: | :--------------------------------: | :----: |
| `app_lock`                 | 1                  | 1                                  | MATCH  |
| `audit_log`                | 0                  | 0                                  | MATCH  |
| `delivery_trip_orders`     | 0                  | 0                                  | MATCH  |
| `delivery_trips`           | 0                  | 0                                  | MATCH  |
| `employees`                | 0                  | 0                                  | MATCH  |
| `order_items`              | 2                  | 2                                  | MATCH  |
| `orders`                   | 2                  | 2                                  | MATCH  |
| `products`                 | 2                  | 2                                  | MATCH  |
| `routes`                   | 1                  | 1                                  | MATCH  |
| `schema_migrations`        | 7                  | 7                                  | MATCH  |
| `sessions`                 | 16                 | 16                                 | MATCH  |
| `stores`                   | 1                  | 1                                  | MATCH  |
| `train_allocations`        | 0                  | 0                                  | MATCH  |
| `train_trips`              | 0                  | 0                                  | MATCH  |
| `trucks`                   | 0                  | 0                                  | MATCH  |
| `users`                    | 5                  | 5                                  | MATCH  |

Routines Count: kandypack = 12, kandypack_scratch_restore = 12 (100% PARITY)
Triggers Count: kandypack = 30, kandypack_scratch_restore = 30 (100% PARITY)
```

**Conclusion:** Zero data loss, zero routine omissions, and complete trigger retention confirmed.

---

## 4. Post-Verification Clean-Up

After completing verification, the scratch database was securely purged:
```powershell
docker compose exec -T db sh -c "mysql -uroot -p`$MYSQL_ROOT_PASSWORD -e 'DROP DATABASE IF EXISTS kandypack_scratch_restore;'"
```
