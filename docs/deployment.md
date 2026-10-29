# Deployment

## Local

Copy each `.env.example` to `.env`, use a local MongoDB or Atlas URI, then run `npm install` and `npm run dev` from the repository root. The API waits for the database before accepting traffic. `/health` reports HTTP 503 while the database is disconnected.

Set `ADMIN_NAME`, `ADMIN_PHONE`, and `ADMIN_PASSWORD` in the backend environment. Startup creates the account if that normalized Indian phone number is unused. The operation can also be run with `npm run create-initial-admin -w backend` and is idempotent. Existing admins are not reset when the environment password changes. If the phone belongs to a non-admin account, initialization fails without changing that account. Use strong, private production values; the example values in `backend/.env.example` are for development only. An admin can onboard owner accounts from the protected admin workspace.

## Render-compatible deployment

The repository includes a `render.yaml` Blueprint for the Node API and static Vite frontend. Connect the repository in Render and supply the unsynced `MONGODB_URI`, `CLIENT_URL`, and `VITE_API_BASE_URL` values when prompted. Production API cookies use `SameSite=None; Secure` for cross-origin requests and remain host-only; a `Domain` attribute cannot make a cookie shared between unrelated domains and is not needed for browser requests back to the API host. Render's separate `onrender.com` hostnames are different sites because `onrender.com` is a public suffix, so browser third-party-cookie restrictions can still prevent cookies from being stored or sent even with `SameSite=None`. Assign custom domains under the same registrable domain where possible (for example, frontend and API subdomains of a domain you control). Set `CLIENT_URL` to the exact frontend origin (scheme and hostname, no path or trailing slash) and `VITE_API_BASE_URL` to the API origin plus `/api/v1`; rebuild the static site after changing its public API URL.

Create two services:

1. **API web service**: root directory repository root, build command `npm ci --omit=dev`, start command `npm start -w backend`.
2. **Static site**: root directory repository root, set `SKIP_INSTALL_DEPS=true`, build command `npm ci --include=dev && npm run build -w frontend`, publish directory `frontend/dist`.

Set server variables `NODE_ENV=production`, `PORT` (provided by Render), `MONGODB_URI`, `JWT_SECRET`, `COOKIE_SECRET`, `JOB_SECRET`, `CLIENT_URL` (exact custom frontend origin), and `LOG_LEVEL`. Set the static site's `VITE_API_BASE_URL` to the deployed custom API origin plus `/api/v1`, then rebuild. Frontend variables are public. Never put database credentials or signing secrets in frontend variables.

Use HTTPS for both services because production cookies require Secure. The API accepts only the exact credentialed CORS origin from `CLIENT_URL`; frontend API requests use Axios `withCredentials`. A reverse-proxy trust setting is enabled in production. Keep Atlas access restricted to the service's network path where practical, use a dedicated least-privilege database user, and ensure Atlas is configured as a replica set for transaction-backed room history, assignment, payment, rent-change, deposit, and admin workflows. Local standalone MongoDB is insufficient for these operations. Do not rely on Render local disk for uploads or persistence.

The new notification `eventKey` field is optional for existing documents, so no data backfill is needed. If automatic Mongoose index creation is disabled in the deployment, apply the deduplication index once in the application database: `db.notifications.createIndex({ eventKey: 1 }, { unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } })`.

Configure an external scheduler to POST `https://<api-host>/api/v1/jobs/generate-rent-dues` with the `x-job-secret: <JOB_SECRET>` header. Repeated calls are idempotent. Owners and admins can also use **Reconcile dues** on the Rent & payments page to backfill missing periods for existing stays; this preserves existing dues and payments. Generation includes active stays and ended stays up to their leaving date. Rent generation and payment allocation use MongoDB transactions, so Atlas or another replica set is required. The job returns checked stays, created dues, and periods already present.

Payment retries use a partial unique index on `payments.idempotencyKey`; legacy payment records without a key are unaffected. If Mongoose automatic index creation is disabled, create it once with `db.payments.createIndex({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } })`.

## Troubleshooting

- **Invalid environment configuration**: compare variable names and minimum secret lengths with `backend/.env.example`.
- **CORS errors**: `CLIENT_URL` must exactly match the browser origin, including scheme and any port.
- **CSRF validation or session not retained**: confirm the API's CSRF response sets a Secure cookie, `CLIENT_URL` is the browser's exact frontend origin, and `VITE_API_BASE_URL` uses the API `/api/v1` URL. Check the browser's third-party-cookie policy and backend `csrf_validation_failed` reason; logs report cookie/header presence without token values. Custom domains under one registrable domain are more reliable than separate `onrender.com` domains. Never log token or cookie values.
- **Database unavailable**: verify Atlas IP/network access, database credentials, and URI encoding for reserved password characters.
