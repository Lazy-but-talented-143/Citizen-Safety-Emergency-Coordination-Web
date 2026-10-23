# PROJECT ARCHITECTURE DOCUMENTATION

## 1. Project Purpose
The **Citizen Safety and Emergency Coordination Platform** is a production-grade multi-tenant emergency dispatch and community coordination platform designed for residential societies and apartment complexes. It coordinates rapid emergency response workflows among residents, primary/secondary guardians, emergency contacts, on-duty security personnel, community volunteers, society managers, and platform superadmins.

---

## 2. User Roles & Access Hierarchy
- **RESIDENT**: Triggers emergency SOS alerts, selects category, manages primary/secondary guardians and emergency contacts, chats with assigned responders, monitors real-time incident status, cancels emergency with 2-step confirmation.
- **PRIMARY GUARDIAN**: First-tier automatic emergency recipient, full access to protected resident's live incident details, reverse request approval capability.
- **SECONDARY GUARDIAN**: Second-tier fallback emergency recipient, receives escalations if primary guardian is unreachable or transfers case.
- **EMERGENCY CONTACT**: Registered fallback contact receiving SMS/Email/In-App emergency notifications.
- **SECURITY**: Stationed society responder, toggles availability (AVAILABLE / BUSY / OFFLINE), receives society emergency dispatch, accepts cases, logs reach/assistance/resolution timestamps.
- **VOLUNTEER**: Community volunteer responder, toggles availability, receives escalated society emergencies when guardians or security are unavailable.
- **SOCIETY ADMIN**: Manages society structure (Blocks, Floors, Flats), provisions residents/security/volunteers, approves/invites responders, monitors live emergencies and statistics.
- **PLATFORM ADMIN**: Global superuser (`is_superuser=True`, `role="ADMIN"`), provisions new societies and society admins, accesses global system audits.

---

## 3. Frontend Architecture
- **Framework**: React 18 SPA initialized with Vite.
- **Routing**: React Router DOM v6 with client-side session validation via `ProtectedRoute.jsx`.
- **API Layer**: Axios client (`frontend/src/api/axios.js`) configured with base URL, JWT `Authorization: Bearer <token>` injection, request/response interceptors, and automated refresh handling.
- **UI & Layout**: Vanilla CSS design system with CSS custom properties (`index.css` & `App.css`), responsive flex/grid layouts, custom interactive components for emergency chat (`EmergencyChat.jsx`), guardian panels (`PrimaryGuardian.jsx`, `SecondaryGuardian.jsx`, `EmergencyContact.jsx`), and role dashboards (`ResidentDashboard`, `SecurityDashboard`, `VolunteerDashboard`, `GuardianDashboard`).

---

## 4. Backend Architecture
- **Framework**: Django 5.1.x with Django REST Framework (DRF).
- **Service Layer Pattern**: Business logic decoupled into domain services (`api/services/`):
  - `escalation.py`: Automated multi-tier escalation engine with deadline management.
  - `notifications.py`: Multi-channel notification router (In-App, Email, SMS, Push).
  - `platform.py`: Cross-society platform authorization and multi-tenant scoping guardrails.
- **Permissions**: Custom DRF permission classes (`IsAdmin`, `IsResident`, `IsSecurity`, `IsVolunteer`, `IsPlatformAdmin`, `IsAdminOrSecurity`).

---

## 5. Database Architecture
- **Engine**: SQLite3 with strict schema constraints and repair script support (`repair_demo_db.py`).
- **Core Entities**:
  - `accounts.User`: Custom user model inheriting from `AbstractUser`, extending with `role`, `phone`, `volunteer_status`, `is_verified`, `profile_photo`, `society`, `block`, `flat`.
  - `accounts.Guardian`: Bidirectional guardian relationships with `relationship_status` (`PENDING`, `ACCEPTED`, `DECLINED`, `CANCELLED`, `REVOKED`) and explicit timestamps (`accepted_at`, `declined_at`, `cancelled_at`, `revoked_at`).
  - `accounts.ResponderMembershipRequest`: Two-sided approval requests/invitations (`SECURITY` / `VOLUNTEER` <-> `ADMIN`).
  - `emergency.Emergency`: Core incident entity with 11 emergency types, priority, status lifecycle, location, GPS coords, assigned security/volunteer, timestamps.
  - `emergency.EmergencyEscalation`: Escalation logs tracking contact type, response status, deadlines, and cancel reason.
  - `emergency.Notification`: Multi-channel notification delivery records.
  - `emergency.AuditLog`: Immutable emergency audit trail.
  - `emergency.ChatMessage`: Incident-scoped communication messages.
  - `society.Society`, `society.Block`, `society.Flat`: Hierarchical multi-tenant society structure.

---

## 6. API Architecture
- RESTful ViewSets & custom API endpoints registered in `api/urls.py`:
  - `/api/sos/`: Emergency trigger endpoint.
  - `/api/emergencies/`: Standard DRF ViewSet for emergency management and filters.
  - `/api/emergencies/<id>/process-escalation/`: Multi-tier escalation engine trigger.
  - `/api/guardians/`: Guardian relationship management.
  - `/api/responder-requests/`: Security/Volunteer membership approval workflow.
  - `/api/dashboard/`: Combined role-based dashboard metrics.

---

## 7. Authentication
- JWT Token Authentication via `rest_framework_simplejwt`.
- `/api/login/`: Token pair generation (`access` + `refresh`).
- `/api/refresh/`: Access token refresh.
- Passwords validated using Django default password validators (`validate_password`).

---

## 8. Authorization & Multi-Tenant Scoping
- **Society Scoping**: Non-platform admin users are strictly filtered by `user.society_id`.
- **Object-Level Checks**: Verification of request ownership and assigned role before performing state mutations (accepting/resolving emergency, approving guardians).

---

## 9. Emergency Lifecycle
```
PENDING (SOS Triggered)
  ├── 1. Escalation created for Primary/Secondary/Emergency Guardians
  ├── 2. Security notified (Assigned -> ASSIGNED)
  ├── 3. Open Pending Queue / Volunteers notified if Security/Guardians deadline expires
  ├── 4. Responder Reached -> Assistance Started -> IN_PROGRESS
  └── 5. Resolution with closure note -> RESOLVED (or CANCELLED by Resident with 2-step confirmation)
```

---

## 10. Guardian Lifecycle
```
PENDING (Request created by Resident or Guardian)
  ├── ACCEPTED  (Timestamps: accepted_at)
  ├── DECLINED  (Timestamps: declined_at)
  ├── CANCELLED (Timestamps: cancelled_at)
  └── REVOKED   (Timestamps: revoked_at)
```

---

## 11. Responder Approval Lifecycle
```
SECURITY / VOLUNTEER  <--->  SOCIETY ADMIN
  ├── Direction: REQUEST (Responder applies -> Admin accepts/declines)
  └── Direction: INVITE  (Admin invites -> Responder accepts/declines)
```

---

## 12. Society Management & Isolation
- Multi-tenant tenant hierarchy: `Society` $\rightarrow$ `Block` $\rightarrow$ `Flat` $\rightarrow$ `User`.
- Cross-tenant data leaks prevented at database query level across all ViewSets.

---

## 13. Notification Lifecycle
1. Notification object created in database (`IN_APP`, `EMAIL`, `SMS`, `PUSH`).
2. Dispatch service routes message to recipient.
3. Marked delivered upon successful transmission (`delivered_at`).
4. Real-time websocket broadcast triggered via Channels layer if available.
5. Marked read when user views notification (`read_at`).

---

## 14. Chat Lifecycle
- Emergency-scoped chat (`ChatMessage`).
- Access allowed for emergency owner, assigned security, assigned volunteer, additional responders, and society admin.

---

## 15. Important Dependencies
- `django`: Web framework.
- `djangorestframework`: API framework.
- `djangorestframework-simplejwt`: JWT authentication.
- `channels` / `asgiref`: Real-time capability.
- `react`, `react-dom`, `react-router-dom`: Frontend SPA.
- `axios`: API client.
- `lucide-react`: UI iconography.

---

## 16. Important Business Rules
1. SOS button countdown is 5 seconds. If unselected, defaults to `OTHER` emergency.
2. Emergency cancellation by resident requires two confirmations.
3. Security/Volunteer must have `ACCEPTED` membership request to accept emergencies in a society.
4. One user can act as guardian for multiple residents (no OneToOne constraint).

---

## 17. Important Security Rules
1. Password reset tokens are single-use with expiration.
2. Cross-society emergency access is strictly denied for non-superadmins.
3. Audits are immutable and logged for all state mutations.
