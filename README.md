# Citizen Safety and Emergency Coordination Platform

A complete multi-society, multi-role emergency response web platform built with
Django REST Framework (backend) and React + Vite (frontend).

---

## Technology Stack

| Layer      | Technology                                          |
|------------|-----------------------------------------------------|
| Backend    | Django 5.x · Django REST Framework · SimpleJWT     |
| Real-time  | Django Channels (WebSocket) · In-memory channel layer |
| Frontend   | React 19 · Vite · React Router v7 · Axios          |
| Database   | SQLite (default) · PostgreSQL (env-configurable)   |
| Auth       | JWT (access 30 min · refresh 7 days · auto-rotate) |

---

## Roles

| Role      | Registration | Notes                                       |
|-----------|-------------|---------------------------------------------|
| RESIDENT  | Public      | SOS, guardian management, emergency history |
| VOLUNTEER | Public      | Society membership approval required        |
| SECURITY  | Public      | Society membership approval required        |
| GUARDIAN  | Auto-created| Created when resident adds a guardian       |
| ADMIN     | Controlled  | Provisioned via platform admin only         |

---

## Emergency Escalation Chain

```
Resident SOS
    │
    ▼ (GPS captured automatically; fallback: registered location)
PRIMARY Guardian  ──────── 120 s timeout / decline ──▶
SECONDARY Guardian ─────── 120 s timeout / decline ──▶
EMERGENCY Contact ──────── 120 s timeout / decline ──▶
SECURITY ──────────────── 120 s timeout / decline ──▶
VOLUNTEER ─────────────── 120 s timeout / decline ──▶
PENDING COMMUNITY QUEUE ── 6-hour window ──▶ AUTO_CLOSED
```

A responder declining/cancelling **does NOT cancel the emergency** —
escalation continues automatically via the background worker.

---

## Quick Start

### 1. Backend

```bash
cd csfix
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env           # edit SECRET_KEY at minimum

python manage.py migrate
python manage.py seed_demo     # optional: loads demo societies + users

# Terminal A — API server
python manage.py runserver

# Terminal B — Automatic escalation worker (required for timed escalation)
python manage.py process_escalations
```

### 2. Frontend

```bash
cd csfix/frontend
cp .env.example .env           # defaults point to http://127.0.0.1:8000/api/
npm install
npm run dev                    # http://localhost:5173
```

---

## Environment Variables (Backend — `.env`)

| Variable               | Default               | Description                     |
|------------------------|-----------------------|---------------------------------|
| `DJANGO_SECRET_KEY`    | —                     | **Required** in production      |
| `DJANGO_DEBUG`         | `1`                   | Set to `0` in production        |
| `DJANGO_ALLOWED_HOSTS` | `127.0.0.1,localhost` | Comma-separated hostnames       |
| `DB_ENGINE`            | SQLite                | Set to `postgresql` for Postgres|
| `DB_NAME`              | `citizen_safety`      | Database name                   |
| `DB_USER`              | `postgres`            |                                 |
| `DB_PASSWORD`          | `postgres`            |                                 |
| `DB_HOST`              | `127.0.0.1`           |                                 |
| `DB_PORT`              | `5432`                |                                 |
| `EMAIL_BACKEND`        | console               | Set to smtp for real email      |

## Environment Variables (Frontend — `frontend/.env`)

| Variable            | Default                         |
|---------------------|---------------------------------|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000/api/`   |
| `VITE_WS_BASE_URL`  | `ws://127.0.0.1:8000`          |

---

## Provisioning the First Platform Admin

The platform superadmin is the only account that can create new societies
and provision their dedicated society admins:

```bash
python manage.py provision_admin \
    --username superadmin \
    --phone 9000000000 \
    --email admin@example.com
# Outputs a temporary password — change on first login
```

After that, log in as the superadmin and use
**Admin Dashboard → Society Management → Create Society + Admin**.

---

## Running Tests

```bash
cd csfix
python manage.py test api --verbosity=2
# Expected: 31 passed, 0 failed
```

---

## API Summary

All endpoints are prefixed with `/api/`.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `register/` | Public registration (RESIDENT / VOLUNTEER / SECURITY) |
| POST | `login/` | JWT token pair |
| POST | `refresh/` | Refresh access token |
| GET/PATCH | `profile/` | Current user profile |
| POST | `profile/change-password/` | Change password |
| PATCH | `profile/volunteer-status/` | Set AVAILABLE / BUSY / OFFLINE |
| POST/GET | `profile/location/` | Live responder location |
| POST | `password-reset/` | Send password reset email |
| POST | `password-reset/confirm/` | Confirm reset |

### SOS & Emergencies
| Method | Path | Description |
|--------|------|-------------|
| POST | `sos/` | Trigger SOS (RESIDENT only) |
| POST | `emergencies/{id}/process-escalation/` | Advance escalation (also runs in background) |
| GET | `emergencies/` | List (role-scoped) |
| GET | `emergencies/analytics/` | Stats and charts |
| GET | `emergencies/pending-queue/` | Open community queue |
| PATCH | `emergencies/{id}/security-accept/` | Security accepts |
| PATCH | `emergencies/{id}/accept/` | Volunteer accepts |
| PATCH | `emergencies/{id}/pending-accept/` | Community member accepts |
| PATCH | `emergencies/{id}/guardian-response/` | Guardian ACCEPT / DECLINE / CANCEL |
| PATCH | `emergencies/{id}/mark-reached/` | Responder reached location |
| PATCH | `emergencies/{id}/start-assistance/` | Start IN_PROGRESS |
| PATCH | `emergencies/{id}/resolve/` | Mark RESOLVED |
| PATCH | `emergencies/{id}/cancel/` | Responder cancels (returns to queue) |
| PATCH | `emergencies/{id}/resident-cancel/` | Resident cancels own emergency |
| PATCH | `emergencies/{id}/still-need-help/` | Reopen after resolution |
| POST | `emergencies/{id}/request-handover/` | Request handover |
| POST | `emergencies/{id}/accept-handover/` | Accept handover |
| POST | `emergencies/{id}/request-additional-help/` | Request additional help |
| POST | `emergencies/{id}/accept-additional-help/` | Join as additional responder |
| GET | `emergencies/{id}/history/` | Audit log for this emergency |
| PATCH | `emergencies/{id}/assign/` | Admin manual assignment |

### Guardians
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `guardians/` | List / create guardian |
| PATCH | `guardians/{id}/` | Update guardian |
| DELETE | `guardians/{id}/` | Soft-delete (mark inactive) |
| POST | `guardians/{id}/accept/` | Accept guardian relationship |
| POST | `guardians/{id}/decline/` | Decline relationship |
| POST | `guardians/{id}/verify/` | Admin verify guardian |
| POST | `guardians/{id}/create_login/` | Admin create guardian login |
| POST | `guardians/request/` | Guardian requests to link with resident |
| GET | `guardians/mine/` | Guardian's own linked residents |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `dashboard/` | Platform/society stats |
| GET/POST | `users/` | User management (admin-scoped) |
| PATCH | `users/{id}/verify/` | Verify user |
| PATCH | `users/{id}/disable/` | Disable user |
| PATCH | `users/{id}/activate/` | Activate user |
| GET/POST | `societies/` | Society management |
| POST | `societies/provision/` | Create society + admin (platform admin only) |
| GET/POST | `blocks/` | Block / tower management |
| GET/POST | `flats/` | Flat management |
| GET | `registration-options/` | Societies / blocks / flats for registration form |

### Notifications
| Method | Path | Description |
|--------|------|-------------|
| GET | `notifications/` | User notifications (scoped) |
| PATCH | `notifications/{id}/read/` | Mark read |
| PATCH | `notifications/read_all/` | Mark all read |

### Responder Membership
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `responder-requests/` | List / submit membership request |
| POST | `responder-requests/{id}/accept/` | Accept invitation / request |
| POST | `responder-requests/{id}/decline/` | Decline |
| POST | `responder-requests/invite/` | Admin invites a responder |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| GET | `chat-messages/?emergency={id}` | Get chat for an emergency |
| POST | `chat-messages/` | Send a message |

---

## Background Escalation Worker

The escalation worker (`process_escalations` management command) runs as a
continuous loop in a second terminal:

```bash
python manage.py process_escalations --interval 1.0
```

It checks every second for:
- Any `EmergencyEscalation` with `response_status=WAITING` and
  `response_deadline <= now` → advances to next stage
- Any `PENDING` stage older than 6 hours → `AUTO_CLOSED`

In production, run this with `supervisord`, `systemd`, or a process manager.

---

## Demo Accounts (after `seed_demo`)

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | ADMIN (society-scoped) |
| siva | siva123 | RESIDENT |
| security1 | security123 | SECURITY |
| volunteer1 | volunteer123 | VOLUNTEER |

---

## Test Results

```
Ran 31 tests in ~60s
OK

Tests cover:
- Login, registration, public admin registration blocked
- Password change
- Society isolation (users, emergencies, notifications)
- SOS creation with GPS, without GPS, with invalid category
- Escalation skips to SECURITY when no guardian configured
- Guardian decline does NOT cancel emergency
- Guardian cancellation triggers escalation
- One person guardian for multiple residents
- Guardian accept → emergency ASSIGNED
- Admin verify user (society-scoped)
- Platform admin provisions society
- Security accept → BUSY, resolve → AVAILABLE
- Volunteer accept, availability toggle
- Handover request, additional help request
- Responder cancel → emergency back to PENDING
- Resident cancel own emergency
- Audit log created on SOS
- History endpoint returns audit logs
- Cross-society pending accept blocked
```
