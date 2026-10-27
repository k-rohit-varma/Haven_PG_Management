# Database schema and business rules

## Current collections

### User (implemented)

`name`, optional normalized unique `email` (retained for existing accounts and owner onboarding), optional normalized unique Indian `phone`, hidden `passwordHash`, immutable public-registration role (`TENANT`), `gender`, `isActive`, `isDeleted`, timestamps. New tenant accounts use phone; existing email records remain valid. Password hashes are excluded from ordinary queries and JSON serialization.

The bootstrap-created administrator carries an internal `isSystemAdmin` marker, hidden from ordinary queries and API serialization. `Notification` records are recipient-scoped and store a decision type, display copy, an allowlisted destination, related entity ID, and read timestamp; they never store authentication secrets.

`activeStayLockVersion` is an internal atomic lock used when assignments and stay closures race for the same tenant; it is never returned in JSON.

## Collections

Separate collections represent Hostel, Room, TenantApplication, Stay, RentDue, Payment, RentChangeRequest, DepositTransaction, and AuditLog. References preserve historical identity; closing a hostel, leaving a room, or deactivating a user must not erase stays or financial records.

Key indexes include partial unique indexes for email and phone, active room number per hostel, one active stay per tenant, one pending application per tenant, unique `(stayId,billingPeriod)` rent due, and one pending payment per rent due. Existing databases receive the phone index through Mongoose index initialization; ensure legacy phone values, if any, are unique and normalized before enabling automatic index creation. Occupancy is derived from active stays; any cached occupancy must be guarded by atomic updates and reconciliation.

## Rules to preserve

- Rent dues are distinct from payment submissions; only approved payment allocations reduce balances.
- Amounts use integer paise. Allocations cannot exceed outstanding balances.
- A tenant can have one active stay across the system; a returning tenant receives a new stay.
- Move-in date is immutable after confirmation except through an audited admin correction.
- Room defaults affect future assignments only; existing agreed terms change through an approved rent-change workflow.
- A tenant leaving stops future due generation but leaves existing dues and payment history intact.
- Deposit movements are explicit per stay and are not implicitly applied to rent.
- Audit and payment histories are append-only for ordinary operations.

### Hostel (Phase 2)

Public accommodation information, owner reference, accommodation policy, active/deleted state, block metadata, and deletion metadata. Indexes support owner dashboards, active city listings, and search. Public tenant responses use an allowlist and omit owner and soft-deletion metadata.

### Room (Phase 2)

Hostel reference, normalized room identifier, sharing type, maximum capacity, room eligibility, integer-paise default monthly rent, facilities/notes, active/deleted state, and deletion metadata. `(hostelId, identifier)` is unique for non-deleted records. Occupancy is derived from ACTIVE Stay records; it is not accepted from client input or cached on a room.

### RoomConfigurationHistory (Phase 2)

Append-only actor, reason, timestamp, and previous/next configuration snapshots. Room create, update, and soft-delete write history with the room operation in a MongoDB transaction.

### TenantApplication (Phase 3)

Tenant, selected hostel, status, submission/decision metadata, rejection reason, and append-only status events. A partial unique index on `(tenantId,hostelId)` where status is PENDING prevents duplicate applications to one hostel while allowing applications to other hostels. APPROVED may represent eligibility before room assignment.

### Stay (Phase 3–5)

Tenant, hostel, room, source application, immutable local-calendar move-in date, optional leaving date, initial agreed rent/deposit in integer paise, immutable cycle anchor day, status, financial-term lock, stay events, room-transfer history, and effective-dated rent terms. Partial unique index on `tenantId` where status is ACTIVE prevents more than one active stay. `(roomId,status)` supports derived occupancy queries; occupancy is counted from ACTIVE stays, never accepted from the client. New rent terms are appended after approval and do not modify the initial rent or previously generated dues.

### RoomChangeRequest

Tenant, active stay, current and requested room, reason, status, reviewer, rejection reason, and decision events. One pending request per stay is enforced by a partial unique index. Approval updates the Stay's current room and appends a transfer record in the same transaction; rent dues and payment history remain linked to the existing Stay.

### RentDue (Phase 4)

Tenant, stay, hostel, room, `YYYY-MM` billing period, period start, anchored due date, integer-paise amount due and settled, latest approved payment date, and current workflow status. Unique `(stayId,billingPeriod)` prevents duplicate cycles. The first full month's rent is due one month after move-in; later due days follow the original move-in day and clamp to month end. No proration is applied.

### Payment (Phase 4)

Each tenant submission is a separate record with rent due, stay, tenant, hostel, integer-paise amount, declared paid date, method/reference, decision metadata, rejection reason, and append-only status events. A partial unique index on `rentDueId` where status is PENDING prevents parallel pending submissions. Only an APPROVED decision increments `RentDue.amountSettledPaise`; a transaction locks the due and verifies the allocation cannot exceed its balance.

### RentChangeRequest (Phase 5)

Tenant, stay, hostel, current and requested integer-paise rent, reason, server-selected future cycle date, status, reviewer/timestamp, rejection reason, and status events. A partial unique index on `stayId` where status is PENDING permits only one request per stay. Approval requires the anchored effective date to have no generated due and appends a rent term transactionally with the decision.

### DepositTransaction (Phase 5)

Stay, tenant, hostel, transaction type, integer-paise amount, date, optional reference, reason, and actor. Receipts, refunds, deductions, and adjustments remain separate immutable rows. Current balance is derived; refunds and deductions are rejected if they exceed available deposit funds. Stay IDs keep a returning tenant's deposit history separate.

### AuditLog (Phase 6)

Actor, action, entity type/id, reason, before/after snapshots, request ID, and timestamp. Administrative user changes, owner onboarding, corrections, restorations, property soft-deletions, and financial decisions write audit entries in the same transaction as their business record changes.

### Notification

Recipient user, event type, title/message, internal destination, related entity, stable event key, read timestamp, and timestamps. Indexes support recipient-scoped chronological listing, unread counts, and unique event keys for notification deduplication. Notifications are created by successful application, payment, rent-change, and hostel-ownership workflows; reads and updates are restricted to the authenticated recipient. Notifications are operational messages and do not replace audit or financial history.

### Hostel ownership invariant

Every active hostel references one User with role OWNER. Only ADMIN can create a hostel and must assign an active OWNER. Owner reassignment is ADMIN-only, version-checked, audited, and transactional; service queries scope OWNER access through the current `ownerId`, so a former owner loses access after reassignment. No additional ownership field or migration is required for existing documents.
