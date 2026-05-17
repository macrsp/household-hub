# D1 schema and migrations

household-hub stores its canonical data in **Cloudflare D1** (a SQLite-backed
relational database). Schema changes are checked-in migration files in this
directory, never ad-hoc `wrangler d1 execute` against the remote database.

## Migration policy

- Each migration is a numbered `.sql` file (`0001_initial.sql`, `0002_*.sql`, …).
- Apply migrations to the local database first, then remote:
  - `npm run db:migrate:local`
  - `npm run db:migrate:remote`
- `wrangler` records applied migrations in a `d1_migrations` table, so
  re-running an apply is a safe no-op.
- `seed.sql` (repo root) is separate from migrations. Every statement is
  `INSERT OR IGNORE`, so `npm run db:seed:local` / `:remote` are re-runnable.

## Canonical user-asset manifest

Per `.agent/PLANS.md` (`## User-Asset Durability`), these are household-hub's
**user-asset record classes** — records whose loss would feel to a household
member like the platform broke a promise. ExecPlans that touch their write
paths must follow the User-Asset Durability invariants.

| Table           | What it holds                              | v1 write path        |
| --------------- | ------------------------------------------ | -------------------- |
| `people`        | Household members                          | `seed.sql` only      |
| `endpoints`     | A person's address on a transport          | `seed.sql` only      |
| `conversations` | Conversation threads                       | `seed.sql` only      |
| `participants`  | Person ↔ conversation membership           | `seed.sql` only      |
| `messages`      | Canonical messages (the conversation)      | runtime (all routes) |
| `deliveries`    | One row per fanout attempt to one endpoint | runtime (fanout)     |

## Transport string sets — single source of truth

The accepted transport strings are declared once, in
[`src/lib/server/db.ts`](../src/lib/server/db.ts), as the exported `const`
arrays `ENDPOINT_TYPES`, `SOURCE_TRANSPORTS`, and `DELIVERY_TRANSPORTS`. Route
validators and the fanout helper import those constants rather than re-spelling
the strings.

The `CHECK` constraints in `0001_initial.sql` duplicate those sets at the
database layer. **If you change a transport set, update both** the `db.ts`
constant and the matching `CHECK` clause (a new migration for the `CHECK`).
`src/lib/server/fanout.test.ts` enumerates each declared array and asserts a
fixture is accepted for every entry, so a drift fails the test run.

## Post-deploy invariant probes (TODO — not yet wired)

`.agent/PLANS.md` requires a post-deploy data probe per user-asset record
class. v1 has no CI pipeline yet; when one exists, the post-deploy lane must
run at least one "this should always be zero" query per class:

- `people` — zero rows with a NULL or empty `display_name`.
- `endpoints` — zero rows whose `person_id` is absent from `people`.
- `conversations` — zero rows with a NULL or empty `slug`.
- `participants` — zero rows whose `conversation_id` is absent from
  `conversations`, or whose `person_id` is absent from `people`.
- `messages` — zero rows whose `author_person_id` is absent from `people`, or
  whose `conversation_id` is absent from `conversations`; zero rows whose
  `deleted_at` is earlier than `created_at` (a message cannot be retracted
  before it was sent — M22 soft-deletion); and zero rows whose `edited_at` is
  earlier than `created_at` (a message cannot be edited before it was sent —
  M24 editing).
- `deliveries` — zero rows whose `message_id` is absent from `messages`, or
  whose `endpoint_id` is absent from `endpoints`.
