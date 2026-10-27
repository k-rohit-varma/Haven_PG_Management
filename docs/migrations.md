# Database migrations

## Allow pending applications at different hostels

The application uniqueness rule now prevents duplicate pending applications for the same tenant and hostel while allowing applications to different hostels. Existing deployments may have the former unique partial index on `tenantId` alone. Before deploying this version, point `MONGODB_URI` at the intended database and run:

```sh
npm run migrate-application-uniqueness -w backend
```

The migration checks for duplicate pending applications for a tenant/hostel pair and aborts without changing indexes if any exist. If clear, it removes only the old unique `tenantId` index and creates the scoped unique index. The script does not modify application records. Review the configured database URI carefully before running it.

Hostel blocking adds optional `isBlocked`, `blockedAt`, `blockedBy`, and `blockReason` fields. Existing documents behave as unblocked (`isBlocked` is treated as false when absent); no backfill is required.
