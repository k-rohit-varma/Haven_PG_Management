# API (current)

Base URL: `/api/v1`. Responses use `{ success, data }` on success and `{ success: false, error: { code, message, details? }, requestId }` on errors.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/csrf` | Issue a CSRF cookie/token pair |
| POST | `/auth/register` | Register a tenant and establish a session |
| POST | `/auth/login` | Sign in; rate limited |
| POST | `/auth/logout` | Clear the session |
| GET | `/auth/me` | Return the current active account |
| GET | `/health` | API and database readiness (outside versioned API) |
| GET | `/hostels` | Paginated hostels; tenants see eligible active listings, including zero-vacancy listings with availability counts |
| GET | `/hostels/:hostelId` | Authorized hostel details and room summary |
| POST | `/hostels` | ADMIN creates a hostel and assigns an active OWNER via `ownerId` |
| PATCH | `/hostels/:hostelId/owner` | ADMIN reassigns a hostel to an active OWNER; audited and notifies both owners |
| PATCH | `/hostels/:hostelId/block` | ADMIN blocks/unblocks access with an optional reason; records remain intact |
| PATCH | `/hostels/:hostelId` | Update owned hostel details/status |
| DELETE | `/hostels/:hostelId` | Soft-delete an owned hostel when it has no active occupants |
| GET | `/hostels/:hostelId/rooms` | Paginated authorized rooms; supports `search`, `genderEligibility`, `sharingType`, `minCapacity`, `maxCapacity`, `minRentPaise`, `maxRentPaise`, `minAvailableBeds`, `availability`, `active`, `sortBy`, and `limit` |
| POST | `/hostels/:hostelId/rooms` | Create room and initial configuration-history record |
| PATCH | `/rooms/:roomId` | Update room configuration with occupancy and eligibility checks |
| DELETE | `/rooms/:roomId` | Soft-delete an unoccupied room and retain history |
| GET | `/rooms/:roomId/history` | Read append-only room configuration history |
| POST | `/tenant-applications` | Tenant applies to an active hostel; applications do not require a current vacancy |
| GET | `/tenant-applications/my` | Tenant's application statuses and decisions |
| GET | `/tenant-applications/owner` | Owner/admin applications across their hostels, paginated/filterable |
| GET | `/hostels/:hostelId/applications` | Owner/admin applications for one owned hostel |
| PATCH | `/tenant-applications/:applicationId/decision` | Reject a pending application with a reason |
| POST | `/tenant-applications/:applicationId/approve` | Approve an application without assigning a room |
| POST | `/tenant-applications/:applicationId/cancel` | Tenant cancels their own pending application |
| POST | `/tenant-applications/:applicationId/approve-and-assign` | Atomically approve and create a complete stay |
| GET | `/rooms/:roomId` | Room details; occupant fields are role-scoped and tenants receive names only |
| GET | `/stays/my` | Tenant current and historical stays |
| GET | `/stays/owner` | Owner/admin stays across their hostels |
| GET | `/stays/hostels/:hostelId` | Owner/admin stays for one owned hostel |
| GET | `/stays/tenants/:tenantId` | Owner/admin stay history for a tenant in authorized hostels |
| GET | `/stays/:stayId` | Owner, assigned tenant, or admin reads a stay |
| POST | `/stays/:stayId/mark-left` | Owner/admin closes an active stay with a leaving date |
| GET | `/rent-dues/my` | Tenant rent obligations, balances, and statuses |
| GET | `/rent-dues` | Owner/admin dues with month, status, tenant-name/room search, and hostel filters |
| GET | `/rent-dues/:rentDueId` | Authorized rent due and balance |
| GET | `/rent-dues/summary` | Authorized totals grouped by status |
| GET | `/rent-dues/hostels/:hostelId` | Dues for one owned hostel |
| POST | `/payments` | Tenant submits an outside-app payment for verification |
| GET | `/payments/my` | Tenant payment history |
| GET | `/payments/owner` | Owner/admin payment requests with filters |
| GET | `/payments/:paymentId` | Authorized payment request and decision data |
| GET | `/payments/:paymentId/history` | Append-only status events |
| PATCH | `/payments/:paymentId/decision` | Owner/admin approves or rejects a pending payment |
| POST | `/jobs/generate-rent-dues` | External scheduler generates anchored dues; requires `x-job-secret` |
| GET | `/dashboards/owner?month=YYYY-MM` | Owner-scoped occupancy, selected-month rent totals, pending-payment, and recent-decision summary |
| GET | `/dashboards/tenant` | Tenant-only stay, due, balance, application, and payment summary |
| POST | `/rent-change-requests` | Tenant requests a new rent for the next eligible anchored cycle |
| GET | `/rent-change-requests/my` | Tenant's rent-change requests and review history |
| GET | `/rent-change-requests/owner` | Owner/admin rent-change requests for authorized hostels |
| GET | `/rent-change-requests/stays/:stayId` | Authorized rent-change history for a stay |
| PATCH | `/rent-change-requests/:requestId/decision` | Owner/admin approves or rejects a pending request |
| POST | `/room-change-requests` | Tenant requests a move to another eligible room in the same hostel |
| GET | `/room-change-requests/my` | Tenant views room-change requests and decisions |
| GET | `/room-change-requests/owner` | Owner/admin reviews authorized room-change requests |
| PATCH | `/room-change-requests/:requestId/decision` | Owner/admin approves or rejects; transfers preserve the existing Stay and its financial history |
| GET | `/stays/:stayId/deposit` | Authorized initial deposit, recorded balance, and transactions |
| GET | `/stays/:stayId/deposit/transactions` | Paginated deposit transaction history |
| POST | `/stays/:stayId/deposit/transactions` | Owner/admin records a receipt, refund, deduction, or adjustment |
| GET | `/admin/summary` | System-wide account, property, stay, payment, and rent totals |
| GET | `/admin/users` | Paginated admin-only user list with account filters |
| POST | `/admin/users/owners` | Admin creates an owner account with a temporary password |
| PATCH | `/admin/users/:userId/status` | Admin activates/deactivates an account with an audit reason |
| GET | `/admin/hostels` | System-wide hostel list, optionally including deleted records |
| GET | `/admin/rooms` | System-wide room list, optionally including deleted records |
| GET | `/admin/payments` | System-wide payment requests |
| GET | `/admin/rent-dues` | System-wide rent obligations |
| GET | `/admin/audit-logs` | Paginated audit history with entity/actor filters |
| PATCH | `/admin/stays/:stayId/financial-terms` | Audited rent, deposit balance, or move-in date correction |
| POST | `/admin/records/:entityType/:entityId/restore` | Restore only allowlisted USER, HOSTEL, or ROOM records |

Mutations require `X-CSRF-Token` matching the `csrf` cookie. Authenticated routes require the HttpOnly `session` cookie. Public registration accepts name, Indian phone number, password, and optional gender; role selection is rejected. Phone input accepts a 10-digit Indian mobile, `0` prefix, `91` prefix, or `+91` prefix and is stored as `+91…`. Legacy email users can still log in with `{ "email": "…", "password": "…" }`; new tenant registration uses `{ "phone": "…", "password": "…" }`. Password policy: at least 10 characters with lowercase, uppercase, and a digit; bcrypt cost 12.

Admin-only endpoints include `GET /api/v1/admin/summary`, paginated/filterable `GET /api/v1/admin/audit-logs`, `PATCH /api/v1/admin/users/:userId/role` with `{ "role": "OWNER", "reason": "…" }`, and `PATCH /api/v1/hostels/:hostelId/owner` with `{ "ownerId": "…" }`. Owner onboarding accepts `{ "identifier": "email-or-Indian-phone", "temporaryPassword": "…", ... }`; email and phone values are stored in their respective fields. Authenticated notification endpoints are `GET /api/v1/notifications`, `PATCH /api/v1/notifications/read-all`, and `PATCH /api/v1/notifications/:notificationId/read`. Notification reads and updates are restricted to the recipient.

Expected errors include 401 unauthenticated/invalid credentials, 403 forbidden/CSRF failure, 404 unknown route, 409 duplicate/conflicting records, and 422 invalid input. Future endpoint groups are documented in the project brief and will be added with their corresponding domain phases.

Property/room mutations accept explicit allowlisted fields only. Room `defaultRentPaise` is an integer in INR paise. Room capacity must be at least its sharing type and cannot be reduced below active occupancy. Room gender eligibility must comply with hostel policy; existing active tenants are checked before changing eligibility. Hostel policy changes are rejected while any configured room is incompatible. Room create/configuration/delete and associated history use MongoDB transactions; configure Atlas or a local replica set.

Applications allow a single PENDING application per tenant. Only the selected hostel's owner (or ADMIN) can reject or assign. Approval cannot be done without room, move-in date, monthly rent, and deposit; the transaction rechecks gender, ownership, tenant active-stay state, and capacity. Money fields use integer paise and dates are `YYYY-MM-DD` interpreted in Asia/Kolkata. The move-in date has no general edit endpoint and is immutable in the Stay schema. Marking a tenant as left sets status LEFT and preserves all stay terms/events for history.

Rent obligations cover full monthly periods. The first due date is one month after move-in, anchored to the original day and clamped to shorter months. Late payment never shifts later dates. Submission alone does not settle rent; only an owner/admin approval allocates to the balance. Partial payments are allowed, one pending request per due is enforced, and rejected attempts remain available for history and resubmission. The external generation job is idempotent and requires `JOB_SECRET` and transaction-capable MongoDB.

Rent-change requests select their effective date on the server: the first anchored cycle after the latest generated rent due and approved rent term. The owner cannot approve a change if a rent due already exists on or after that date. Approval appends a historical rent term; existing dues and payments are preserved. Deposit amounts use a separate ledger and never reduce rent due balances. Receipts are limited to the agreed initial deposit unless an explicit adjustment is recorded; refunds and deductions cannot exceed the deposit balance.

Admin routes enforce the ADMIN role on the server. Public registration cannot create an admin or owner. Bootstrap the first administrator with the one-time CLI command documented in the README; admins then onboard owners through the authenticated workspace. Restores are allowlisted and audited. Financial corrections require a reason and preserve before/after snapshots; correct move-in date and rent in separate audit entries.
