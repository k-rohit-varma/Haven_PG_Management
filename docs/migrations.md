# Database migrations

## Allow pending applications at different hostels

The application uniqueness rule now prevents duplicate pending applications for the same tenant and hostel while allowing applications to different hostels. Existing deployments may have the former unique partial index on `tenantId` alone. Before deploying this version, point `MONGODB_URI` at the intended database and run:

```sh
npm run migrate-application-uniqueness -w backend
```

The migration checks for duplicate pending applications for a tenant/hostel pair and aborts without changing indexes if any exist. If clear, it removes only the old unique `tenantId` index and creates the scoped unique index. The script does not modify application records. Review the configured database URI carefully before running it.

Hostel blocking adds optional `isBlocked`, `blockedAt`, `blockedBy`, and `blockReason` fields. Existing documents behave as unblocked (`isBlocked` is treated as false when absent); no backfill is required.

## Direct tenant assignment

Tenant accounts are now operational tenant profiles only; tenant login and signup are disabled. Existing `User` documents with role `TENANT`, applications, stays, rent changes, room changes, payments, deposits, and audit logs are retained. New direct tenant assignments leave `Stay.applicationId` empty, so the unique application link index must allow multiple missing values. Before deploying, point `MONGODB_URI` at the intended database and run:

```sh
npm run migrate-stay-application-link -w backend
```

The migration removes only the legacy non-partial unique `applicationId` index (which permits only one missing/null application link) and ensures a unique partial index for actual ObjectId links. It does not modify or delete stay records and refuses ambiguous or conflicting index definitions. A leftover `applicationId_1` index causes new direct tenant assignments to fail with MongoDB `E11000` during `Stay.create()` even when the room has capacity. Confirm the target database URI before running it. MongoDB transactions are required for the create-and-assign and financial write workflows; use a replica set deployment.
