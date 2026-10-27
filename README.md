# Haven — PG and Hostel Management

A modular MERN application for managing PG properties, rooms, tenant stays, rent obligations, deposits, and payment verification. It includes secure tenant registration/login; owner-scoped hostel and room management; tenant applications; atomic room assignment and stay closure; anchored rent cycles; idempotent rent generation; payment submissions with partial settlements; owner verification; effective-dated rent changes; a separate deposit ledger; controlled owner onboarding; audited financial corrections; record restoration; role dashboards; request-correlated structured logs; admin-controlled hostel ownership assignment; a persisted Light/Dark theme; and 1,500 ms debounced property/account/rent search. See the feature documentation for current behavior and limitations.

## Stack

- React 18, Vite, React Router, Axios, React Hook Form, Zod, Tailwind CSS
- Node.js ES modules, Express 4, MongoDB/Mongoose, JWT, bcryptjs
- HttpOnly JWT session cookie, same-site policy, double-submit CSRF validation, CORS allowlist, Helmet, and login rate limiting

## Structure

```text
backend/src/{config,controllers,errors,middleware,models,routes,services,utils,validators}
backend/tests/
frontend/src/{components,features,pages,routes,services,utils}
docs/
```

Models own persistence rules, services own business operations, controllers map HTTP requests to service calls, and routes compose middleware and controllers. The frontend keeps authentication, UI layout, and pages in separate modules.

## Prerequisites and local setup

- Node.js 20 or later and npm
- MongoDB Atlas, or a local MongoDB replica set (property history, stay, and payment workflows use transactions)

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm install
npm run dev
```

Set `MONGODB_URI` to your database URL. Replace `JWT_SECRET`, `COOKIE_SECRET`, and `JOB_SECRET` with independent random values of at least 32 characters. Configure an external scheduler to POST `/api/v1/jobs/generate-rent-dues` with the `x-job-secret` header. Set `CLIENT_URL` to the exact frontend origin. `VITE_API_BASE_URL` is public configuration only; never put secrets in a Vite variable. Frontend runs on port 5173 and API on port 4000 by default. For local MongoDB, start a single-node replica set and include `replicaSet=<name>` in the URI.

Tenant accounts register with a name, Indian mobile number, and password. Phone numbers are normalized to `+91…`; phone is unique. Existing email accounts can continue logging in with their email and password. Public registration always creates `TENANT` and rejects role fields.

Configure `ADMIN_NAME`, `ADMIN_PHONE`, and `ADMIN_PASSWORD` in `backend/.env`. The values in `backend/.env.example` are development placeholders only; replace them before use and choose a strong password. On backend startup, the server creates the configured ADMIN if that phone is unused. Setup is idempotent: an existing admin is never reset, and a phone owned by a non-admin causes startup to fail safely. You can also run `npm run create-initial-admin -w backend` after configuring the backend environment. Admin passwords are bcrypt-hashed and never logged. Production requires all three values. The admin workspace can then create owner accounts.

## Commands

- `npm run dev` — run API and frontend in parallel
- `npm run build` — build the frontend for deployment
- `npm run lint` — lint/check frontend and backend source
- `npm test` — run backend tests
- `npm test -w frontend` — run frontend form tests
- `npm start -w backend` — start the API in production

## Authentication and security notes

The signed JWT is held in an HttpOnly cookie and is never returned in JSON. Mutating auth requests require a CSRF token fetched from `/api/v1/auth/csrf`. Production session cookies use Secure and SameSite=None for separately deployed frontend/API origins; configure HTTPS and an exact `CLIENT_URL`. New tenants authenticate with their phone number; legacy email accounts remain supported. Login errors do not reveal whether the account exists. Duplicate phone registration returns a clear 409 error.

Authorization middleware is enforced by the API. `authorize(...roles)` is available for role-specific routes. Hostel and room ownership is scoped in service queries; tenant listing serializers exclude owner and deletion metadata. Only ADMIN can create a property and must assign an eligible owner.

## Deployment

See [deployment notes](docs/deployment.md). Deploy `frontend/` as a static Vite site and `backend/` as a Node web service. Configure all server environment values in the hosting provider. Set Atlas Network Access to allow the deployed service, use a database user with least privilege, and restrict CORS to the frontend URL. Render's local disk is not used for persistent data.

## Detailed documentation

- [Architecture](docs/architecture.md)
- [Database schema](docs/database-schema.md)
- [Features and role workflows](docs/features.md)
- [API reference](docs/api-documentation.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)

## Current scope

Dedicated owner/tenant dashboards, rent, payment, rent-change, deposit, and admin screens use backend data. Rent dates are local Asia/Kolkata calendar dates. The first full rent cycle is due one month after move-in; subsequent due dates use the original day, clamped to each month's final day. Approved rent changes apply on a later anchored cycle and do not rewrite existing dues. Deposit balance is the sum of explicit receipts, refunds, deductions, and adjustments; it never offsets rent automatically. `npm test` runs unit tests and skips database integration tests unless the `TEST_*_MONGODB_URI` values point to disposable test databases whose names end in `_test`.
# Haven_PG_Management
