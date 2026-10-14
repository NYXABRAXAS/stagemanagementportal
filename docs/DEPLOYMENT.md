# Office-Server Deployment Guide

The portal is a single Node.js process that serves both the REST API (`/api/...`) and the built React
UI from one port (default **4000**), backed by PostgreSQL. It does not need internet access at runtime
and is designed for an **internal network**; exposing it publicly is not required or recommended.

```
 Browser (office LAN) ──HTTPS──► reverse proxy (IIS / nginx, port 443) ──HTTP──► Node portal :4000 ──► PostgreSQL :5432
```

---

## 1. Server prerequisites

| Item | Windows Server 2019/2022 | Linux (Ubuntu 22.04/24.04, RHEL 8/9) |
|---|---|---|
| Node.js | 20 LTS (or 22 LTS) x64 MSI | NodeSource / distro package, `node -v` ≥ 20 |
| PostgreSQL | 14+ (EDB installer) — same or separate DB server | `postgresql-14`+ |
| Reverse proxy | IIS 10 + URL Rewrite + Application Request Routing | nginx |
| Service manager | NSSM (Windows service wrapper) | systemd |
| Git | to pull releases (or copy a release archive) | git |
| Disk | ~1 GB for app + node_modules; DB grows slowly (configuration only, a few MB) | same |
| RAM / CPU | 2 vCPU / 2 GB is ample for an internal team | same |

The application stores **no customer data** and no uploaded files — only configuration, users and audit.

## 2. PostgreSQL setup

```sql
-- as a PostgreSQL superuser (psql -U postgres)
CREATE ROLE los_portal LOGIN PASSWORD '<strong-password>';
CREATE DATABASE los_stage_portal OWNER los_portal;
-- optional: only allow connections from the app server in pg_hba.conf, e.g.
-- host  los_stage_portal  los_portal  10.0.5.20/32  scram-sha-256
```

Keep PostgreSQL on the private network only (`listen_addresses` = localhost or the internal interface).

## 3. Get the application onto the server

```powershell
# Windows example (any folder; C:\apps is used below)
cd C:\apps
git clone https://github.com/NYXABRAXAS/stagemanagementportal.git
cd stagemanagementportal
```

Linux: clone to `/opt/los-portal` and `sudo useradd --system --home /opt/los-portal losportal; sudo chown -R losportal /opt/los-portal`.

## 4. Environment variables (`server/.env`)

Copy `.env.example` to `server/.env` and set:

| Variable | Production value |
|---|---|
| `DATABASE_URL` | `postgresql://los_portal:<password>@<db-host>:5432/los_stage_portal?schema=public` |
| `API_PORT` | `4000` (internal port the proxy forwards to) |
| `NODE_ENV` | `production` (also set by the service definitions) |
| `JWT_SECRET` | 64+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SESSION_HOURS` | e.g. `8` |
| `COOKIE_SECURE` | `true` when users reach the portal over HTTPS (recommended); `false` only for plain-HTTP internal access |
| `SEED_DEMO_PASSWORD` | a strong temporary password used only by the first seed |
| `TEST_DATABASE_URL` | leave unset on the server (tests are run on developer machines) |

Restrict the file: Windows → only Administrators and the service account can read it; Linux → `chmod 600 server/.env`.
Never commit `.env` (it is in `.gitignore`).

## 5. Build, migrate, seed

```powershell
npm ci                      # installs exact dependency versions and generates the Prisma client
npm run db:deploy           # applies migrations — safe on an existing database, never drops data
npm run db:seed             # FIRST INSTALL ONLY: roles, permissions, demo users, products, source baselines
npm run build               # compiles server (server/dist) and UI (client/dist)
```

Immediately after the first start, sign in as `admin` with `SEED_DEMO_PASSWORD`, then:
change the admin password (System Settings), create named users for real people (Roles & Permissions → Users),
and deactivate or re-password the demo accounts (`config.admin`, `config.approver`, `auditor`).

## 6. Process management — start on boot, restart on failure

### Windows (NSSM)

1. Download NSSM and extract, e.g. `C:\tools\nssm`.
2. Elevated PowerShell:
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\install-windows-service.ps1 -AppDir C:\apps\stagemanagementportal -Nssm C:\tools\nssm\win64\nssm.exe
   ```
   This registers service **LosStagePortal** (automatic start, restart after 5 s on failure, logs in `logs\portal.out.log` / `portal.err.log` with rotation).
3. Manage: `nssm restart LosStagePortal`, `nssm stop LosStagePortal`, or `services.msc`.

### Linux (systemd)

```bash
sudo cp deploy/los-portal.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now los-portal      # enable = start after every reboot
sudo systemctl status los-portal
```

## 7. Reverse proxy and HTTPS

Use an internal certificate (corporate CA) for a name such as `los-portal.<company>.local`.

* **IIS:** install *URL Rewrite* and *Application Request Routing*, enable the ARR proxy, create a site with an HTTPS
  binding and put `deploy/iis-web.config` in its folder as `web.config`. It forwards everything to `http://127.0.0.1:4000`.
* **nginx:** copy `deploy/nginx-los-portal.conf` to `/etc/nginx/conf.d/`, set `server_name` and certificate paths,
  `sudo nginx -t && sudo systemctl reload nginx`.

Then set `COOKIE_SECURE=true` and restart the service. The app already sets security headers (helmet) and trusts
one proxy hop for client IPs.

*Simple internal option without a proxy:* users browse to `http://<server>:4000` directly (keep `COOKIE_SECURE=false`).
Acceptable only on a trusted LAN segment.

## 8. Firewall and network access

| Rule | Windows | Linux (ufw example) |
|---|---|---|
| Allow HTTPS from the office LAN to the proxy | `New-NetFirewallRule -DisplayName "LOS Portal HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -RemoteAddress 10.0.0.0/8 -Action Allow` | `sudo ufw allow from 10.0.0.0/8 to any port 443 proto tcp` |
| Do **not** expose 4000 outside the host when a proxy is used | no rule for 4000 | `sudo ufw deny 4000` |
| PostgreSQL 5432 only from the app server (if DB is remote) | rule scoped to the app server IP | `sudo ufw allow from <app-ip> to any port 5432` |

No outbound internet access is needed at runtime (only for `npm ci` during install/upgrade, or install from an internal npm mirror).

## 9. Upgrades and database migrations

```powershell
nssm stop LosStagePortal                    # or: sudo systemctl stop los-portal
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1     # always back up first
git pull                                    # or unpack the new release
npm ci
npm run db:deploy                           # applies only new migrations
npm run build
nssm start LosStagePortal                   # or: sudo systemctl start los-portal
```

Never run `npm run db:reset` or `prisma migrate dev` on the server — those are development commands.
Do not re-run the seed on an upgraded server unless release notes say so (it is idempotent and never overwrites edited configuration, but it re-creates missing demo users).

## 10. Backup and restore

* **Scheduled backup (Windows Task Scheduler):** daily at 02:00, action
  `powershell.exe -ExecutionPolicy Bypass -File C:\apps\stagemanagementportal\scripts\backup.ps1 -OutDir D:\Backups\los-portal -Keep 30`.
  Requires `pg_dump` on PATH (PostgreSQL `bin` folder).
* **Linux cron:** `0 2 * * * /opt/los-portal/scripts/backup.sh /var/backups/los-portal 30`.
* Copy the backup folder to your normal backup storage. Dumps are small (configuration only).
* **Restore:** stop the service, then
  `powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 -File D:\Backups\los-portal\los_stage_portal_<stamp>.dump`
  (or `scripts/restore.sh <file>`), start the service, check `/api/health`.
* Test a restore into a scratch database periodically: `createdb los_restore_check` → `pg_restore -d los_restore_check <file>` → `dropdb los_restore_check`.

## 11. Logs and health checks

* Health endpoint (no login required): `GET /api/health` → `{"status":"ok","database":"ok"}`; returns HTTP 503 when the database is unreachable. Point your monitoring at `https://<portal>/api/health`.
* Application logs: Windows `logs\portal.out.log` / `portal.err.log` (NSSM, rotated at 10 MB); Linux `journalctl -u los-portal`.
* Business-level history (who changed / approved / published what) is in the portal's **Audit History** page and the `AuditLog` table.

## 12. Restart after server reboot

Both the NSSM service (`SERVICE_AUTO_START`) and the systemd unit (`enable`) start automatically after a reboot,
after PostgreSQL. To verify after a reboot: check the service is *Running* and `GET /api/health` returns `ok`.
If PostgreSQL is on the same Windows host, set the portal service to depend on it:
`sc.exe config LosStagePortal depend= postgresql-x64-17`.

## 13. Security checklist

- [ ] Strong unique `JWT_SECRET`; `server/.env` readable only by admins/service account.
- [ ] Demo users re-passworded or deactivated; named users created per person; least-privilege roles.
- [ ] HTTPS via proxy with `COOKIE_SECURE=true`.
- [ ] Port 4000 and PostgreSQL not reachable from the wider network.
- [ ] Maker-checker and *Require approval* left enabled (System Settings).
- [ ] Daily backups scheduled and a restore tested.
