# Migration 015 readiness notes

This document is a proposal and deployment checklist. No database was queried,
and no SQL in the migration proposal was executed.

## Database access boundary

The checked-in code reads the runtime pool credentials from `DB_USER` and
`DB_PASSWORD` in `backend/db.js`. `backend/scripts/migrate.js` constructs its
connection from the same `config.database.user` and `config.database.password`.
The repository contains no deployment manifest that proves private network
access, secret scope, or production grants. Therefore database access security
is **not verified**.

Before approving production use:

- Keep PostgreSQL on a private network and permit connections only from approved
  backend and operator/migration networks. Do not expose its port publicly.
- Give the backend a dedicated runtime role with only the table/sequence/function
  privileges required by application requests. It must not own schema objects,
  create roles/databases, or execute DDL.
- Give migrations a separate, short-lived migration role with only the DDL and
  data privileges required for the reviewed migration. Store its credential in
  an operator-controlled secret manager, not in frontend configuration.
- Configure runtime and migration credentials independently, rotate them, and
  verify the effective grants and network policy in the deployment environment.
- Do not describe the PostgreSQL `app.actor_id` custom setting as authentication.
  It is caller-settable by a database session with sufficient privileges; it is
  defense in depth after HTTP authentication and is not an independent identity
  proof.

The repository currently uses the same configured database username/password
for application and migrator connections. Until deployment and grants prove
otherwise, treat the app role as potentially DDL-capable and the access boundary
as **NEEDS ATTENTION**.

The revised Migration 015 proposal still requires these deployment controls
before manual approval for any environment:

- PostgreSQL must have no public listener or unrestricted ingress. Permit
  connections only from explicitly approved backend and operator/migration
  networks, with TLS and network policy enforced at the deployment boundary.
- Use a dedicated runtime database role for the backend and a distinct,
  short-lived migration role for schema changes. The runtime role must not own
  schema objects or have DDL, role-management, or database-creation privileges.
- Supply the two roles through separate operator-managed secrets and connection
  configurations; do not reuse `DB_USER` / `DB_PASSWORD` for both processes.
  Verify effective grants, network rules, and secret scopes in deployment
  configuration without exposing credentials.
- `app.actor_id` is set by the application inside a transaction but remains a
  caller-settable PostgreSQL custom setting. It only compares a database value
  with the authenticated HTTP actor; a client with runtime DB credentials and
  write access can set it too. It is not independent authentication and must
  not be represented as such.

These are required controls, not evidence that any deployment currently meets
them. No target database or deployment configuration was verified for this
source-level proposal review.

## Legacy applicant impact

The source-only impact categories and unavailable per-category counts are
documented in
[`MIGRATION_015_LEGACY_APPLICANT_IMPACT.md`](./MIGRATION_015_LEGACY_APPLICANT_IMPACT.md).
Those counts require a separately approved read-only check on a confirmed
non-production or production target; they were not collected for this report.

## Existing applicant status recovery design

The current request table does not record independently verified applicant
contact channels, and the existing email/SMS adapters only send messages. They
do not establish that a recipient controls a contact address. The proposed
workflow migration therefore does not generate tokens for legacy applicants.

A safe future recovery operation must:

1. Require an authenticated staff actor with a dedicated recovery permission.
   Recheck role and scope on the backend: Medical Officers only for assigned
   Mandals, District Admins only for their district, and system-level roles only
   according to existing administrative permissions.
2. Locate a request by an opaque request identifier supplied to the authenticated
   staff operation, never by applicant-submitted username, phone, or email.
3. Require the staff actor to record how applicant identity was independently
   verified (for example, in-person verification against approved documentation).
   The record must bind the verifier and timestamp to the request.
4. Send a random, short-lived channel-verification challenge to the contact
   selected during that verification. Do not disclose request status or applicant
   details in the initiation response. Successful challenge redemption proves
   current control of that channel; it does not replace the staff identity check.
5. Generate a separate high-entropy recovery token only after both checks pass.
   Store only its cryptographic hash and expiry. Make redemption single-use with
   an atomic conditional consume; invalidate prior recovery challenges. Never
   log or audit plaintext tokens.
6. Deliver the recovery token only to the channel just verified. A failed
   delivery must not return the token in an API response or logs; allow a
   controlled retry by reissuing a new token and invalidating the prior one.
7. Require the applicant to redeem that token to establish a status-tracking
   credential. Return application status only after verification, and audit
   initiation, verification, issuance, redemption, and delivery outcome. Required
   audit writes must be transactionally coupled to persisted decisions.

This recovery flow is a **design only**, not a working endpoint. It must not be
enabled until verified-channel handling, one-time token storage/consumption,
delivery behavior, and scoped staff authorization are implemented and tested.

## Migration filename mapping

Applied migration filenames are immutable. The checked-in active directory
currently ends at `013_explicit_mandal_medical_officer_workflow.sql`; no
`014` or `015` migration is present there.

| Existing file | Proposed mapping | Disposition |
|---|---|---|
| `migrations/001_schema_fixes.sql` through `migrations/013_explicit_mandal_medical_officer_workflow.sql` | Same names | Active migration source; do not rename or edit. Confirm applied state separately |
| `migrations-proposed/013_district_admin_staff_permission.sql` | `migrations-proposed/014_district_admin_staff_permission.sql` | Renumbered proposal after active 013 |
| `migrations-proposed/014_two_stage_registration.sql` | `migrations-proposed/superseded_two_stage_registration_v1.sql` | Retained for history, explicitly not a numbered migration |
| `migrations-proposed/015_two_stage_registration.sql` | Same name | Current two-stage workflow proposal; candidate 015 |
| `migrations-proposed/015_user_specialties.sql` | `migrations-proposed/016_user_specialties.sql` | Renumbered independent proposal |

This mapping only resolves repository filename collisions. It does not prove
which migrations have been applied in a database. Confirm migration history
using an approved read-only process before scheduling any proposal. The
migrator scans only `backend/migrations/`; none of these proposal files should
be copied there without explicit approval.
