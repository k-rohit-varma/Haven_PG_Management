# Testing

## Commands

From the repository root:

```sh
npm run lint
npm test -w backend
npm test -w frontend
npm run build
```

Backend tests use Node's built-in test runner and cover request validators plus Mongo-backed service/authentication workflows. Frontend tests use Node's test runner for property form schema and payload mapping. The production build is Vite.

## Isolated database integration tests

Never point test environment variables to a development or production database. Mongo-backed tests run only when the corresponding variable points to a disposable MongoDB replica set database whose name ends in `_test`:

- `TEST_MONGODB_URI`: hostel/room property workflows.
- `TEST_AUTH_MONGODB_URI`: auth workflow.
- `TEST_ADMIN_MONGODB_URI`: admin workflow.
- `TEST_ADMIN_INIT_MONGODB_URI`: initial admin bootstrap.
- `TEST_NOTIFICATION_MONGODB_URI`: notification recipient scoping.
- `TEST_PAYMENT_MONGODB_URI`: dues and payment workflows.
- `TEST_STAY_MONGODB_URI`: assignment and stay workflows.

Transactions require a replica set. The current repository has no Playwright/browser end-to-end setup. Lint/build and non-database unit tests can run without MongoDB credentials. The test runner reports skipped database suites explicitly.

## Coverage boundaries

Validator tests cover malformed and valid request shapes. Mongo integration suites cover transactional ownership, room inventory, assignment, payment allocation, admin behavior, notifications, and account flows when configured. UI behavior such as theme contrast, mobile layout, and notification outside-click behavior still needs a browser/manual review; a successful build alone does not verify visual behavior.
