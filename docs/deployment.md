# Deployment

## Local

Copy each `.env.example` to `.env`, use a local MongoDB or Atlas URI, then run `npm install` and `npm run dev` from the repository root. The API waits for the database before accepting traffic. `/health` reports HTTP 503 while the database is disconnected.

Set `ADMIN_NAME`, `ADMIN_PHONE`, and `ADMIN_PASSWORD` in the backend environment. Startup creates the account if that normalized Indian phone number is unused. The operation can also be run with `npm run create-initial-admin -w backend` and is idempotent. Existing admins are not reset when the environment password changes. If the phone belongs to a non-admin account, initialization fails without changing that account. Use strong, private production values; the example values in `backend/.env.example` are for development only. An admin can onboard owner accounts from the protected admin workspace.

## Render-compatible deployment

The repository includes a `render.yaml` Blueprint for one Node web service that builds the Vite frontend and serves it from Express. Connect the repository in Render and use the blueprint. Set `CLIENT_URL` to the exact origin of the Render web service that will serve both the frontend and API. The frontend uses relative `/api/v1` requests by default, so no production `VITE_API_BASE_URL` is required.

Configure the single web service with root directory `.`, build command `npm ci --include=dev && npm run build -w frontend`, and start command `npm start -w backend`. The build creates `frontend/dist`; Express serves those assets and falls back to `index.html` for React routes. `/api/v1` and `/health` remain backend routes. Production cookies are Secure, host-only, and SameSite=Lax because browser and API share one origin. CORS remains restricted to `CLIENT_URL`; a same-origin request does not rely on third-party cookies.

Set server variables `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `COOKIE_SECRET`, `JOB_SECRET`, `CLIENT_URL` (the same service origin), `ADMIN_NAME`, `ADMIN_PHONE`, `ADMIN_PASSWORD`, and `LOG_LEVEL`. Render provides `PORT`. Frontend variables are public; never put database credentials or signing secrets in frontend variables. Keep Atlas access restricted to the service's network path where practical, use a dedicated least-privilege database user, and ensure Atlas is configured as a replica set for transaction-backed room history, assignment, payment, rent-change, deposit, and admin workflows. Local standalone MongoDB is insufficient for these operations. Do not rely on Render local disk for uploads or persistence.

The new notification `eventKey` field is optional for existing documents, so no data backfill is needed. If automatic Mongoose index creation is disabled in the deployment, apply the deduplication index once in the application database: `db.notifications.createIndex({ eventKey: 1 }, { unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } })`.

Configure an external scheduler to POST `https://<api-host>/api/v1/jobs/generate-rent-dues` with the `x-job-secret: <JOB_SECRET>` header. Repeated calls are idempotent. Owners and admins can also use **Reconcile dues** on the Rent & payments page to backfill missing periods for existing stays; this preserves existing dues and payments. Generation includes active stays and ended stays up to their leaving date. Rent generation and payment allocation use MongoDB transactions, so Atlas or another replica set is required. The job returns checked stays, created dues, and periods already present.

Payment retries use a partial unique index on `payments.idempotencyKey`; legacy payment records without a key are unaffected. If Mongoose automatic index creation is disabled, create it once with `db.payments.createIndex({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } })`.

## Troubleshooting

- **Invalid environment configuration**: compare variable names and minimum secret lengths with `backend/.env.example`.
- **CORS errors**: `CLIENT_URL` must exactly match the browser origin, including scheme and any port.
- **CSRF validation or session not retained**: confirm the frontend and API are loaded from the same web service, frontend requests use relative `/api/v1`, and the CSRF response sets a Secure cookie. Check the backend `csrf_validation_failed` reason; logs report cookie/header presence without token values. Never log token or cookie values.
- **Database unavailable**: verify Atlas IP/network access, database credentials, and URI encoding for reserved password characters.
