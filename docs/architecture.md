# Architecture

The repository is split into independently deployable `frontend/` and `backend/` workspaces. The API is versioned under `/api/v1`.

## Backend

- `models/`: Mongoose schemas, indexes, and persistence constraints.
- `validators/`: Zod request schemas and validation middleware.
- `routes/`: endpoint and middleware composition only.
- `controllers/`: HTTP translation and response formatting.
- `services/`: business rules and database workflows.
- `middleware/`: authentication, authorization, and error handling.
- `config/`: environment parsing and database connection.

Authentication uses a signed JWT in an HttpOnly cookie. A separate signed double-submit CSRF cookie/header pair protects mutations. Cookies are SameSite=Lax; production cookies are Secure and host-only. Production frontend and API custom domains must share the same registrable domain so browsers treat credentialed frontend-to-API requests as same-site. The frontend sends credentials and obtains the CSRF token before the first mutation.

Sensitive multi-document workflows should use MongoDB transactions. That requires an Atlas replica set (including Atlas Free tier) or another replica-set deployment. Any fallback without transaction support must use conditional atomic updates, idempotency constraints, and documented compensation handling.

Application approval locks the hostel, room, and tenant records in one transaction, rechecks tenant eligibility and ACTIVE stay counts, creates the stay, and changes the application to APPROVED atomically. Room and hostel version increments serialize that commit against configuration edits. Unique partial indexes provide a final guarantee of one pending application and one active stay per tenant. Stay closure also locks those resources before setting LEFT and the leaving date.

Rent generation scans ACTIVE stays and creates monthly obligations through the next anchored due date. Each obligation is unique per stay and billing period; repeated scheduled calls are safe. Payment submission locks the rent due and permits one pending request for that obligation. Owner approval locks the due in a transaction, records the permanent payment decision event, and allocates paise to the outstanding balance. Rejection leaves the balance unchanged and permits resubmission. An external scheduler calls `/api/v1/jobs/generate-rent-dues` with the separately configured `JOB_SECRET`; the web process has no timer dependency.

Rent changes are requests, not direct edits to agreed rent. The server selects the next eligible anchored cycle after the latest generated due and approved rent term. Review and due generation both lock the stay record; approval adds an effective-dated rent term. Existing dues are never rewritten. Deposit receipts, refunds, deductions, and adjustments are separate append-only transactions scoped to a single stay. A transaction locks its stay and checks that a refund or deduction cannot make the balance negative.

## Frontend

React Router handles routes; `AuthProvider` resolves the signed-in user from `/auth/me`; Axios centralizes credentials and CSRF handling. Shared layouts/components live under `components/`, and domain UI belongs in feature folders. Frontend navigation is convenience only; backend authorization is authoritative.

## Date and money policy

Business dates are interpreted in Asia/Kolkata. Persist due dates as UTC instants corresponding to local calendar dates and display them in `Asia/Kolkata`. Store INR in integer paise. Due cycles anchor on the confirmed move-in day, clamped to the final calendar day for shorter months. Late payment never shifts the next cycle. Full-month charging is the initial rule unless a separately documented proration policy is introduced.

## Request logging and errors

The request middleware assigns/accepts a correlation ID, returns it in `X-Request-ID`, and logs method, route, status, duration, and authenticated user ID/role after the response. It never logs request bodies, cookies, query values, or authorization secrets. The central error handler maps application, validation, duplicate-key, and unexpected failures to a stable response envelope and logs diagnostics with the request ID; stack traces are omitted in production responses and production logs. Unhandled rejections and uncaught exceptions initiate graceful server/database shutdown.

## Theme and search

The authenticated layout stores the Light/Dark preference in `localStorage` and sets the document theme attribute. An inline startup script applies the saved value before React mounts to reduce theme flash. Server-backed property, account, and rent-due searches debounce input for 1,500 ms and ignore stale responses; pagination and filters are still applied on the server.

## Phase status

The application includes owner-scoped queries, tenant-safe public serializers, derived bed availability, and recorded room configuration history. Application approval preserves application/stay history and serializes room assignment/closure. Rent dues use anchored generation; payment requests support partial approval allocations and durable status history. Rent changes are effective-dated and deposits use per-stay ledgers. Admin views support owner onboarding, account activation, audited financial corrections, audit search, allowlisted restoration, and hostel-owner assignment. Hostel and room deletion is soft deletion. Current timer-related report: the source has an external rent-generation job and does not contain a room-assignment timer component; therefore no timer crash can be reproduced or patched from this checkout.

Owner and tenant dashboards aggregate persisted data. Owner rent summaries accept a validated `YYYY-MM` period, while rent obligations accept month/status filters and tenant-name or room-identifier search. Search candidate sets derive from the already-authorized rent-due scope. The Render Blueprint defines separate API and static frontend services; deployment still requires environment-specific Atlas and origin values.
