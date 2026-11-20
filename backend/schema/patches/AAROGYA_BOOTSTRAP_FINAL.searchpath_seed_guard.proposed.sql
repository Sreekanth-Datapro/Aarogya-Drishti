-- =============================================================================
-- PROPOSAL ONLY — do not run blindly against production without review.
-- Does NOT replace AAROGYA_BOOTSTRAP_FINAL.sql.
--
-- Purpose: document the minimum SQL fragments to inject into a *copy* of
-- AAROGYA_BOOTSTRAP_FINAL.sql (or to apply around a split load) so that
-- mst_* seed INSERTs succeed under PostgreSQL when pg_dump left
-- search_path empty and trigger bodies use unqualified table names.
--
-- Root cause reminder:
--   set_config('search_path','',false) + fn_village_mandal_from_gp()
--   referencing mst_gram_panchayats without public. prefix
--   while trg_village_mandal fires on INSERT INTO public.mst_villages.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FRAGMENT 1 — Data-section preamble (replace empty search_path ~line 10067)
-- ---------------------------------------------------------------------------
SELECT pg_catalog.set_config('search_path', 'public', false);

-- ---------------------------------------------------------------------------
-- FRAGMENT 2 — Immediately BEFORE first INSERT INTO public.mst_villages
-- ---------------------------------------------------------------------------
ALTER TABLE public.mst_villages DISABLE TRIGGER trg_village_mandal;

-- ... existing mst_villages INSERT blocks unchanged ...

-- ---------------------------------------------------------------------------
-- FRAGMENT 3 — AFTER all mst_villages INSERT blocks
-- ---------------------------------------------------------------------------
ALTER TABLE public.mst_villages ENABLE TRIGGER trg_village_mandal;

-- ---------------------------------------------------------------------------
-- FRAGMENT 4 — Immediately BEFORE INSERT INTO public.mst_facilities
-- (same search_path class of bug via fn_facility_location_check)
-- ---------------------------------------------------------------------------
ALTER TABLE public.mst_facilities DISABLE TRIGGER trg_facility_location;

-- ... existing mst_facilities INSERT unchanged ...

-- ---------------------------------------------------------------------------
-- FRAGMENT 5 — AFTER mst_facilities INSERT
-- ---------------------------------------------------------------------------
ALTER TABLE public.mst_facilities ENABLE TRIGGER trg_facility_location;

-- ---------------------------------------------------------------------------
-- OPTIONAL FRAGMENT 6 — After all CREATE FUNCTION statements (schema section)
-- Permanent hardening so app runtime also works if search_path is empty.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.fn_village_mandal_from_gp() SET search_path = public;
ALTER FUNCTION public.fn_facility_location_check() SET search_path = public;
ALTER FUNCTION public.fn_ai_guard() SET search_path = public;
ALTER FUNCTION public.fn_care_final_review_clinician_guard() SET search_path = public;
ALTER FUNCTION public.fn_check_case_transition() SET search_path = public;
ALTER FUNCTION public.fn_classification_guard() SET search_path = public;
ALTER FUNCTION public.fn_pathology_review_guard() SET search_path = public;
ALTER FUNCTION public.fn_patient_set_mandal_and_validate_hw_assignment() SET search_path = public;
ALTER FUNCTION public.fn_protect_signed_specialist_decision() SET search_path = public;
ALTER FUNCTION public.fn_referral_guard() SET search_path = public;
ALTER FUNCTION public.fn_require_consent() SET search_path = public;
ALTER FUNCTION public.fn_require_role() SET search_path = public;
ALTER FUNCTION public.fn_review_guard() SET search_path = public;
ALTER FUNCTION public.fn_review_snapshot() SET search_path = public;
ALTER FUNCTION public.fn_screening_consent_check() SET search_path = public;
ALTER FUNCTION public.fn_set_updated_at() SET search_path = public;
ALTER FUNCTION public.fn_user_has_patient_access(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.fn_validate_health_worker_location_assignment() SET search_path = public;
ALTER FUNCTION public.fn_validate_medical_officer_case_claim() SET search_path = public;
ALTER FUNCTION public.fn_validate_medical_officer_mandal_assignment() SET search_path = public;
ALTER FUNCTION public.fn_validate_registration_reviewer() SET search_path = public;
ALTER FUNCTION public.fn_video_slot_booked() SET search_path = public;
ALTER FUNCTION public.fn_video_slot_guard() SET search_path = public;
ALTER FUNCTION public.fn_block_mutation() SET search_path = public;
ALTER FUNCTION public.fn_case_transition_allowed(text, text) SET search_path = public;

-- End of proposal fragments.
