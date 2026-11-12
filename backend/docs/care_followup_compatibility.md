# Care follow-up compatibility (recommendation only)

**Status:** advisory — do not merge or drop tables automatically.

## What exists today

| Mechanism | Tables | Owner / purpose |
|-----------|--------|-----------------|
| Oncology treatment linkage | `tbl_treatment_linkages` | MO/Specialist/Navigator — surgery/radio/chemo/palliative linkage after referral/pathology; gates `CARE_LINKED` |
| Referral logistics follow-up | `tbl_followup_tasks` (+ contacts, transport, escalations) | **Navigator-owned**, **requires referral_id** — missed appointments, reminders, transport, result collection |
| Community care lifecycle | `tbl_care_plans`, `tbl_care_medicines`, `tbl_care_followup_schedules`, `tbl_care_followup_reports`, `tbl_care_discomfort_reports`, `tbl_care_final_reviews` | MO/Specialist → Navigator → Health Worker field medicine follow-up |

## Overlap / conflict risk

1. **“Follow-up” naming** appears in three places (MO clinical review instructions, Navigator referral tasks, community care HW schedules). They are different clinical objects.
2. **`tbl_followup_tasks` cannot own HW field visits** (role trigger allows NAVIGATOR only; referral FK required). Community care correctly uses separate schedule/report tables.
3. **`tbl_treatment_linkages` is not a prescription**. Using it for village medicine plans would break oncology `CARE_LINKED` semantics.
4. Dual records are possible if staff create both a Navigator logistics task and a care-plan HW schedule for the same patient — confusing but not schema-breaking.

## Recommendation (keep separate)

1. **Keep all three layers.** Do not merge into one table.
2. **Product wording:** label community care as “Treatment follow-up / field visit”; keep MO Follow-up Management as “Navigator referral tasks”; keep treatment linkage as “Hospital treatment linkage”.
3. **UI:** show community care boards under Care lifecycle / Navigator care follow-ups; keep existing MO Follow-ups page for referral logistics.
4. **Future (optional, migration-gated):** add optional `care_plan_id` on `tbl_followup_tasks` for cross-links only — never replace care schedules.
5. **Never auto-delete** historical `tbl_followup_tasks` or `tbl_treatment_linkages` rows when closing a care plan.

## Case closure note

- Closing `tbl_care_plans` does not rewrite referral logistics tasks or treatment linkages.
- Screening `case_state → CLOSED` only when `fn_check_case_transition` allows it; otherwise UI shows `PENDING_SCREENING_CLOSE`.
- `tbl_case_assignments` remain valid historical access rows (do not hard-delete on close).
