# ProHorizon — LOS Stage Management Portal

Internal web application for configuring the **Loan Origination System (LOS)** journey without code
changes: products, stages, sub-stages, sections, fields, dropdown values, validation and visibility
rules, document requirements, workflow routing, roles and permissions — with draft → approval →
publish versioning, configuration diff, rollback and a full audit trail.

```
Product → Stage → Sub-stage → Module / Section → Field (options, rules)
                       └── Document requirements, Workflow actions
```

Seven products are seeded. **New Two Wheeler** (from the OPTIM screenshots) and **New / Used Tractor**
(from the Tractor Loan user manual) start with published, source-derived baselines; the car and
commercial-vehicle products start as starter drafts. See [`docs/reference-analysis.md`](docs/reference-analysis.md)
for exactly what was taken from each source and what still needs business confirmation.

---

## Features

| Area | What you can do |
|---|---|
| **Product Catalogue** | Create / edit / activate / deactivate products, manage schemes, **clone** a product (preview → confirm). |
| **Stage Builder** | Expandable tree. Add, rename, deactivate, delete (with impact confirmation), drag-and-drop or Up/Down reorder stages and sub-stages, **Move to…** another stage, add / reorder sections, add / edit / duplicate / move / reorder / delete fields, **Copy to products / Apply to products** (preview → confirm). |
| **Field designer** | 16 field types (Text, Text Area, Integer, Decimal, Currency, Date, Date-Time, Dropdown, Multi-select, Radio, Checkbox, Yes/No, File, Image, Read-only, Calculated). Key, label, help, placeholder, Mandatory / Optional / Conditional, default, min/max value, min/max length, regex pattern + message, date limits (`today-18y` …), dropdown options (add / edit / delete / reorder / bulk add), "show when" and "required when" rules, custom validation rules, editable/read-only, scheme applicability, visible / editable roles, data mapping, sensitive-data flag and masking, active flag, source reference and notes. No JSON needed. |
| **Field Builder** | Search and filter every field of a product (by sub-stage, type, requirement, "requires confirmation"), edit in place, reusable **field library**. |
| **Screen Preview** | Pick product, version, scheme, stage, sub-stage and **role**; the screen renders from the saved configuration with live calculated fields, conditional visibility, required-field and format validation, simulated document capture and the workflow actions that would be available. Nothing is saved. |
| **Workflow Configuration** | Actions per sub-stage: outcome (Submit / Approve / Reject / Return / Query / Hold / Auto), destination, resulting status, allowed roles, remarks required, all-mandatory-fields gate, specific required fields and documents, routing conditions, exception notes, terminal flag. Routing is independent of display order. |
| **Document Configuration** | Document requirements per sub-stage: category, mandatory/optional/conditional, capture mode, file types, size, counts, scheme applicability, validating roles. |
| **Configuration Versions** | Draft → Submit → Approve → Publish (maker-checker), Withdraw, Reject with reason, Validate, **Diff** against base / published / any version, **Restore** an older version as a new draft, discard drafts, **Compare** any two configurations (also across products). Published versions are immutable. |
| **Roles & Permissions** | Permission matrix (view, create, edit, delete, submit, approve, publish, audit, products, roles, users, settings) enforced by the API; add roles; manage portal users. The 17 LOS business roles from the manual are seeded. |
| **Audit History** | Every change with user, time, action, summary and before/after JSON; filter by entity, product, user, date. |
| **System Settings** | Require approval, maker-checker, application version policy; change password; health status. |

Security: bcrypt-hashed passwords, httpOnly session cookie (JWT), login throttling, helmet security
headers, server-side permission checks on every route, published configuration locked at the API.

## Technology

* **Frontend:** React 18 + TypeScript, Vite, TanStack Query, React Router, dnd-kit (drag and drop), lucide icons, hand-written CSS.
* **Backend:** Node.js 20 + TypeScript, Express, Zod validation, Prisma ORM, PostgreSQL.
* **Shared:** `shared/src/ruleEngine.ts` — the same visibility / requiredness / validation / formula engine is used by the API and the preview UI.
* **Tests:** Vitest (unit + API integration with Supertest against a disposable database) and Playwright (end-to-end against the production build).

```
stagemanagementportal/
├── client/                 React app (Vite)            → client/dist when built
├── server/                 Express API + Prisma
│   ├── prisma/schema.prisma, migrations/, seed.ts, seed-data/ (source-derived configurations)
│   ├── src/                app.ts, routes/, lib/ (snapshot, diff, validator, versions, audit)
│   └── tests/              unit + API integration tests
├── shared/src/             rule engine shared by client and server
├── e2e/                    Playwright tests
├── docs/                   reference-analysis.md, DEPLOYMENT.md
├── deploy/                 nginx / IIS / systemd / Windows-service templates
├── scripts/                backup & restore scripts
└── .env.example
```

---

## Local setup on Windows

### 1. Prerequisites

| Software | Version | Check |
|---|---|---|
| Node.js (LTS) | 20 or newer | `node -v` |
| PostgreSQL | 14 or newer (developed on 17) | `psql --version` |
| Git | any recent | `git --version` |

During the PostgreSQL install, note the password you give the `postgres` user and keep port 5432.
Make sure `C:\Program Files\PostgreSQL\<version>\bin` is on your `PATH` (needed for `psql`, `pg_dump`).

### 2. Get the code and configure

```powershell
git clone https://github.com/NYXABRAXAS/stagemanagementportal.git
cd stagemanagementportal
Copy-Item .env.example server\.env
notepad server\.env
```

In `server\.env` set:

* `DATABASE_URL` — e.g. `postgresql://postgres:<your-password>@localhost:5432/los_stage_portal?schema=public`
* `TEST_DATABASE_URL` — same but database `los_stage_portal_test` (only used by automated tests; it is wiped on every test run)
* `JWT_SECRET` — generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

The databases are created automatically by the migration step; you only need the PostgreSQL server running.

### 3. Install, create the schema, seed

```powershell
npm install
npm run db:migrate
npm run db:seed
```

`db:migrate` applies all migrations (`prisma migrate dev`); `db:seed` loads roles, permissions, demo users, the seven
products and the source-derived configurations. Re-running the seed never overwrites configuration you edited.

### 4. Run in development

```powershell
npm run dev
```

| URL | What |
|---|---|
| http://localhost:5173 | Portal UI (Vite dev server, hot reload) |
| http://localhost:4000/api/health | API health check |

### 5. Seeded local demo accounts

> For **local development only**. The demo password is `Prohorizon@2026` unless you set
> `SEED_DEMO_PASSWORD` in `server\.env` before seeding. Change passwords (System Settings → Change my
> password) or replace these users before any shared use.

| Username | Role | Use it to |
|---|---|---|
| `admin` | System Administrator | everything, including users, roles and settings |
| `config.admin` | Configuration Administrator | build configuration, create drafts, submit |
| `config.approver` | Configuration Approver | approve and publish (maker-checker partner of config.admin) |
| `auditor` | Read-only Auditor | view configuration and audit history only |

### 6. A typical session

1. Sign in as `config.admin` → **Stage Builder** → choose a product.
2. If it shows the published version, click **Create draft to edit** (the published version is untouched).
3. Add / move / reorder stages, sub-stages, sections and fields; open a field to edit every property.
4. **Preview** the sub-stage (choose scheme and role) and click *Validate / Submit (preview)*.
5. **Configuration Versions** → *Validate* → *Diff* → *Submit*.
6. Sign in as `config.approver` → *Approve* → *Publish*. The previous version is archived and can be restored.

---

## Tests

```powershell
npm test            # server unit + API integration tests (resets TEST_DATABASE_URL, runs migrations + seed) and client unit tests
npm run test:e2e    # builds the production bundle and runs Playwright against it (uses Microsoft Edge by default)
```

The E2E suite uses the installed Microsoft Edge (`channel: msedge`). To use Playwright's own Chromium
instead: `npx playwright install chromium` then `$env:PW_CHANNEL="chromium"; npm run test:e2e`.

## Production build and start

```powershell
npm ci
npm run db:deploy        # apply migrations (never resets data)
npm run db:seed          # first install only
npm run build            # compiles the API and builds the React app
$env:NODE_ENV="production"; npm start
```

In production the API also serves the built UI, so the whole portal is one process on one port:
http://localhost:4000 (change with `API_PORT`). For the office server (Windows service or Linux
systemd, reverse proxy, HTTPS, firewall, backups, logs, restart after reboot) see
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Backup and restore

```powershell
# backup (custom-format dump in .\backups, keeps the last 30)
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
# restore a dump into the database (asks for confirmation; stop the portal first)
powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 -File backups\los_stage_portal_20261015_0200.dump
```

Both scripts read `DATABASE_URL` from `server\.env`. Linux equivalents: `scripts/backup.sh`, `scripts/restore.sh`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing required environment variable JWT_SECRET` | `server\.env` is missing — copy `.env.example` to `server\.env` and fill it. |
| `P1001: Can't reach database server` | PostgreSQL service not running (`services.msc` → *postgresql-x64-17* → Start) or wrong host/port/password in `DATABASE_URL`. |
| `password authentication failed for user "postgres"` | Fix the password in `DATABASE_URL`; URL-encode special characters (`@` → `%40`, `#` → `%23`). |
| `EPERM: operation not permitted, rename ... query_engine-windows.dll.node` | A running dev server locks Prisma's engine. Stop `npm run dev`, then rerun `npm install` / `npx prisma generate`. |
| Port 4000 or 5173 already in use | `netstat -ano \| findstr :4000` then `taskkill /PID <pid> /F`, or set `API_PORT` in `server\.env` (and the proxy target in `client/vite.config.ts`). |
| Sign-in shows "Request failed (500)" in dev | The API is not running — check the `[api]` lines of `npm run dev`. |
| "Too many failed attempts" | Wait 5 minutes (login throttle) or restart the API. |
| Cannot edit anything | You are looking at a published / submitted version, or your role lacks `config.edit`. Create a draft or withdraw the submitted version. |
| Approve button disabled | Maker-checker: the approver must be a different user from the submitter (System Settings to change). |
| `npm run test:e2e` cannot find Edge | Install Chromium for Playwright (see Tests) and set `PW_CHANNEL=chromium`. |

## API overview

All endpoints are under `/api` and require a session (except `/api/health` and `/api/auth/login`).
Main resources: `/products`, `/products/:id/versions`, `/versions/:id/tree|snapshot|diff|validate|submit|approve|reject|publish|rollback`,
`/versions/:id/stages`, `/stages/:id/subStages`, `/subStages/:id/modules|fields|move`, `/fields/:id`,
`/versions/:id/documents`, `/versions/:id/transitions`, `/copy`, `/compare`, `/preview/form`, `/preview/validate`,
`/roles`, `/permissions`, `/users`, `/audit`, `/settings`, `/dashboard`.

A consuming LOS reads the immutable published configuration from
`GET /api/runtime/products/:code/published` and should store the returned `versionId` on each customer
application, so applications keep their original configuration (setting *applicationVersionPolicy* =
`PIN_TO_ORIGINAL`). Migrating an in-flight application to a newer version is deliberately not automatic.
