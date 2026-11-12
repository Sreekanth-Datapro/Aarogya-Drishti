# Migration 015 legacy applicant impact

## Scope and evidence

This is a source-level impact classification only. No database was queried,
and no applicant records or personal information were accessed. Therefore
record counts for every category below are **unknown**; they must not be
estimated from source code.

The source migration adds status-token hash/expiry and MO recommendation
columns, then sets `workflow_version = 1` for every pending request whose
workflow version is null. It deliberately does not create tokens for existing
requests. The applicant status endpoint returns status only when it finds a
matching hash with an expiry later than the current time.

Seven record categories are identified below. Their individual record counts
and total affected applicants are **unknown** from source alone.

## Impact categories

| Existing record category | Migration behavior | Applicant status impact | Source-only count |
|---|---|---|---|
| Pending request with `workflow_version IS NULL` and no token | Promoted to workflow version 1; no token is created | Applicant cannot use token status lookup; authorized staff can process it in the new workflow | Unknown |
| Pending request with null workflow version but an existing valid, unexpired token | Promoted to workflow version 1; existing token is retained | Token status lookup can continue if its stored hash matches | Unknown |
| Pending workflow-v1 request with null token | Workflow version remains 1; token remains absent | Applicant cannot use token status lookup; authorized staff can process it | Unknown |
| Pending request with expired token | Token is not renewed | Applicant status endpoint rejects it as unavailable | Unknown |
| Pending request with malformed token hash or mismatched token/expiry fields | Migration does not repair it; new constraint is `NOT VALID` for pre-existing rows | Status lookup may fail; migration proposal must be reviewed against actual data before approval | Unknown |
| Finalized legacy request | Not backfilled by the pending-only update; retained as finalized | No applicant status access without a valid token; the new trigger treats finalized rows as immutable | Unknown |
| New registration after migration | Must be inserted as workflow version 1 with a valid token hash and future expiry | Applicant receives the token in the submission response; it remains reusable for status checks until expiry | Not applicable |

`NOT VALID` means the new recommendation and token-pair constraints are enforced
for rows inserted or updated after installation, but old rows are not fully
validated by adding those constraints. Existing malformed legacy token data
must not be treated as repaired merely because the migration commits.

## Safe handling

- Do not derive tokens from username, phone, email, request IDs, or other
  applicant data.
- Do not expose registration status or applicant details by personal-data
  lookup when a token is absent or invalid.
- Before approval, the authorized operator must choose whether to pause the
  workflow promotion when tokenless pending records exist or accept that those
  applicants temporarily have staff-only status access.
- A future recovery flow must use independent staff identity verification,
  verified-channel challenge delivery, a random expiring single-use token,
  hash-only storage, atomic redemption, and required audit logging.
- Counts may be obtained only through a separately approved read-only query on
  the confirmed intended environment. This report does not include or imply
  such counts.
