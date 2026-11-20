-- =============================================================================
-- Aarogya Drishti — FINAL BOOTSTRAP SCHEMA
-- Generated: 2026-11-13T17:06:52.007Z
-- Source: local database dump (schema + mst_* seed) after migrations 001–043.
--
-- Purpose: create a fresh database that already includes every migration effect,
-- so the app can start WITHOUT running `npm run migrate` / `migrate:apply`.
--
-- How to use (fresh / greenfield database):
--   1. CREATE DATABASE your_db;   -- or reuse a DB you are willing to wipe
--   2. psql -d your_db -f backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql
--   3. Point DB_* env at that database
--   4. npm start  (bootstrap.js may create the first admin if none exists)
--   5. Optional check: npm run migrate   (should say: Database is up to date)
--
-- Notes:
--   - This script DROPS AND RECREATES schema public (wipes existing objects).
--   - Does NOT include clinical tbl_* row data or user passwords from local.
--   - Includes master seed rows (mst_*) from the dump source.
--   - Records schema_migrations for all migrator-tracked files.
--   - Not a substitute for production migrate --apply on an existing Render DB.
-- =============================================================================

BEGIN;

-- Reset public so a partial prior load cannot cause 'already exists' errors.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO pg_database_owner;
GRANT ALL ON SCHEMA public TO public;
COMMENT ON SCHEMA public IS 'standard public schema';

--
-- PostgreSQL database dump
--






SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: ai_agreement; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_agreement AS ENUM (
    'NOT_AVAILABLE',
    'AGREE',
    'DISAGREE',
    'DEFER'
);


--
-- Name: ai_result_label; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_result_label AS ENUM (
    'IMAGE_INSUFFICIENT',
    'SUSPICIOUS_FOR_CLINICAL_REVIEW',
    'NO_SUSPICIOUS_FINDING_DEMO'
);


--
-- Name: ai_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_status AS ENUM (
    'QUEUED',
    'COMPLETED',
    'FAILED',
    'UNAVAILABLE'
);


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendance_status AS ENUM (
    'PENDING',
    'ATTENDED',
    'NO_SHOW'
);


--
-- Name: care_discomfort_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.care_discomfort_status AS ENUM (
    'OPEN',
    'ESCALATED',
    'RESOLVED'
);


--
-- Name: care_final_decision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.care_final_decision AS ENUM (
    'CLOSE_RECOVERED',
    'CONTINUE_TREATMENT',
    'REFER_SPECIALIST',
    'URGENT_ESCALATION'
);


--
-- Name: care_followup_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.care_followup_status AS ENUM (
    'SCHEDULED',
    'COMPLETED',
    'MISSED',
    'CANCELLED'
);


--
-- Name: care_plan_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.care_plan_source AS ENUM (
    'MO',
    'SPECIALIST'
);


--
-- Name: care_plan_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.care_plan_status AS ENUM (
    'AWAITING_NAVIGATOR',
    'FOLLOWUP_ACTIVE',
    'PATIENT_UNCOMFORTABLE',
    'MO_REASSESSMENT',
    'TREATMENT_COMPLETED',
    'FINAL_CHECKUP_PENDING',
    'RECOVERY_CONFIRMED',
    'CLOSED',
    'SUPERSEDED'
);


--
-- Name: case_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.case_state AS ENUM (
    'DRAFT',
    'CONSENTED',
    'SCREENED',
    'AWAITING_CLINICIAN',
    'REVIEWED',
    'REFERRAL_PLANNED',
    'APPOINTED',
    'ASSESSED',
    'DIAGNOSTICS_PENDING',
    'RESULT_REVIEWED',
    'CARE_LINKED',
    'CLOSED',
    'RESCHEDULED',
    'MISSED',
    'DECLINED',
    'LOST_CONTACT'
);


--
-- Name: classification_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.classification_level AS ENUM (
    'SCREEN_POSITIVE',
    'CLINICAL_SUSPICION',
    'PRECANCER_CLINICIAN_CONFIRMED',
    'MALIGNANCY_PATHOLOGY_CONFIRMED',
    'BENIGN_OR_NO_CONCERN',
    'INCONCLUSIVE'
);


--
-- Name: conflict_resolution; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conflict_resolution AS ENUM (
    'OPEN',
    'KEPT_LOCAL',
    'KEPT_SERVER',
    'MERGED'
);


--
-- Name: consent_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.consent_method AS ENUM (
    'CHECKBOX',
    'VERBAL_WITNESSED',
    'SIGNATURE',
    'THUMBPRINT'
);


--
-- Name: consult_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.consult_mode AS ENUM (
    'VIDEO',
    'IN_PERSON'
);


--
-- Name: contact_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contact_channel AS ENUM (
    'PHONE',
    'HOME_VISIT',
    'SMS',
    'IN_PERSON',
    'OTHER'
);


--
-- Name: contact_outcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contact_outcome AS ENUM (
    'REACHED',
    'NOT_REACHED',
    'WRONG_NUMBER',
    'REFUSED',
    'RESCHEDULED'
);


--
-- Name: diagnosis_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.diagnosis_category AS ENUM (
    'BENIGN',
    'PRE_MALIGNANT',
    'MALIGNANT',
    'INCONCLUSIVE'
);


--
-- Name: duplicate_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.duplicate_status AS ENUM (
    'OPEN',
    'CONFIRMED_DUPLICATE',
    'NOT_DUPLICATE'
);


--
-- Name: error_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.error_severity AS ENUM (
    'DEBUG',
    'INFO',
    'WARNING',
    'ERROR',
    'CRITICAL'
);


--
-- Name: escalation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.escalation_status AS ENUM (
    'OPEN',
    'ACKNOWLEDGED',
    'RESOLVED'
);


--
-- Name: facility_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.facility_type AS ENUM (
    'PHC',
    'HOSPITAL',
    'SCREENING_SITE',
    'DISTRICT_OFFICE',
    'SUB_CENTRE',
    'OTHER'
);


--
-- Name: finding_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.finding_type AS ENUM (
    'SYMPTOM',
    'EXAM'
);


--
-- Name: followup_task_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.followup_task_type AS ENUM (
    'MISSED_APPOINTMENT',
    'REMINDER',
    'TRANSPORT',
    'RESULT_COLLECTION',
    'LOST_CONTACT',
    'TREATMENT_LINKAGE',
    'OTHER'
);


--
-- Name: history_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.history_type AS ENUM (
    'EXPOSURE',
    'CONDITION',
    'PRIOR_SCREENING',
    'PRIOR_REFERRAL'
);


--
-- Name: linkage_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.linkage_status AS ENUM (
    'PLANNED',
    'CONFIRMED',
    'STARTED',
    'COMPLETED',
    'DECLINED',
    'LOST'
);


--
-- Name: notification_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_channel AS ENUM (
    'IN_APP',
    'SMS',
    'PUSH'
);


--
-- Name: notification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_status AS ENUM (
    'PENDING',
    'SENT',
    'FAILED',
    'CANCELLED'
);


--
-- Name: oral_view; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.oral_view AS ENUM (
    'CHEEK_LINING',
    'TONGUE',
    'PALATE',
    'GUMS',
    'FLOOR_OF_MOUTH',
    'OTHER'
);


--
-- Name: photo_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.photo_status AS ENUM (
    'UPLOADED',
    'QUALITY_FAILED',
    'ACCEPTED',
    'SUPERSEDED'
);


--
-- Name: quality_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quality_status AS ENUM (
    'ACCEPTABLE',
    'RECAPTURE'
);


--
-- Name: referral_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.referral_mode AS ENUM (
    'VIDEO_CONSULT',
    'HOSPITAL_VISIT',
    'BOTH'
);


--
-- Name: referral_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.referral_status AS ENUM (
    'PLANNED',
    'SENT',
    'ACCEPTED',
    'COMPLETED',
    'DECLINED',
    'CANCELLED'
);


--
-- Name: registration_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.registration_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: review_decision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.review_decision AS ENUM (
    'NO_ACTION',
    'ROUTINE_FOLLOW_UP',
    'RESCREEN',
    'REQUEST_RECAPTURE',
    'REQUEST_MORE_INFO',
    'SPECIALIST_REVIEW',
    'URGENT_REFERRAL'
);


--
-- Name: sex_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sex_type AS ENUM (
    'FEMALE',
    'MALE',
    'OTHER',
    'UNDISCLOSED'
);


--
-- Name: sync_operation; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sync_operation AS ENUM (
    'CREATE',
    'UPDATE'
);


--
-- Name: sync_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sync_status AS ENUM (
    'PENDING',
    'UPLOADING',
    'CONFIRMED',
    'FAILED'
);


--
-- Name: transport_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transport_status AS ENUM (
    'REQUESTED',
    'ARRANGED',
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'DISABLED',
    'PENDING_SETUP'
);


--
-- Name: fn_ai_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_ai_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE prov TEXT; ver TEXT; sl BOOLEAN;
BEGIN
  SELECT m.provider, m.model_version, m.supports_localization INTO prov, ver, sl
    FROM mst_ai_models m WHERE m.id = NEW.ai_model_id;
  IF TG_OP = 'INSERT' THEN
    NEW.model_provider := prov;
    NEW.model_version  := ver;
  ELSE
    IF OLD.status IN ('COMPLETED','FAILED','UNAVAILABLE') THEN
      RAISE EXCEPTION 'finished AI output is immutable; create a new assessment (retry)'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.ai_model_id <> OLD.ai_model_id THEN
      RAISE EXCEPTION 'model cannot change on an existing assessment' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.localization IS NOT NULL AND NOT COALESCE(sl, FALSE) THEN
    RAISE EXCEPTION 'model % does not support localisation; overlays/heatmaps must not be stored', ver
          USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fn_block_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_block_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % not allowed', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'integrity_constraint_violation';
END $$;


--
-- Name: fn_care_final_review_clinician_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_care_final_review_clinician_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE rcode TEXT;
BEGIN
  SELECT r.code INTO rcode
    FROM tbl_users u
    JOIN mst_roles r ON r.id = u.role_id
   WHERE u.id = NEW.medical_officer_id
     AND u.deleted_at IS NULL;
  IF rcode IS NULL OR rcode NOT IN ('MEDICAL_OFFICER', 'SPECIALIST') THEN
    RAISE EXCEPTION 'tbl_care_final_reviews.medical_officer_id must be MEDICAL_OFFICER or SPECIALIST, got %',
      COALESCE(rcode, 'unknown')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_case_transition_allowed(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_case_transition_allowed(from_state text, to_state text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF from_state IS NULL OR to_state IS NULL THEN
    RETURN FALSE;
  END IF;
  IF from_state IS NOT DISTINCT FROM to_state THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
      SELECT 1 FROM (VALUES
        ('DRAFT','CONSENTED'),('DRAFT','CLOSED'),('CONSENTED','SCREENED'),
        ('SCREENED','AWAITING_CLINICIAN'),('SCREENED','CLOSED'),
        ('AWAITING_CLINICIAN','REVIEWED'),('AWAITING_CLINICIAN','SCREENED'),
        ('REVIEWED','REFERRAL_PLANNED'),('REVIEWED','CLOSED'),
        ('REFERRAL_PLANNED','APPOINTED'),('APPOINTED','ASSESSED'),
        ('ASSESSED','DIAGNOSTICS_PENDING'),('ASSESSED','CLOSED'),
        ('DIAGNOSTICS_PENDING','RESULT_REVIEWED'),
        ('RESULT_REVIEWED','CARE_LINKED'),('RESULT_REVIEWED','DIAGNOSTICS_PENDING'),('RESULT_REVIEWED','CLOSED'),
        ('CARE_LINKED','CLOSED')
      ) AS t(a, b)
      WHERE a = from_state AND b = to_state)
    OR (to_state IN ('RESCHEDULED','MISSED','DECLINED','LOST_CONTACT')
        AND from_state NOT IN ('DRAFT','CLOSED'))
    OR (from_state IN ('RESCHEDULED','MISSED','DECLINED','LOST_CONTACT')
        AND to_state IN ('REFERRAL_PLANNED','APPOINTED','ASSESSED','DIAGNOSTICS_PENDING',
                         'RESULT_REVIEWED','CARE_LINKED','CLOSED','LOST_CONTACT'));
END;
$$;


--
-- Name: fn_check_case_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_case_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE ok BOOLEAN;
BEGIN
  IF NEW.case_state IS NOT DISTINCT FROM OLD.case_state THEN RETURN NEW; END IF;

  ok := fn_case_transition_allowed(OLD.case_state::text, NEW.case_state::text);

  IF NOT ok THEN
    RAISE EXCEPTION 'invalid case transition % -> %', OLD.case_state, NEW.case_state
          USING ERRCODE = 'check_violation';
  END IF;

  -- AI can never bypass the clinician
  IF NEW.case_state = 'REVIEWED' AND NOT EXISTS (
        SELECT 1 FROM tbl_clinical_reviews cr WHERE cr.screening_id = NEW.id AND cr.signed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'case cannot be REVIEWED without a signed clinician review' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_state = 'REFERRAL_PLANNED' AND NOT EXISTS (
        SELECT 1 FROM tbl_referrals r JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id AND r.status <> 'CANCELLED') THEN
    RAISE EXCEPTION 'REFERRAL_PLANNED needs a referral record' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_state = 'APPOINTED' AND NOT EXISTS (
        SELECT 1 FROM tbl_referrals r JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id AND r.status <> 'CANCELLED'
           AND (EXISTS (SELECT 1 FROM tbl_hospital_appointments a WHERE a.referral_id = r.id)
             OR EXISTS (SELECT 1 FROM tbl_video_consultations v WHERE v.referral_id = r.id AND v.is_active))) THEN
    RAISE EXCEPTION 'APPOINTED needs a booked appointment or video consultation' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_state = 'DIAGNOSTICS_PENDING' AND NOT EXISTS (
        SELECT 1 FROM tbl_investigation_orders o
          JOIN tbl_referrals r ON r.id = o.referral_id
          JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id) THEN
    RAISE EXCEPTION 'DIAGNOSTICS_PENDING needs an investigation order' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_state = 'ASSESSED' AND NOT EXISTS (
        SELECT 1 FROM tbl_referrals r JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id AND r.assessment_completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'ASSESSED needs a completed specialist assessment on the referral' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_state = 'RESULT_REVIEWED' AND NOT EXISTS (
        SELECT 1 FROM tbl_pathology_reviews pr
          JOIN tbl_pathology_reports rep ON rep.id = pr.report_id
          JOIN tbl_investigation_orders o ON o.id = rep.order_id
          JOIN tbl_referrals r ON r.id = o.referral_id
          JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id AND pr.signed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'RESULT_REVIEWED needs a signed clinician review of the report' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_state = 'CARE_LINKED' AND NOT EXISTS (
        SELECT 1 FROM tbl_treatment_linkages tl
          JOIN tbl_referrals r ON r.id = tl.referral_id
          JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
         WHERE cr.screening_id = NEW.id AND tl.status IN ('CONFIRMED','STARTED','COMPLETED')) THEN
    RAISE EXCEPTION 'CARE_LINKED needs a confirmed treatment linkage' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fn_classification_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classification_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE rc TEXT; dcat diagnosis_category; psigned TIMESTAMPTZ; rsigned TIMESTAMPTZ;
BEGIN
  SELECT r.code INTO rc FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id WHERE u.id = NEW.set_by;
  IF NEW.level <> 'SCREEN_POSITIVE' AND rc NOT IN ('MEDICAL_OFFICER','SPECIALIST') THEN
    RAISE EXCEPTION 'only a clinician may set classification %', NEW.level USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.level = 'MALIGNANCY_PATHOLOGY_CONFIRMED' THEN
    SELECT pr.diagnosis_category, pr.signed_at INTO dcat, psigned
      FROM tbl_pathology_reviews pr WHERE pr.id = NEW.pathology_review_id;
    IF dcat IS DISTINCT FROM 'MALIGNANT' OR psigned IS NULL THEN
      RAISE EXCEPTION 'MALIGNANCY_PATHOLOGY_CONFIRMED needs a signed pathology review with category MALIGNANT'
            USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.level = 'PRECANCER_CLINICIAN_CONFIRMED' THEN
    SELECT pr.signed_at INTO psigned FROM tbl_pathology_reviews pr
     WHERE pr.id = NEW.pathology_review_id AND pr.diagnosis_category = 'PRE_MALIGNANT';
    SELECT cr.signed_at INTO rsigned FROM tbl_clinical_reviews cr WHERE cr.id = NEW.clinical_review_id;
    IF psigned IS NULL AND rsigned IS NULL THEN
      RAISE EXCEPTION 'PRECANCER_CLINICIAN_CONFIRMED needs a signed PRE_MALIGNANT pathology review or a signed clinical review'
            USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fn_facility_location_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_facility_location_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    mandal_district BIGINT;
    village_mandal  BIGINT;
BEGIN
    IF NEW.category IS NULL THEN
        NEW.category := CASE NEW.facility_type::text
                            WHEN 'HOSPITAL' THEN 'AREA_HOSPITAL'
                            ELSE NEW.facility_type::text
                        END;
    END IF;

    IF NEW.mandal_id IS NOT NULL THEN
        SELECT district_id INTO mandal_district FROM public.mst_mandals WHERE id = NEW.mandal_id;
        IF mandal_district IS DISTINCT FROM NEW.district_id THEN
            RAISE EXCEPTION 'Facility mandal % does not belong to district %', NEW.mandal_id, NEW.district_id;
        END IF;
    END IF;

    IF NEW.village_id IS NOT NULL THEN
        IF NEW.mandal_id IS NULL THEN
            RAISE EXCEPTION 'A facility with a village must also have a mandal';
        END IF;
        SELECT mandal_id INTO village_mandal FROM public.mst_villages WHERE id = NEW.village_id;
        IF village_mandal IS DISTINCT FROM NEW.mandal_id THEN
            RAISE EXCEPTION 'Facility village % does not belong to mandal %', NEW.village_id, NEW.mandal_id;
        END IF;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END $$;


--
-- Name: fn_pathology_review_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_pathology_review_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'a signed pathology review is immutable; add a superseding review'
          USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fn_patient_set_mandal_and_validate_hw_assignment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_patient_set_mandal_and_validate_hw_assignment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_role_code TEXT;
    v_patient_mandal BIGINT;
BEGIN
    SELECT r.code INTO v_role_code
    FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
    WHERE u.id = NEW.registered_by;

    IF NEW.village_id IS NULL THEN
        NEW.mandal_id := NULL;
        IF v_role_code = 'HEALTH_WORKER' THEN
            RAISE EXCEPTION 'Health Worker patient registration requires a village';
        END IF;
        RETURN NEW;
    END IF;

    SELECT v.mandal_id INTO v_patient_mandal
    FROM mst_villages v WHERE v.id = NEW.village_id;
    IF v_patient_mandal IS NULL THEN
        RAISE EXCEPTION 'Patient village must belong to a Mandal';
    END IF;
    NEW.mandal_id := v_patient_mandal;

    -- Health Worker: currently assigned to this Mandal, village and facility active in it
    IF v_role_code = 'HEALTH_WORKER' AND NOT (
        EXISTS (
            SELECT 1 FROM tbl_health_worker_location_assignments a
            WHERE a.user_id = NEW.registered_by
              AND a.mandal_id = v_patient_mandal
              AND a.valid_from <= CURRENT_DATE
              AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
        )
        AND EXISTS (
            SELECT 1 FROM mst_villages v
            WHERE v.id = NEW.village_id AND v.mandal_id = v_patient_mandal AND v.is_active IS TRUE
        )
        AND EXISTS (
            SELECT 1 FROM mst_facilities f
            WHERE f.id = NEW.registered_facility_id
              AND f.mandal_id = v_patient_mandal
              AND f.is_active IS TRUE
        )
    ) THEN
        RAISE EXCEPTION 'Health Worker is not assigned to this Mandal, or the village or facility is not an active part of it';
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: fn_protect_signed_specialist_decision(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_protect_signed_specialist_decision() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status = 'SIGNED' THEN
        RAISE EXCEPTION 'Signed Specialist consultation decisions are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END $$;


--
-- Name: fn_referral_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_referral_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE sa TIMESTAMPTZ; dec review_decision;
BEGIN
  SELECT cr.signed_at, cr.decision INTO sa, dec FROM tbl_clinical_reviews cr WHERE cr.id = NEW.review_id;
  IF sa IS NULL THEN
    RAISE EXCEPTION 'a referral requires a signed clinician review' USING ERRCODE = 'check_violation';
  END IF;
  IF dec NOT IN ('SPECIALIST_REVIEW','URGENT_REFERRAL') THEN
    RAISE EXCEPTION 'review decision % does not authorise a referral', dec USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fn_require_consent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_require_consent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE pid UUID; g BOOLEAN;
BEGIN
  pid := (to_jsonb(NEW) ->> 'patient_id')::uuid;
  SELECT pc.granted INTO g
    FROM tbl_patient_consents pc JOIN mst_consent_purposes cp ON cp.id = pc.purpose_id
   WHERE pc.patient_id = pid AND cp.code = TG_ARGV[0]
   ORDER BY pc.consent_seq DESC LIMIT 1;
  IF g IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'operation rejected: no active % consent for this patient', TG_ARGV[0]
          USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fn_require_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_require_role() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE uid UUID; rcode TEXT;
BEGIN
  uid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  IF uid IS NULL THEN RETURN NEW; END IF;
  SELECT r.code INTO rcode FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id WHERE u.id = uid;
  IF rcode IS NULL OR NOT (rcode = ANY (string_to_array(TG_ARGV[1], ','))) THEN
    RAISE EXCEPTION '%.% must be a user with role in (%), got %',
          TG_TABLE_NAME, TG_ARGV[0], TG_ARGV[1], COALESCE(rcode, 'unknown')
          USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fn_review_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_review_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.screening_id <> OLD.screening_id OR NEW.patient_id <> OLD.patient_id THEN
    RAISE EXCEPTION 'a review cannot be moved to another screening/patient' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'version conflict on review %: expected %, got %', OLD.id, OLD.version + 1, NEW.version
          USING ERRCODE = 'serialization_failure';
  END IF;
  IF OLD.signed_at IS NOT NULL THEN
    IF NEW.doctor_id <> OLD.doctor_id THEN
      RAISE EXCEPTION 'a signed review cannot be rewritten by another user' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.amendment_reason IS NULL OR NEW.amendment_reason IS NOT DISTINCT FROM OLD.amendment_reason THEN
      RAISE EXCEPTION 'amending a signed review requires a new amendment_reason' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fn_review_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_review_snapshot() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actor UUID;
BEGIN
  actor := COALESCE(NULLIF(current_setting('app.user_id', true), '')::uuid, NEW.doctor_id);
  INSERT INTO tbl_clinical_review_versions (review_id, version_no, snapshot, edited_by)
  VALUES (NEW.id, NEW.version, to_jsonb(NEW), actor);
  RETURN NEW;
END $$;


--
-- Name: fn_screening_consent_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_screening_consent_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE pcode TEXT; g BOOLEAN;
BEGIN
  IF NEW.consent_id IS NOT NULL THEN
    SELECT cp.code, pc.granted INTO pcode, g
      FROM tbl_patient_consents pc JOIN mst_consent_purposes cp ON cp.id = pc.purpose_id
     WHERE pc.id = NEW.consent_id;
    IF pcode IS DISTINCT FROM 'SCREENING' OR g IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'screening.consent_id must reference a granted SCREENING consent'
            USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fn_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;


--
-- Name: fn_user_has_patient_access(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_user_has_patient_access(p_user uuid, p_patient uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE u.id = p_user AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND r.code NOT IN ('DISTRICT_ADMIN', 'SYSTEM_ADMIN', 'SUPER_ADMIN')
          AND (
                (r.code NOT IN ('HEALTH_WORKER', 'MEDICAL_OFFICER') AND EXISTS (
                    SELECT 1 FROM tbl_case_assignments ca
                    WHERE ca.patient_id = p_patient AND ca.user_id = p_user
                      AND ca.valid_from <= now() AND (ca.valid_to IS NULL OR ca.valid_to > now())
                ))
             OR (r.code = 'HEALTH_WORKER' AND EXISTS (
                    SELECT 1
                    FROM tbl_patients p
                    JOIN tbl_health_worker_location_assignments a
                      ON a.user_id = p_user
                     AND a.village_id = p.village_id
                     AND a.facility_id = p.registered_facility_id
                    WHERE p.id = p_patient
                      AND a.valid_from <= CURRENT_DATE
                      AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
                ))
             -- New: own registrations in a Mandal the Health Worker is still assigned to
             OR (r.code = 'HEALTH_WORKER' AND EXISTS (
                    SELECT 1
                    FROM tbl_patients p
                    LEFT JOIN mst_villages v ON v.id = p.village_id
                    JOIN tbl_health_worker_location_assignments a
                      ON a.user_id = p_user
                     AND a.mandal_id = COALESCE(p.mandal_id, v.mandal_id)
                    WHERE p.id = p_patient
                      AND p.registered_by = p_user
                      AND a.valid_from <= CURRENT_DATE
                      AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
                ))
             OR (r.code = 'MEDICAL_OFFICER' AND EXISTS (
                    SELECT 1
                    FROM tbl_patients p
                    LEFT JOIN mst_villages v ON v.id = p.village_id
                    JOIN tbl_medical_officer_mandal_assignments a
                      ON a.user_id = p_user
                     AND a.mandal_id = COALESCE(p.mandal_id, v.mandal_id)
                    WHERE p.id = p_patient
                      AND a.valid_from <= CURRENT_DATE
                      AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
                ))
          )
    );
$$;


--
-- Name: fn_validate_health_worker_location_assignment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_health_worker_location_assignment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE u.id = NEW.user_id AND r.code = 'HEALTH_WORKER'
    ) THEN
        RAISE EXCEPTION 'Location assignment user must have the HEALTH_WORKER role';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_validate_medical_officer_case_claim(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_medical_officer_case_claim() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_patient_mandal BIGINT;
BEGIN
    SELECT COALESCE(p.mandal_id, v.mandal_id) INTO v_patient_mandal
    FROM tbl_patients p
    LEFT JOIN mst_villages v ON v.id = p.village_id
    WHERE p.id = NEW.patient_id AND p.deleted_at IS NULL;

    IF v_patient_mandal IS NULL THEN
        RAISE EXCEPTION 'Patient must have a village and Mandal before it can be claimed';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM tbl_users u
        JOIN mst_roles r ON r.id = u.role_id
        JOIN tbl_medical_officer_mandal_assignments a ON a.user_id = u.id
        WHERE u.id = NEW.medical_officer_id
          AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND r.code = 'MEDICAL_OFFICER'
          AND a.mandal_id = v_patient_mandal
          AND a.valid_from <= CURRENT_DATE
          AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
    ) THEN
        RAISE EXCEPTION 'Medical Officer is not assigned to the patient Mandal';
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: fn_validate_medical_officer_mandal_assignment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_medical_officer_mandal_assignment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE u.id = NEW.user_id AND r.code = 'MEDICAL_OFFICER'
    ) THEN
        RAISE EXCEPTION 'Mandal assignment user must have the MEDICAL_OFFICER role';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_validate_registration_reviewer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_registration_reviewer() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    actor_id UUID;
    v_district_id BIGINT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'PENDING'
           OR NEW.workflow_version IS DISTINCT FROM 1
           OR NEW.status_token_hash IS NULL
           OR NEW.status_token_hash !~ '^[0-9a-f]{64}$'
           OR NEW.status_token_expires_at IS NULL
           OR NEW.status_token_expires_at <= CURRENT_TIMESTAMP
           OR NEW.status_token_expires_at > CURRENT_TIMESTAMP + INTERVAL '30 days'
           OR NEW.reviewed_by IS NOT NULL
           OR NEW.reviewed_at IS NOT NULL
           OR NEW.created_user_id IS NOT NULL
           OR NEW.mo_recommended_by IS NOT NULL
           OR NEW.mo_recommended_at IS NOT NULL
           OR NEW.mo_recommendation IS NOT NULL
           OR NEW.mo_recommendation_note IS NOT NULL THEN
            RAISE EXCEPTION
                'Registration requests must begin pending and undecided with a valid status token'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status IN ('APPROVED', 'REJECTED') THEN
        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION
                'A finalized registration request is immutable'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.workflow_version IS DISTINCT FROM 1
       OR NEW.workflow_version IS DISTINCT FROM OLD.workflow_version
       OR NEW.facility_id IS DISTINCT FROM OLD.facility_id
       OR NEW.mandal_id IS DISTINCT FROM OLD.mandal_id
       OR NEW.village_id IS DISTINCT FROM OLD.village_id THEN
        RAISE EXCEPTION
            'Two-stage workflow and submitted locations are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Permit changes only to fields used by one of the explicit workflow
    -- transitions below; applicant-submitted fields and token data stay fixed.
    -- Token columns are deliberately not excluded from these row comparisons.
    IF (to_jsonb(NEW) - ARRAY[
            'status', 'reviewed_by', 'reviewed_at', 'rejection_reason',
            'created_user_id', 'mo_recommended_by', 'mo_recommended_at',
            'mo_recommendation', 'mo_recommendation_note'
        ]) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY[
            'status', 'reviewed_by', 'reviewed_at', 'rejection_reason',
            'created_user_id', 'mo_recommended_by', 'mo_recommended_at',
            'mo_recommendation', 'mo_recommendation_note'
        ]) THEN
        RAISE EXCEPTION
            'Submitted registration details and status token are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    -- This setting is caller-settable by a database session with sufficient
    -- privileges; this trigger does not authenticate callers. API
    -- authentication and private DB access are still required.
    actor_id := NULLIF(current_setting('app.actor_id', TRUE), '')::UUID;

    IF NEW.mo_recommended_by IS DISTINCT FROM OLD.mo_recommended_by
       OR NEW.mo_recommended_at IS DISTINCT FROM OLD.mo_recommended_at
       OR NEW.mo_recommendation IS DISTINCT FROM OLD.mo_recommendation
       OR NEW.mo_recommendation_note IS DISTINCT FROM OLD.mo_recommendation_note THEN
        IF OLD.status <> 'PENDING'
           OR NEW.status <> 'PENDING'
           OR OLD.mo_recommended_by IS NOT NULL
           OR NEW.mo_recommended_by IS DISTINCT FROM actor_id
           OR NEW.mo_recommended_at IS NULL
           OR NEW.mo_recommendation IS NULL
           OR NEW.mo_recommendation NOT IN ('RECOMMENDED', 'NOT_RECOMMENDED')
           OR NEW.mo_recommendation_note IS NULL
           OR length(regexp_replace(
                NEW.mo_recommendation_note, '[[:space:]]', '', 'g'
              )) = 0
           OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
           OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
           OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
           OR NEW.created_user_id IS DISTINCT FROM OLD.created_user_id
           OR (to_jsonb(NEW) - ARRAY[
                  'mo_recommended_by', 'mo_recommended_at',
                  'mo_recommendation', 'mo_recommendation_note'
              ]) IS DISTINCT FROM
              (to_jsonb(OLD) - ARRAY[
                  'mo_recommended_by', 'mo_recommended_at',
                  'mo_recommendation', 'mo_recommendation_note'
              ]) THEN
            RAISE EXCEPTION
                'Only one separate recommendation may be recorded on a pending request'
                USING ERRCODE = 'check_violation';
        END IF;

        PERFORM 1
          FROM tbl_users u
          JOIN mst_roles role ON role.id = u.role_id
          JOIN tbl_medical_officer_mandal_assignments assignment
            ON assignment.user_id = u.id
          JOIN mst_mandals mandal ON mandal.id = assignment.mandal_id
         WHERE u.id = actor_id
           AND u.id = NEW.mo_recommended_by
           AND u.status = 'ACTIVE'
           AND u.deleted_at IS NULL
           AND role.code = 'MEDICAL_OFFICER'
           AND role.is_active IS TRUE
           AND assignment.mandal_id = NEW.mandal_id
           AND mandal.is_active IS TRUE
           AND assignment.valid_from <= CURRENT_DATE
           AND (assignment.valid_to IS NULL
                OR assignment.valid_to >= CURRENT_DATE)
         FOR SHARE OF u, role, assignment;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Recommending Medical Officer must be active and assigned to this Mandal'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status <> 'PENDING'
       OR NEW.status NOT IN ('APPROVED', 'REJECTED')
       OR NEW.mo_recommended_by IS NULL
       OR NEW.mo_recommended_at IS NULL
       OR NEW.mo_recommendation IS NULL
       OR NEW.mo_recommendation NOT IN ('RECOMMENDED', 'NOT_RECOMMENDED')
       OR NEW.mo_recommendation_note IS NULL
       OR length(regexp_replace(
            NEW.mo_recommendation_note, '[[:space:]]', '', 'g'
          )) = 0
       OR NEW.reviewed_by IS DISTINCT FROM actor_id
       OR NEW.reviewed_at IS NULL
       OR NEW.mo_recommended_by IS DISTINCT FROM OLD.mo_recommended_by
       OR NEW.mo_recommended_at IS DISTINCT FROM OLD.mo_recommended_at
       OR NEW.mo_recommendation IS DISTINCT FROM OLD.mo_recommendation
       OR NEW.mo_recommendation_note IS DISTINCT FROM OLD.mo_recommendation_note
       OR (to_jsonb(NEW) - ARRAY[
              'status', 'reviewed_by', 'reviewed_at',
              'rejection_reason', 'created_user_id'
          ]) IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY[
              'status', 'reviewed_by', 'reviewed_at',
              'rejection_reason', 'created_user_id'
          ]) THEN
        RAISE EXCEPTION
            'Final decision requires a prior recommendation and immutable request details'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'REJECTED' THEN
        IF NEW.created_user_id IS NOT NULL
           OR NEW.rejection_reason IS NULL
           OR length(regexp_replace(
                NEW.rejection_reason, '[[:space:]]', '', 'g'
              )) = 0 THEN
            RAISE EXCEPTION
                'Final rejection requires a reason and cannot create an account'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.created_user_id IS NULL
       OR NEW.rejection_reason IS NOT NULL THEN
        RAISE EXCEPTION
            'Final approval must reference the created Health Worker account and have no rejection reason'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT facility.district_id
      INTO v_district_id
      FROM mst_facilities facility
     WHERE facility.id = NEW.facility_id
       AND facility.is_active IS TRUE;

    IF v_district_id IS NULL OR NOT EXISTS (
        SELECT 1
          FROM mst_facilities facility
          JOIN mst_mandals mandal
            ON mandal.id = NEW.mandal_id
           AND mandal.district_id = facility.district_id
           AND mandal.is_active IS TRUE
          JOIN mst_villages village
            ON village.id = NEW.village_id
           AND village.mandal_id = mandal.id
           AND village.is_active IS TRUE
         WHERE facility.id = NEW.facility_id
           AND facility.mandal_id = mandal.id
           AND facility.is_active IS TRUE
    ) THEN
        RAISE EXCEPTION
            'Registration location must be active and internally consistent'
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM 1
      FROM tbl_users u
      JOIN mst_roles role ON role.id = u.role_id
      JOIN mst_districts district ON district.id = u.district_id
     WHERE u.id = actor_id
       AND u.id = NEW.reviewed_by
       AND u.status = 'ACTIVE'
       AND u.deleted_at IS NULL
       AND role.code = 'DISTRICT_ADMIN'
       AND role.is_active IS TRUE
       AND u.district_id = v_district_id
       AND district.is_active IS TRUE
     FOR SHARE OF u, role;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Final decision must be made by the active District Admin for this district'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.status = 'APPROVED' AND NOT EXISTS (
        SELECT 1
          FROM tbl_users worker
          JOIN mst_roles worker_role ON worker_role.id = worker.role_id
          JOIN tbl_user_facility_assignments facility_assignment
            ON facility_assignment.user_id = worker.id
           AND facility_assignment.facility_id = NEW.facility_id
           AND facility_assignment.is_primary IS TRUE
           AND facility_assignment.valid_to IS NULL
          JOIN tbl_health_worker_location_assignments location_assignment
            ON location_assignment.user_id = worker.id
           AND location_assignment.district_id = v_district_id
           AND location_assignment.mandal_id = NEW.mandal_id
           AND location_assignment.village_id = NEW.village_id
           AND location_assignment.facility_id = NEW.facility_id
           AND location_assignment.assigned_by = actor_id
           AND location_assignment.valid_to IS NULL
         WHERE worker.id = NEW.created_user_id
           AND worker.username = NEW.username
           AND worker.district_id = v_district_id
           AND worker.status = 'ACTIVE'
           AND worker.deleted_at IS NULL
           AND worker_role.code = 'HEALTH_WORKER'
           AND worker_role.is_active IS TRUE
    ) THEN
        RAISE EXCEPTION
            'Approved Health Worker must be active and have the submitted assignments'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$_$;


--
-- Name: fn_video_slot_booked(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_video_slot_booked() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.slot_id IS DISTINCT FROM NEW.slot_id THEN
    UPDATE tbl_consultation_slots s
       SET is_booked = EXISTS (SELECT 1 FROM tbl_video_consultations v WHERE v.slot_id = OLD.slot_id AND v.is_active)
     WHERE s.id = OLD.slot_id;
  END IF;
  UPDATE tbl_consultation_slots s
     SET is_booked = EXISTS (SELECT 1 FROM tbl_video_consultations v WHERE v.slot_id = NEW.slot_id AND v.is_active)
   WHERE s.id = NEW.slot_id;
  RETURN NULL;
END $$;


--
-- Name: fn_video_slot_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_video_slot_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE sid UUID;
BEGIN
  SELECT s.specialist_id INTO sid FROM tbl_consultation_slots s WHERE s.id = NEW.slot_id;
  IF sid IS DISTINCT FROM NEW.specialist_id THEN
    RAISE EXCEPTION 'video consultation specialist must match the slot specialist' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fn_village_mandal_from_gp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_village_mandal_from_gp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    gp_mandal BIGINT;
BEGIN
    IF NEW.gram_panchayat_id IS NOT NULL THEN
        SELECT mandal_id INTO gp_mandal FROM public.mst_gram_panchayats WHERE id = NEW.gram_panchayat_id;

        IF NEW.mandal_id IS NULL THEN
            NEW.mandal_id := gp_mandal;
        ELSIF NEW.mandal_id <> gp_mandal THEN
            RAISE EXCEPTION 'Village mandal % does not match the mandal % of its gram panchayat',
                NEW.mandal_id, gp_mandal;
        END IF;
    END IF;

    RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: mst_ai_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_ai_models (
    id bigint NOT NULL,
    provider text NOT NULL,
    model_version text NOT NULL,
    description text,
    permitted_use text DEFAULT 'Hackathon demonstration only - NOT FOR CLINICAL USE'::text NOT NULL,
    validation_status text DEFAULT 'NOT_VALIDATED'::text NOT NULL,
    supports_localization boolean DEFAULT false NOT NULL,
    dataset_card_ref text,
    model_card_ref text,
    is_research_only boolean DEFAULT true NOT NULL,
    clinical_use boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_model_never_clinical CHECK (((clinical_use = false) AND (is_research_only = true)))
);


--
-- Name: mst_ai_models_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_ai_models ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_ai_models_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_appointment_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_appointment_statuses (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_terminal boolean DEFAULT false NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL
);


--
-- Name: mst_appointment_statuses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_appointment_statuses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_appointment_statuses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_consent_purposes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_consent_purposes (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    text_en text NOT NULL,
    text_te text,
    version text DEFAULT 'v1'::text NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_consent_purposes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_consent_purposes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_consent_purposes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_diagnostic_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_diagnostic_categories (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    sort_order integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mst_diagnostic_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_diagnostic_categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_diagnostic_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_diagnostic_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_diagnostic_tests (
    id bigint NOT NULL,
    category_id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    default_fasting boolean DEFAULT false NOT NULL,
    investigation_type_id bigint,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mst_diagnostic_tests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_diagnostic_tests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_diagnostic_tests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_districts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_districts (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    state_name text DEFAULT 'Andhra Pradesh'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    lgd_code integer,
    state_lgd_code integer,
    data_source text DEFAULT 'MANUAL'::text NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    lgd_synced_at timestamp with time zone,
    import_batch_id bigint,
    CONSTRAINT ck_districts_source CHECK ((data_source = ANY (ARRAY['MANUAL'::text, 'LGD'::text])))
);


--
-- Name: mst_districts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_districts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_districts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_exposure_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_exposure_types (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    category text DEFAULT 'TOBACCO'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT mst_exposure_types_category_check CHECK ((category = ANY (ARRAY['TOBACCO'::text, 'ARECA'::text, 'ALCOHOL'::text, 'OTHER'::text])))
);


--
-- Name: mst_exposure_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_exposure_types ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_exposure_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_facilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_facilities (
    id bigint NOT NULL,
    district_id bigint NOT NULL,
    facility_type public.facility_type NOT NULL,
    phc_id bigint,
    hospital_id bigint,
    code text,
    name_en text NOT NULL,
    name_te text,
    is_active boolean DEFAULT true NOT NULL,
    category text NOT NULL,
    mandal_id bigint,
    village_id bigint,
    address text,
    pin_code text,
    contact_phone text,
    email text,
    incharge_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_facility_category CHECK ((((category = 'PHC'::text) AND (facility_type = 'PHC'::public.facility_type)) OR ((category = ANY (ARRAY['CHC'::text, 'DISTRICT_HOSPITAL'::text, 'AREA_HOSPITAL'::text, 'MEDICAL_COLLEGE'::text])) AND (facility_type = 'HOSPITAL'::public.facility_type)) OR ((category = 'SUB_CENTRE'::text) AND (facility_type = 'SUB_CENTRE'::public.facility_type)) OR ((category = 'OTHER'::text) AND (facility_type = 'OTHER'::public.facility_type)) OR ((category = ANY (ARRAY['SCREENING_SITE'::text, 'DISTRICT_OFFICE'::text])) AND ((facility_type)::text = category)))),
    CONSTRAINT ck_facility_parent CHECK ((((facility_type = 'PHC'::public.facility_type) AND (phc_id IS NOT NULL) AND (hospital_id IS NULL)) OR ((facility_type = 'HOSPITAL'::public.facility_type) AND (hospital_id IS NOT NULL) AND (phc_id IS NULL)) OR ((facility_type = ANY (ARRAY['SCREENING_SITE'::public.facility_type, 'DISTRICT_OFFICE'::public.facility_type, 'SUB_CENTRE'::public.facility_type, 'OTHER'::public.facility_type])) AND (phc_id IS NULL) AND (hospital_id IS NULL)))),
    CONSTRAINT ck_facility_phone CHECK (((contact_phone IS NULL) OR (contact_phone ~ '^[0-9]{10,11}$'::text))),
    CONSTRAINT ck_facility_pin CHECK (((pin_code IS NULL) OR (pin_code ~ '^[1-9][0-9]{5}$'::text)))
);


--
-- Name: mst_facilities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_facilities ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_facilities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_followup_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_followup_statuses (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_terminal boolean DEFAULT false NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL
);


--
-- Name: mst_followup_statuses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_followup_statuses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_followup_statuses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_gram_panchayats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_gram_panchayats (
    id bigint NOT NULL,
    mandal_id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_gram_panchayats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_gram_panchayats ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_gram_panchayats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_hospitals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_hospitals (
    id bigint NOT NULL,
    district_id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    level text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_hospitals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_hospitals ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_hospitals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_investigation_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_investigation_statuses (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_terminal boolean DEFAULT false NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL
);


--
-- Name: mst_investigation_statuses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_investigation_statuses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_investigation_statuses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_investigation_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_investigation_types (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_investigation_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_investigation_types ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_investigation_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_languages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_languages (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    native_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_languages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_languages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_languages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_mandals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_mandals (
    id bigint NOT NULL,
    district_id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_active boolean DEFAULT true NOT NULL,
    lgd_code integer,
    data_source text DEFAULT 'MANUAL'::text NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    lgd_synced_at timestamp with time zone,
    import_batch_id bigint,
    CONSTRAINT ck_mandals_source CHECK ((data_source = ANY (ARRAY['MANUAL'::text, 'LGD'::text])))
);


--
-- Name: mst_mandals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_mandals ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_mandals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_missed_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_missed_reasons (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_missed_reasons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_missed_reasons ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_missed_reasons_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_notification_templates (
    id bigint NOT NULL,
    code text NOT NULL,
    language_id bigint NOT NULL,
    channel public.notification_channel DEFAULT 'IN_APP'::public.notification_channel NOT NULL,
    subject text,
    body text NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_notification_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_notification_templates ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_notification_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_permissions (
    id bigint NOT NULL,
    code text NOT NULL,
    resource text NOT NULL,
    action text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mst_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_permissions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_phcs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_phcs (
    id bigint NOT NULL,
    mandal_id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_phcs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_phcs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_phcs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_protocol_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_protocol_rules (
    id bigint NOT NULL,
    code text NOT NULL,
    rule_type text NOT NULL,
    applies_to text NOT NULL,
    offset_minutes integer NOT NULL,
    template_code text,
    escalation_level smallint,
    is_placeholder boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    CONSTRAINT mst_protocol_rules_applies_to_check CHECK ((applies_to = ANY (ARRAY['HOSPITAL_APPOINTMENT'::text, 'VIDEO_CONSULTATION'::text, 'REFERRAL'::text, 'INVESTIGATION'::text, 'TREATMENT_LINKAGE'::text]))),
    CONSTRAINT mst_protocol_rules_escalation_level_check CHECK (((escalation_level >= 1) AND (escalation_level <= 5))),
    CONSTRAINT mst_protocol_rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['REMINDER'::text, 'FOLLOWUP_TASK'::text, 'OVERDUE_ESCALATION'::text])))
);


--
-- Name: mst_protocol_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_protocol_rules ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_protocol_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_referral_priorities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_referral_priorities (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    priority_rank smallint NOT NULL,
    target_days integer,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_referral_priorities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_referral_priorities ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_referral_priorities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_roles (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    description text,
    mfa_required boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_system_role boolean
);


--
-- Name: mst_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_roles ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_screening_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_screening_sites (
    id bigint NOT NULL,
    village_id bigint,
    facility_id bigint,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    site_type text DEFAULT 'CAMP'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT mst_screening_sites_site_type_check CHECK ((site_type = ANY (ARRAY['CAMP'::text, 'PHC'::text, 'HOME'::text, 'MOBILE_UNIT'::text])))
);


--
-- Name: mst_screening_sites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_screening_sites ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_screening_sites_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_specialties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_specialties (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_specialties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_specialties ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_specialties_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_symptoms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_symptoms (
    id bigint NOT NULL,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mst_symptoms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_symptoms ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_symptoms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_ui_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_ui_translations (
    id bigint NOT NULL,
    msg_key text NOT NULL,
    language_id bigint NOT NULL,
    msg_text text NOT NULL,
    module text,
    needs_review boolean DEFAULT true NOT NULL
);


--
-- Name: mst_ui_translations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_ui_translations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_ui_translations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mst_villages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_villages (
    id bigint NOT NULL,
    gram_panchayat_id bigint,
    code text NOT NULL,
    name_en text NOT NULL,
    name_te text,
    is_active boolean DEFAULT true NOT NULL,
    lgd_code integer,
    data_source text DEFAULT 'MANUAL'::text NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    lgd_synced_at timestamp with time zone,
    import_batch_id bigint,
    mandal_id bigint NOT NULL,
    CONSTRAINT ck_villages_source CHECK ((data_source = ANY (ARRAY['MANUAL'::text, 'LGD'::text])))
);


--
-- Name: mst_villages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mst_villages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mst_villages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    checksum character(64) NOT NULL,
    applied_by text DEFAULT 'migrator'::text NOT NULL,
    execution_ms integer,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seq_ai_analysis_code; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_ai_analysis_code
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seq_diagnostic_order_code; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_diagnostic_order_code
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seq_patient_code; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_patient_code
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seq_referral_code; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_referral_code
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_ai_assessment_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_ai_assessment_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    event text NOT NULL,
    http_status integer,
    latency_ms integer,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tbl_ai_assessment_logs_latency_ms_check CHECK ((latency_ms >= 0))
);


--
-- Name: tbl_ai_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_ai_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analysis_code text DEFAULT ('DEMO-AI-'::text || lpad((nextval('public.seq_ai_analysis_code'::regclass))::text, 3, '0'::text)) NOT NULL,
    screening_id uuid NOT NULL,
    photo_id uuid NOT NULL,
    ai_model_id bigint NOT NULL,
    model_provider text NOT NULL,
    model_version text NOT NULL,
    status public.ai_status DEFAULT 'QUEUED'::public.ai_status NOT NULL,
    result_label public.ai_result_label,
    image_quality_status public.quality_status,
    score numeric(5,4),
    localization jsonb,
    clinical_use boolean DEFAULT false NOT NULL,
    requires_clinician_review boolean DEFAULT true NOT NULL,
    warning text DEFAULT 'NOT FOR CLINICAL USE'::text NOT NULL,
    error_code text,
    attempt_no smallint DEFAULT 1 NOT NULL,
    requested_by uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    analysis_details jsonb,
    CONSTRAINT ck_ai_analysis_details_object CHECK (((analysis_details IS NULL) OR (jsonb_typeof(analysis_details) = 'object'::text))),
    CONSTRAINT ck_ai_completed_has_label CHECK (((status <> 'COMPLETED'::public.ai_status) OR ((result_label IS NOT NULL) AND (completed_at IS NOT NULL)))),
    CONSTRAINT ck_ai_failed_no_label CHECK (((status <> ALL (ARRAY['FAILED'::public.ai_status, 'UNAVAILABLE'::public.ai_status])) OR (result_label IS NULL))),
    CONSTRAINT tbl_ai_assessments_clinical_use_check CHECK ((clinical_use = false)),
    CONSTRAINT tbl_ai_assessments_requires_clinician_review_check CHECK (requires_clinician_review),
    CONSTRAINT tbl_ai_assessments_score_check CHECK (((score >= (0)::numeric) AND (score <= (1)::numeric))),
    CONSTRAINT tbl_ai_assessments_warning_check CHECK ((warning ~~* '%NOT FOR CLINICAL USE%'::text))
);


--
-- Name: tbl_appointment_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_appointment_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_consultation_id uuid,
    hospital_appointment_id uuid,
    from_status_id bigint,
    to_status_id bigint NOT NULL,
    changed_by uuid NOT NULL,
    reason text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_one_appointment_parent CHECK ((num_nonnulls(video_consultation_id, hospital_appointment_id) = 1))
);


--
-- Name: tbl_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_audit_logs (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    actor_role text,
    event text NOT NULL,
    outcome text DEFAULT 'SUCCESS'::text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    patient_id uuid,
    ip_address inet,
    request_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT tbl_audit_logs_outcome_check CHECK ((outcome = ANY (ARRAY['SUCCESS'::text, 'DENIED'::text, 'ERROR'::text])))
);


--
-- Name: tbl_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tbl_audit_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tbl_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tbl_care_discomfort_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_care_discomfort_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    reported_by uuid NOT NULL,
    issue_type text NOT NULL,
    severity text NOT NULL,
    is_urgent boolean DEFAULT false NOT NULL,
    description text NOT NULL,
    status public.care_discomfort_status DEFAULT 'OPEN'::public.care_discomfort_status NOT NULL,
    escalated_to_mo uuid,
    escalated_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolution_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tbl_care_discomfort_reports_issue_type_check CHECK ((issue_type = ANY (ARRAY['INCREASED_SYMPTOMS'::text, 'MEDICINE_DISCOMFORT'::text, 'NO_IMPROVEMENT'::text, 'NEW_COMPLAINT'::text, 'DIFFICULTY_FOLLOWING'::text, 'OTHER'::text]))),
    CONSTRAINT tbl_care_discomfort_reports_severity_check CHECK ((severity = ANY (ARRAY['MILD'::text, 'MODERATE'::text, 'SEVERE'::text, 'EMERGENCY'::text])))
);


--
-- Name: tbl_care_final_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_care_final_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    screening_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    medical_officer_id uuid NOT NULL,
    observations text NOT NULL,
    clinical_assessment text,
    recovery_confirmed boolean DEFAULT false NOT NULL,
    decision public.care_final_decision NOT NULL,
    signed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_care_followup_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_care_followup_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    reported_by uuid NOT NULL,
    visit_at timestamp with time zone NOT NULL,
    adhering_to_treatment boolean NOT NULL,
    patient_feedback text,
    reported_symptoms text,
    discomfort_present boolean DEFAULT false NOT NULL,
    notes text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    improvement_noted boolean,
    side_effects text,
    hospital_attended boolean,
    hospital_revisit_reminded boolean DEFAULT false NOT NULL,
    precautions_followed boolean
);


--
-- Name: tbl_care_followup_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_care_followup_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    assigned_hw_id uuid NOT NULL,
    due_at timestamp with time zone NOT NULL,
    instructions text,
    status public.care_followup_status DEFAULT 'SCHEDULED'::public.care_followup_status NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_care_medicines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_care_medicines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    medicine_name text NOT NULL,
    dosage text NOT NULL,
    frequency text NOT NULL,
    duration_days integer NOT NULL,
    precautions text,
    sort_order integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    start_date date,
    expected_end_date date,
    CONSTRAINT ck_care_medicine_dates CHECK (((expected_end_date IS NULL) OR (start_date IS NULL) OR (expected_end_date >= start_date))),
    CONSTRAINT tbl_care_medicines_duration_days_check CHECK ((duration_days > 0))
);


--
-- Name: tbl_care_plan_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_care_plan_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    from_status public.care_plan_status,
    to_status public.care_plan_status NOT NULL,
    changed_by uuid NOT NULL,
    reason text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_care_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_care_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    screening_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    referral_id uuid,
    source public.care_plan_source NOT NULL,
    status public.care_plan_status DEFAULT 'AWAITING_NAVIGATOR'::public.care_plan_status NOT NULL,
    plan_version integer DEFAULT 1 NOT NULL,
    supersedes_plan_id uuid,
    responsible_mo_id uuid NOT NULL,
    assigned_navigator_id uuid,
    clinical_summary text NOT NULL,
    precautions text,
    treatment_start_date date,
    expected_end_date date,
    closed_at timestamp with time zone,
    closed_by uuid,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hospital_revisit_date date,
    patient_informed boolean DEFAULT false NOT NULL,
    hospital_revisit_scheduled boolean DEFAULT false NOT NULL,
    hospital_attended boolean,
    responsible_specialist_id uuid,
    precautions_duration_days integer,
    precautions_expected_end_date date,
    CONSTRAINT ck_care_plan_closed CHECK ((((status = 'CLOSED'::public.care_plan_status) AND (closed_at IS NOT NULL) AND (closed_by IS NOT NULL)) OR ((status <> 'CLOSED'::public.care_plan_status) AND (closed_at IS NULL)))),
    CONSTRAINT ck_care_plan_dates CHECK (((expected_end_date IS NULL) OR (treatment_start_date IS NULL) OR (expected_end_date >= treatment_start_date))),
    CONSTRAINT ck_care_plan_precautions_duration CHECK (((precautions_duration_days IS NULL) OR ((precautions_duration_days >= 1) AND (precautions_duration_days <= 365)))),
    CONSTRAINT ck_care_plan_precautions_end CHECK (((precautions_expected_end_date IS NULL) OR (treatment_start_date IS NULL) OR (precautions_expected_end_date >= treatment_start_date))),
    CONSTRAINT ck_care_plan_revisit_dates CHECK (((hospital_revisit_date IS NULL) OR (treatment_start_date IS NULL) OR (hospital_revisit_date >= treatment_start_date))),
    CONSTRAINT tbl_care_plans_plan_version_check CHECK ((plan_version >= 1))
);


--
-- Name: tbl_care_return_to_mo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_care_return_to_mo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    referral_id uuid,
    authorized_by uuid NOT NULL,
    authorized_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    confirmed_by uuid,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_care_return_confirm_pair CHECK ((((confirmed_by IS NULL) AND (confirmed_at IS NULL)) OR ((confirmed_by IS NOT NULL) AND (confirmed_at IS NOT NULL))))
);


--
-- Name: tbl_case_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_case_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    referral_id uuid,
    user_id uuid NOT NULL,
    assigned_by uuid NOT NULL,
    reason text,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_to timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_case_assign_dates CHECK (((valid_to IS NULL) OR (valid_to > valid_from)))
);


--
-- Name: tbl_case_classifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_case_classifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seq bigint NOT NULL,
    patient_id uuid NOT NULL,
    screening_id uuid NOT NULL,
    level public.classification_level NOT NULL,
    clinical_review_id uuid,
    pathology_review_id uuid,
    set_by uuid NOT NULL,
    note text,
    set_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_case_classifications_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tbl_case_classifications ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tbl_case_classifications_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tbl_case_escalations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_case_escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    referral_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    level smallint DEFAULT 1 NOT NULL,
    escalated_by uuid,
    escalated_to uuid,
    reason text NOT NULL,
    status public.escalation_status DEFAULT 'OPEN'::public.escalation_status NOT NULL,
    escalated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT tbl_case_escalations_level_check CHECK (((level >= 1) AND (level <= 5)))
);


--
-- Name: tbl_clinical_review_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_clinical_review_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    version_no integer NOT NULL,
    snapshot jsonb NOT NULL,
    edited_by uuid NOT NULL,
    edited_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_clinical_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_clinical_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    screening_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    finding text NOT NULL,
    impression text,
    ai_assessment_id uuid,
    ai_agreement public.ai_agreement DEFAULT 'NOT_AVAILABLE'::public.ai_agreement NOT NULL,
    ai_discrepancy_note text,
    decision public.review_decision,
    followup_instructions text,
    referral_reason text,
    request_note text,
    version integer DEFAULT 1 NOT NULL,
    amendment_reason text,
    signed_at timestamp with time zone,
    signature_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_ai_agreement_needs_ai CHECK (((ai_agreement = 'NOT_AVAILABLE'::public.ai_agreement) OR (ai_assessment_id IS NOT NULL))),
    CONSTRAINT ck_ai_disagree_note CHECK (((ai_agreement <> 'DISAGREE'::public.ai_agreement) OR (ai_discrepancy_note IS NOT NULL))),
    CONSTRAINT ck_request_needs_note CHECK (((decision <> ALL (ARRAY['REQUEST_RECAPTURE'::public.review_decision, 'REQUEST_MORE_INFO'::public.review_decision])) OR (request_note IS NOT NULL))),
    CONSTRAINT ck_sign_needs_decision CHECK (((signed_at IS NULL) OR ((decision IS NOT NULL) AND (signature_hash IS NOT NULL))))
);


--
-- Name: tbl_consultation_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_consultation_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consultation_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    author_id uuid NOT NULL,
    version_no integer DEFAULT 1 NOT NULL,
    note_text text NOT NULL,
    outcome text,
    next_action text,
    signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_consultation_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_consultation_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    specialist_id uuid NOT NULL,
    hospital_id bigint,
    slot_start timestamp with time zone NOT NULL,
    slot_end timestamp with time zone NOT NULL,
    mode public.consult_mode DEFAULT 'VIDEO'::public.consult_mode NOT NULL,
    is_booked boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_slot_range CHECK ((slot_end > slot_start))
);


--
-- Name: tbl_data_exports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_data_exports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exported_by uuid NOT NULL,
    export_kind text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    row_count integer,
    contains_identifiers boolean DEFAULT false NOT NULL,
    approved_by uuid,
    exported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_identifiable_export_approved CHECK (((contains_identifiers = false) OR (approved_by IS NOT NULL))),
    CONSTRAINT tbl_data_exports_row_count_check CHECK ((row_count >= 0))
);


--
-- Name: tbl_demo_datasets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_demo_datasets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text,
    expected_counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    seeded_by uuid,
    seeded_at timestamp with time zone,
    last_reset_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: tbl_diagnostic_advice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diagnostic_advice (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    findings text NOT NULL,
    precautions text,
    treatment_advice text,
    medicine_name text,
    dosage text,
    duration_text text,
    follow_up_instructions text,
    additional_diagnostics_needed boolean DEFAULT false NOT NULL,
    additional_diagnostics_notes text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    signed_by uuid,
    signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version_no integer DEFAULT 1 NOT NULL,
    supersedes_advice_id uuid,
    is_current boolean DEFAULT true NOT NULL,
    follow_up_required boolean DEFAULT false NOT NULL,
    follow_up_due_date date,
    reassessment_instructions text,
    closure_reason text,
    created_by uuid,
    CONSTRAINT ck_diagnostic_advice_signed CHECK ((((status = 'DRAFT'::text) AND (signed_by IS NULL) AND (signed_at IS NULL)) OR ((status = 'SIGNED'::text) AND (signed_by IS NOT NULL) AND (signed_at IS NOT NULL)))),
    CONSTRAINT tbl_diagnostic_advice_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SIGNED'::text])))
);


--
-- Name: tbl_diagnostic_advice_followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diagnostic_advice_followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advice_id uuid NOT NULL,
    order_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    health_worker_id uuid NOT NULL,
    patient_acknowledged boolean DEFAULT false NOT NULL,
    followup_date date,
    outcome_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contacted_at timestamp with time zone,
    patient_contacted boolean,
    symptoms_status text,
    improvement_status text,
    advice_followed boolean,
    medicine_adherence text,
    new_problems text,
    specialist_review_needed boolean,
    followup_notes text,
    status text DEFAULT 'SUBMITTED'::text NOT NULL,
    cycle_no integer DEFAULT 1 NOT NULL,
    idempotency_key text,
    submitted_at timestamp with time zone,
    returned_by uuid,
    returned_at timestamp with time zone,
    return_reason text,
    forwarded_to_specialist_by uuid,
    forwarded_to_specialist_at timestamp with time zone,
    verified_by uuid,
    verified_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_diagnostic_advice_followup_improvement CHECK (((improvement_status IS NULL) OR (improvement_status = ANY (ARRAY['Improved'::text, 'No Change'::text, 'Worsened'::text])))),
    CONSTRAINT ck_diagnostic_advice_followup_status CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'RETURNED'::text, 'FORWARDED'::text])))
);


--
-- Name: tbl_diagnostic_appointment_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diagnostic_appointment_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid NOT NULL,
    from_status_id bigint,
    to_status_id bigint NOT NULL,
    changed_by uuid NOT NULL,
    reason text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_diagnostic_appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diagnostic_appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    diagnostic_order_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    facility_id bigint NOT NULL,
    requested_at timestamp with time zone NOT NULL,
    confirmed_at_time timestamp with time zone,
    status_id bigint NOT NULL,
    attendance public.attendance_status DEFAULT 'PENDING'::public.attendance_status NOT NULL,
    attended_at timestamp with time zone,
    patient_informed boolean DEFAULT false NOT NULL,
    patient_informed_at timestamp with time zone,
    contact_status text DEFAULT 'NOT_CONTACTED'::text NOT NULL,
    contact_notes text,
    coordination_notes text,
    location_note text,
    cancel_reason text,
    missed_reason_text text,
    booked_by uuid NOT NULL,
    confirmed_by uuid,
    confirmed_at timestamp with time zone,
    rescheduled_from_id uuid,
    idempotency_key text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tbl_diagnostic_appointments_contact_status_check CHECK ((contact_status = ANY (ARRAY['NOT_CONTACTED'::text, 'INFORMED'::text, 'REACHED'::text, 'UNREACHABLE'::text])))
);


--
-- Name: tbl_diagnostic_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diagnostic_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    test_id bigint NOT NULL,
    clinical_reason text NOT NULL,
    priority text NOT NULL,
    fasting_required boolean DEFAULT false NOT NULL,
    instructions text,
    status_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tbl_diagnostic_order_items_priority_check CHECK ((priority = ANY (ARRAY['ROUTINE'::text, 'URGENT'::text, 'EMERGENCY'::text])))
);


--
-- Name: tbl_diagnostic_order_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diagnostic_order_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    report_key text NOT NULL,
    checksum_sha256 text NOT NULL,
    mime_type text NOT NULL,
    original_filename text,
    file_size_bytes integer NOT NULL,
    uploaded_by uuid NOT NULL,
    review_status text DEFAULT 'PENDING'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    clinical_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scan_date date,
    diagnostic_centre text,
    collection_notes text,
    CONSTRAINT ck_diagnostic_report_key_private CHECK ((report_key !~* '^(https?:)?//'::text)),
    CONSTRAINT tbl_diagnostic_order_reports_checksum_sha256_check CHECK ((checksum_sha256 ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT tbl_diagnostic_order_reports_file_size_bytes_check CHECK (((file_size_bytes > 0) AND (file_size_bytes <= 10485760))),
    CONSTRAINT tbl_diagnostic_order_reports_mime_type_check CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text]))),
    CONSTRAINT tbl_diagnostic_order_reports_review_status_check CHECK ((review_status = ANY (ARRAY['PENDING'::text, 'RETURNED'::text, 'VERIFIED'::text, 'REVIEWED'::text])))
);


--
-- Name: tbl_diagnostic_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diagnostic_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_code text NOT NULL,
    patient_id uuid NOT NULL,
    referral_id uuid,
    facility_id bigint NOT NULL,
    prescribed_by uuid NOT NULL,
    status_id bigint NOT NULL,
    notes text,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workflow_status text DEFAULT 'SPECIALIST_REQUESTED'::text NOT NULL,
    assigned_health_worker_id uuid,
    returned_reason text,
    forwarded_to_hs_by uuid,
    forwarded_to_hs_at timestamp with time zone,
    routed_to_specialist_by uuid,
    routed_to_specialist_at timestamp with time zone,
    advice_forwarded_to_hw_by uuid,
    advice_forwarded_to_hw_at timestamp with time zone,
    requested_date date,
    collection_scan_date date,
    collection_centre text,
    collection_notes text,
    followup_forwarded_to_specialist_by uuid,
    followup_forwarded_to_specialist_at timestamp with time zone,
    case_closed_by uuid,
    case_closed_at timestamp with time zone,
    case_closure_reason text,
    reassessment_source_order_id uuid,
    video_decision_id uuid,
    CONSTRAINT ck_diagnostic_order_workflow_status CHECK ((workflow_status = ANY (ARRAY['SPECIALIST_REQUESTED'::text, 'NAVIGATOR_RECEIVED'::text, 'ASSIGNED_TO_HEALTH_WORKER'::text, 'COLLECTION_IN_PROGRESS'::text, 'REPORT_UPLOADED'::text, 'NAVIGATOR_VERIFICATION'::text, 'SENT_TO_HOSPITAL_STAFF'::text, 'SPECIALIST_REVIEW_PENDING'::text, 'SPECIALIST_REVIEWED'::text, 'ADVICE_SENT_TO_NAVIGATOR'::text, 'SENT_TO_HEALTH_WORKER'::text, 'PATIENT_FOLLOWUP'::text, 'FOLLOWUP_REPORT_SUBMITTED'::text, 'FOLLOWUP_RETURNED'::text, 'REASSESSMENT_PENDING'::text, 'FOLLOWUP_REQUIRED'::text, 'VIDEO_CONSULTATION_REQUESTED'::text, 'COMPLETED'::text, 'CLOSED'::text, 'RETURNED_FOR_CORRECTION'::text, 'ADDITIONAL_INFORMATION_REQUIRED'::text, 'CANCELLED'::text])))
);


--
-- Name: tbl_diagnostic_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diagnostic_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    item_id uuid,
    from_status_id bigint,
    to_status_id bigint NOT NULL,
    changed_by uuid NOT NULL,
    reason text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_district_admin_setup_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_district_admin_setup_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character(64) NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    encrypted_token text,
    email_delivery_status text DEFAULT 'NOT_CONFIGURED'::text NOT NULL,
    email_delivery_attempted_at timestamp with time zone,
    email_delivery_sent_at timestamp with time zone,
    sms_delivery_status text DEFAULT 'NOT_CONFIGURED'::text NOT NULL,
    sms_delivery_attempted_at timestamp with time zone,
    sms_delivery_sent_at timestamp with time zone,
    CONSTRAINT ck_district_admin_setup_token_lifetime CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '24:00:00'::interval)))),
    CONSTRAINT ck_district_setup_email_delivery_status CHECK ((email_delivery_status = ANY (ARRAY['NOT_CONFIGURED'::text, 'SENT'::text, 'FAILED'::text]))),
    CONSTRAINT ck_district_setup_sms_delivery_status CHECK ((sms_delivery_status = ANY (ARRAY['NOT_CONFIGURED'::text, 'SENT'::text, 'FAILED'::text])))
);


--
-- Name: tbl_followup_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_followup_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    task_type public.followup_task_type NOT NULL,
    trigger_event text,
    related_appointment_id uuid,
    related_investigation_id uuid,
    missed_reason_id bigint,
    priority smallint DEFAULT 3 NOT NULL,
    due_at timestamp with time zone NOT NULL,
    status_id bigint NOT NULL,
    accepted_at timestamp with time zone,
    closed_at timestamp with time zone,
    closure_reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_task_closed CHECK (((closed_at IS NULL) OR (closure_reason IS NOT NULL))),
    CONSTRAINT tbl_followup_tasks_priority_check CHECK (((priority >= 1) AND (priority <= 5)))
);


--
-- Name: tbl_health_worker_location_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_health_worker_location_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    district_id bigint NOT NULL,
    mandal_id bigint NOT NULL,
    village_id bigint NOT NULL,
    facility_id bigint NOT NULL,
    assigned_by uuid NOT NULL,
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_hw_assignment_dates CHECK (((valid_to IS NULL) OR (valid_to >= valid_from)))
);


--
-- Name: tbl_hospital_appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_hospital_appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    hospital_id bigint NOT NULL,
    specialty_id bigint NOT NULL,
    assigned_service text,
    location_note text,
    scheduled_at timestamp with time zone NOT NULL,
    status_id bigint NOT NULL,
    attendance public.attendance_status DEFAULT 'PENDING'::public.attendance_status NOT NULL,
    attended_at timestamp with time zone,
    missed_reason_id bigint,
    missed_reason_text text,
    cancel_reason text,
    clinician_outcome text,
    outcome_recorded_by uuid,
    outcome_recorded_at timestamp with time zone,
    booked_by uuid NOT NULL,
    confirmed_by uuid,
    confirmed_at timestamp with time zone,
    rescheduled_from_id uuid,
    idempotency_key text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_image_quality_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_image_quality_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    photo_id uuid NOT NULL,
    checker_version text NOT NULL,
    status public.quality_status NOT NULL,
    reason text,
    blur_score numeric(10,3),
    brightness_mean numeric(6,2),
    glare_ratio numeric(5,4),
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_quality_reason CHECK ((((status = 'ACCEPTABLE'::public.quality_status) AND (reason IS NULL)) OR ((status = 'RECAPTURE'::public.quality_status) AND (reason IS NOT NULL)))),
    CONSTRAINT tbl_image_quality_results_reason_check CHECK ((reason = ANY (ARRAY['invalid_image'::text, 'blurry'::text, 'underexposed'::text, 'overexposed'::text, 'glare'::text])))
);


--
-- Name: tbl_investigation_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_investigation_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    investigation_type_id bigint NOT NULL,
    status_id bigint NOT NULL,
    hospital_id bigint,
    indication text,
    ordered_by uuid NOT NULL,
    ordered_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_at timestamp with time zone,
    performed_at timestamp with time zone,
    report_received_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    next_action text,
    cancel_reason text,
    due_date date,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_investigation_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_investigation_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    from_status_id bigint,
    to_status_id bigint NOT NULL,
    changed_by uuid NOT NULL,
    reason text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_location_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_location_import_batches (
    id bigint NOT NULL,
    level text NOT NULL,
    source text DEFAULT 'LGD'::text NOT NULL,
    source_url text NOT NULL,
    parent_lgd_code integer,
    parent_name text,
    fetched_count integer NOT NULL,
    selected_count integer NOT NULL,
    inserted_count integer DEFAULT 0 NOT NULL,
    updated_count integer DEFAULT 0 NOT NULL,
    linked_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    imported_by uuid NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tbl_location_import_batches_level_check CHECK ((level = ANY (ARRAY['DISTRICT'::text, 'MANDAL'::text, 'VILLAGE'::text])))
);


--
-- Name: tbl_location_import_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tbl_location_import_batches ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tbl_location_import_batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tbl_medical_officer_case_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_medical_officer_case_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    medical_officer_id uuid NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    released_at timestamp with time zone,
    released_by uuid,
    CONSTRAINT ck_mo_claim_release_time CHECK (((released_at IS NULL) OR (released_at >= claimed_at)))
);


--
-- Name: tbl_medical_officer_mandal_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_medical_officer_mandal_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    mandal_id bigint NOT NULL,
    assigned_by uuid NOT NULL,
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_mo_mandal_assignment_dates CHECK (((valid_to IS NULL) OR (valid_to >= valid_from)))
);


--
-- Name: tbl_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_user_id uuid,
    patient_id uuid,
    template_id bigint NOT NULL,
    channel public.notification_channel DEFAULT 'IN_APP'::public.notification_channel NOT NULL,
    language_id bigint,
    status public.notification_status DEFAULT 'PENDING'::public.notification_status NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    related_task_id uuid,
    related_appointment_id uuid,
    related_video_id uuid,
    attempts smallint DEFAULT 0 NOT NULL,
    last_error text,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_notification_no_sensitive CHECK ((NOT (payload ?| ARRAY['diagnosis'::text, 'finding'::text, 'result'::text, 'pathology'::text, 'cancer'::text, 'biopsy'::text, 'ai'::text]))),
    CONSTRAINT ck_notification_recipient CHECK ((num_nonnulls(recipient_user_id, patient_id) >= 1))
);


--
-- Name: tbl_offline_sync_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_offline_sync_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    device_id text NOT NULL,
    idempotency_key text NOT NULL,
    entity_type text NOT NULL,
    operation public.sync_operation NOT NULL,
    payload jsonb NOT NULL,
    status public.sync_status DEFAULT 'PENDING'::public.sync_status NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    client_created_at timestamp with time zone NOT NULL,
    server_ack_at timestamp with time zone,
    resulting_entity_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_confirmed_has_ack CHECK (((status <> 'CONFIRMED'::public.sync_status) OR (server_ack_at IS NOT NULL)))
);


--
-- Name: tbl_password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character(64) NOT NULL,
    requested_ip inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    CONSTRAINT ck_reset_token_lifetime CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:15:00'::interval))))
);


--
-- Name: tbl_pathology_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_pathology_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    doc_kind text DEFAULT 'PATHOLOGY_REPORT'::text NOT NULL,
    report_key text NOT NULL,
    checksum_sha256 character(64) NOT NULL,
    mime_type text NOT NULL,
    is_simulated boolean DEFAULT true NOT NULL,
    summary_text text,
    uploaded_by uuid NOT NULL,
    reported_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_report_key_private CHECK ((report_key !~* '^(https?:)?//'::text)),
    CONSTRAINT tbl_pathology_reports_doc_kind_check CHECK ((doc_kind = ANY (ARRAY['ORDER_FORM'::text, 'PATHOLOGY_REPORT'::text, 'IMAGING_REPORT'::text, 'OTHER'::text]))),
    CONSTRAINT tbl_pathology_reports_is_simulated_check CHECK (is_simulated),
    CONSTRAINT tbl_pathology_reports_mime_type_check CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text])))
);


--
-- Name: tbl_pathology_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_pathology_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    diagnosis_text text NOT NULL,
    diagnosis_category public.diagnosis_category NOT NULL,
    next_action text,
    supersedes_id uuid,
    signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_patient_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_patient_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consent_seq bigint NOT NULL,
    patient_id uuid NOT NULL,
    purpose_id bigint NOT NULL,
    language_id bigint NOT NULL,
    consent_version text NOT NULL,
    method public.consent_method DEFAULT 'CHECKBOX'::public.consent_method NOT NULL,
    granted boolean NOT NULL,
    captured_by uuid NOT NULL,
    witness_name text,
    device_id text,
    notes text,
    captured_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_patient_consents_consent_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tbl_patient_consents ALTER COLUMN consent_seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tbl_patient_consents_consent_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tbl_patient_contact_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_patient_contact_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    task_id uuid,
    contacted_by uuid NOT NULL,
    channel public.contact_channel NOT NULL,
    outcome public.contact_outcome NOT NULL,
    notes text,
    contacted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_patient_duplicate_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_patient_duplicate_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    match_reason text,
    status public.duplicate_status DEFAULT 'OPEN'::public.duplicate_status NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_dup_distinct CHECK ((patient_id <> candidate_id))
);


--
-- Name: tbl_patient_medical_histories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_patient_medical_histories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    history_kind public.history_type DEFAULT 'EXPOSURE'::public.history_type NOT NULL,
    exposure_type_id bigint,
    condition_text text,
    duration_years numeric(4,1),
    frequency_per_day smallint,
    is_current boolean,
    event_date date,
    recorded_by uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_history_has_content CHECK (((exposure_type_id IS NOT NULL) OR (condition_text IS NOT NULL))),
    CONSTRAINT tbl_patient_medical_histories_duration_years_check CHECK ((duration_years >= (0)::numeric)),
    CONSTRAINT tbl_patient_medical_histories_frequency_per_day_check CHECK ((frequency_per_day >= 0))
);


--
-- Name: tbl_patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_patients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_code text DEFAULT ((('AD-'::text || to_char(now(), 'YYYY'::text)) || '-'::text) || lpad((nextval('public.seq_patient_code'::regclass))::text, 6, '0'::text)) NOT NULL,
    full_name text NOT NULL,
    sex public.sex_type DEFAULT 'UNDISCLOSED'::public.sex_type NOT NULL,
    date_of_birth date,
    age_years smallint,
    village_id bigint,
    habitation text,
    address_line text,
    contact_phone text,
    preferred_language_id bigint,
    phc_id bigint,
    registered_facility_id bigint NOT NULL,
    registered_by uuid NOT NULL,
    duplicate_hint text,
    idempotency_key text,
    client_created_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    is_synthetic boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    mandal_id bigint,
    CONSTRAINT ck_patient_age_known CHECK (((date_of_birth IS NOT NULL) OR (age_years IS NOT NULL))),
    CONSTRAINT tbl_patients_age_years_check CHECK (((age_years >= 0) AND (age_years <= 120))),
    CONSTRAINT tbl_patients_is_synthetic_check CHECK (is_synthetic)
);


--
-- Name: tbl_referral_slips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_referral_slips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_id uuid NOT NULL,
    language_id bigint NOT NULL,
    file_key text NOT NULL,
    checksum_sha256 character(64) NOT NULL,
    generated_by uuid NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    print_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT ck_slip_key_private CHECK ((file_key !~* '^(https?:)?//'::text)),
    CONSTRAINT tbl_referral_slips_print_count_check CHECK ((print_count >= 0))
);


--
-- Name: tbl_referral_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_referral_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_id uuid NOT NULL,
    from_status public.referral_status,
    to_status public.referral_status NOT NULL,
    changed_by uuid NOT NULL,
    reason text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_code text DEFAULT ((('REF-'::text || to_char(now(), 'YYYY'::text)) || '-'::text) || lpad((nextval('public.seq_referral_code'::regclass))::text, 6, '0'::text)) NOT NULL,
    review_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    from_facility_id bigint NOT NULL,
    to_hospital_id bigint NOT NULL,
    specialty_id bigint NOT NULL,
    priority_id bigint NOT NULL,
    mode public.referral_mode DEFAULT 'HOSPITAL_VISIT'::public.referral_mode NOT NULL,
    status public.referral_status DEFAULT 'PLANNED'::public.referral_status NOT NULL,
    reason text NOT NULL,
    assigned_specialist_id uuid,
    assigned_navigator_id uuid,
    assessment_completed_at timestamp with time zone,
    assessment_completed_by uuid,
    cancel_reason text,
    created_by uuid NOT NULL,
    idempotency_key text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_ref_cancel CHECK (((status <> 'CANCELLED'::public.referral_status) OR (cancel_reason IS NOT NULL))),
    CONSTRAINT ck_ref_complete CHECK (((status = 'COMPLETED'::public.referral_status) = (assessment_completed_at IS NOT NULL)))
);


--
-- Name: tbl_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id bigint NOT NULL,
    permission_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_screening_findings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_screening_findings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    screening_id uuid NOT NULL,
    finding_kind public.finding_type NOT NULL,
    symptom_id bigint,
    oral_site public.oral_view,
    description text,
    duration_days integer,
    recorded_by uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_finding_content CHECK (((symptom_id IS NOT NULL) OR (description IS NOT NULL))),
    CONSTRAINT tbl_screening_findings_duration_days_check CHECK ((duration_days >= 0))
);


--
-- Name: tbl_screening_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_screening_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    screening_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    view_type public.oral_view NOT NULL,
    annotation_site text,
    private_key text NOT NULL,
    checksum_sha256 character(64) NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    width_px integer,
    height_px integer,
    metadata_stripped boolean DEFAULT true NOT NULL,
    status public.photo_status DEFAULT 'UPLOADED'::public.photo_status NOT NULL,
    supersedes_photo_id uuid,
    captured_by uuid NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_photo_key_private CHECK ((private_key !~* '^(https?:)?//'::text)),
    CONSTRAINT tbl_screening_photos_height_px_check CHECK ((height_px > 0)),
    CONSTRAINT tbl_screening_photos_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
    CONSTRAINT tbl_screening_photos_size_bytes_check CHECK (((size_bytes > 0) AND (size_bytes <= 10485760))),
    CONSTRAINT tbl_screening_photos_width_px_check CHECK ((width_px > 0))
);


--
-- Name: tbl_screenings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_screenings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    examiner_id uuid NOT NULL,
    facility_id bigint NOT NULL,
    screening_site_id bigint,
    screening_date date DEFAULT CURRENT_DATE NOT NULL,
    case_state public.case_state DEFAULT 'DRAFT'::public.case_state NOT NULL,
    consent_id uuid,
    tobacco_current boolean,
    chief_complaint text,
    clinical_exam_done boolean DEFAULT false NOT NULL,
    notes text,
    version integer DEFAULT 1 NOT NULL,
    idempotency_key text,
    client_created_at timestamp with time zone,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_consent_gate CHECK (((case_state = 'DRAFT'::public.case_state) OR (consent_id IS NOT NULL)))
);


--
-- Name: tbl_specialist_availability_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_specialist_availability_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    hospital_id bigint NOT NULL,
    specialty_id bigint NOT NULL,
    requested_by uuid NOT NULL,
    requested_start timestamp with time zone NOT NULL,
    requested_end timestamp with time zone NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    responded_by uuid,
    responded_at timestamp with time zone,
    response_reason text,
    proposed_start timestamp with time zone,
    proposed_end timestamp with time zone,
    slot_id uuid,
    video_consultation_id uuid,
    confirmed_by uuid,
    confirmed_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    rescheduled_from_id uuid,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_specialist_availability_proposed_range CHECK ((((proposed_start IS NULL) AND (proposed_end IS NULL)) OR ((proposed_start IS NOT NULL) AND (proposed_end > proposed_start)))),
    CONSTRAINT ck_specialist_availability_request_range CHECK ((requested_end > requested_start)),
    CONSTRAINT ck_specialist_availability_request_state CHECK ((((status = 'STAFF_REVIEW'::text) AND (responded_by IS NULL) AND (responded_at IS NULL) AND (response_reason IS NULL) AND (proposed_start IS NULL) AND (proposed_end IS NULL) AND (slot_id IS NULL) AND (video_consultation_id IS NULL) AND (confirmed_by IS NULL) AND (confirmed_at IS NULL) AND (cancelled_by IS NULL) AND (cancelled_at IS NULL)) OR ((status = 'PENDING'::text) AND (responded_by IS NULL) AND (responded_at IS NULL) AND (response_reason IS NULL) AND (proposed_start IS NULL) AND (proposed_end IS NULL) AND (slot_id IS NULL) AND (video_consultation_id IS NULL) AND (confirmed_by IS NULL) AND (confirmed_at IS NULL) AND (cancelled_by IS NULL) AND (cancelled_at IS NULL)) OR ((status = ANY (ARRAY['ACCEPTED'::text, 'SUGGESTED'::text])) AND (responded_by IS NOT NULL) AND (responded_at IS NOT NULL) AND (proposed_start IS NOT NULL) AND (proposed_end IS NOT NULL) AND (video_consultation_id IS NULL) AND (confirmed_by IS NULL) AND (confirmed_at IS NULL) AND (cancelled_by IS NULL) AND (cancelled_at IS NULL)) OR ((status = 'DECLINED'::text) AND (responded_by IS NOT NULL) AND (responded_at IS NOT NULL) AND (response_reason IS NOT NULL) AND (length(TRIM(BOTH FROM response_reason)) > 0) AND (proposed_start IS NULL) AND (proposed_end IS NULL) AND (video_consultation_id IS NULL) AND (confirmed_by IS NULL) AND (confirmed_at IS NULL) AND (cancelled_by IS NULL) AND (cancelled_at IS NULL)) OR ((status = 'CONFIRMED'::text) AND (proposed_start IS NOT NULL) AND (proposed_end IS NOT NULL) AND (slot_id IS NOT NULL) AND (video_consultation_id IS NOT NULL) AND (confirmed_by IS NOT NULL) AND (confirmed_at IS NOT NULL) AND (cancelled_by IS NULL) AND (cancelled_at IS NULL) AND (((responded_by IS NOT NULL) AND (responded_at IS NOT NULL)) OR ((responded_by IS NULL) AND (responded_at IS NULL)))) OR ((status = ANY (ARRAY['CANCELLED'::text, 'HOSPITAL_DECLINED'::text])) AND (cancelled_by IS NOT NULL) AND (cancelled_at IS NOT NULL) AND (cancellation_reason IS NOT NULL) AND (length(TRIM(BOTH FROM cancellation_reason)) > 0) AND (video_consultation_id IS NULL) AND (confirmed_by IS NULL) AND (confirmed_at IS NULL)))),
    CONSTRAINT tbl_specialist_availability_requests_status_check CHECK ((status = ANY (ARRAY['STAFF_REVIEW'::text, 'PENDING'::text, 'ACCEPTED'::text, 'SUGGESTED'::text, 'DECLINED'::text, 'CONFIRMED'::text, 'CANCELLED'::text, 'HOSPITAL_DECLINED'::text])))
);


--
-- Name: tbl_specialist_consultation_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_specialist_consultation_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    decision_type text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    clinical_reason text NOT NULL,
    clinical_recommendation text,
    instructions text,
    additional_notes text,
    priority_id bigint,
    follow_up_date date,
    hospital_id bigint,
    investigation_type_id bigint,
    consultation_id uuid,
    investigation_order_id uuid,
    signed_by uuid,
    signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_specialist_decision_investigation_type CHECK (((decision_type <> 'ADDITIONAL_INVESTIGATIONS'::text) OR (investigation_type_id IS NOT NULL))),
    CONSTRAINT ck_specialist_decision_self_signoff CHECK (((signed_by IS NULL) OR (signed_by = specialist_id))),
    CONSTRAINT ck_specialist_decision_signoff CHECK ((((status = 'DRAFT'::text) AND (signed_by IS NULL) AND (signed_at IS NULL)) OR ((status = 'SIGNED'::text) AND (signed_by IS NOT NULL) AND (signed_at IS NOT NULL)))),
    CONSTRAINT tbl_specialist_consultation_decisions_decision_type_check CHECK ((decision_type = ANY (ARRAY['VIDEO_CONSULTATION'::text, 'DIRECT_HOSPITAL_VISIT'::text, 'ADDITIONAL_INVESTIGATIONS'::text, 'CLINICAL_FOLLOW_UP'::text, 'EMERGENCY_HOSPITAL_REFERRAL'::text]))),
    CONSTRAINT tbl_specialist_consultation_decisions_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SIGNED'::text])))
);


--
-- Name: tbl_sync_conflicts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sync_conflicts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    queue_id uuid,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    local_version integer,
    server_version integer,
    local_payload jsonb,
    server_payload jsonb,
    resolution public.conflict_resolution DEFAULT 'OPEN'::public.conflict_resolution NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tbl_system_error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_system_error_logs (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    service text NOT NULL,
    severity public.error_severity DEFAULT 'ERROR'::public.error_severity NOT NULL,
    error_code text,
    message text NOT NULL,
    request_id text,
    user_id uuid,
    context jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: tbl_system_error_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tbl_system_error_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tbl_system_error_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tbl_transport_support_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_transport_support_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid,
    referral_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    from_village_id bigint,
    to_hospital_id bigint,
    travel_date date,
    mode text,
    status public.transport_status DEFAULT 'REQUESTED'::public.transport_status NOT NULL,
    amount_inr numeric(10,2),
    arranged_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tbl_transport_support_records_amount_inr_check CHECK ((amount_inr >= (0)::numeric))
);


--
-- Name: tbl_treatment_linkages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_treatment_linkages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    pathology_review_id uuid,
    hospital_id bigint,
    linkage_type text NOT NULL,
    status public.linkage_status DEFAULT 'PLANNED'::public.linkage_status NOT NULL,
    planned_date date,
    started_on date,
    linked_by uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_linkage_started CHECK (((status <> ALL (ARRAY['STARTED'::public.linkage_status, 'COMPLETED'::public.linkage_status])) OR (started_on IS NOT NULL))),
    CONSTRAINT tbl_treatment_linkages_linkage_type_check CHECK ((linkage_type = ANY (ARRAY['SURGERY'::text, 'RADIOTHERAPY'::text, 'CHEMOTHERAPY'::text, 'PALLIATIVE'::text, 'OBSERVATION'::text, 'OTHER'::text])))
);


--
-- Name: tbl_user_facility_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_user_facility_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    facility_id bigint NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_assignment_dates CHECK (((valid_to IS NULL) OR (valid_to >= valid_from)))
);


--
-- Name: tbl_user_language_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_user_language_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    language_id bigint NOT NULL,
    font_scale numeric(3,2) DEFAULT 1.00 NOT NULL,
    voice_guidance boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tbl_user_language_preferences_font_scale_check CHECK (((font_scale >= 0.75) AND (font_scale <= 2.00)))
);


--
-- Name: tbl_user_registration_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_user_registration_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    username text NOT NULL,
    phone text NOT NULL,
    email text,
    designation text NOT NULL,
    employee_ref text,
    facility_id bigint NOT NULL,
    mandal_id bigint NOT NULL,
    village_id bigint NOT NULL,
    language_id bigint NOT NULL,
    password_hash text NOT NULL,
    requested_role text DEFAULT 'HEALTH_WORKER'::text NOT NULL,
    terms_accepted_at timestamp with time zone NOT NULL,
    status public.registration_status DEFAULT 'PENDING'::public.registration_status NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    created_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workflow_version smallint DEFAULT 1,
    mo_recommended_by uuid,
    mo_recommended_at timestamp with time zone,
    mo_recommendation text,
    mo_recommendation_note text,
    status_token_hash character(64),
    status_token_expires_at timestamp with time zone,
    CONSTRAINT ck_reg_approved CHECK (((status <> 'APPROVED'::public.registration_status) OR ((created_user_id IS NOT NULL) AND (reviewed_by IS NOT NULL)))),
    CONSTRAINT ck_reg_rejected CHECK (((status <> 'REJECTED'::public.registration_status) OR (rejection_reason IS NOT NULL))),
    CONSTRAINT ck_reg_reviewed CHECK (((status = 'PENDING'::public.registration_status) OR ((reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL)))),
    CONSTRAINT tbl_user_registration_requests_designation_check CHECK ((designation = ANY (ARRAY['ASHA'::text, 'ANM'::text, 'CHO'::text, 'OTHER'::text]))),
    CONSTRAINT tbl_user_registration_requests_requested_role_check CHECK ((requested_role = 'HEALTH_WORKER'::text))
);


--
-- Name: tbl_user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    refresh_token_hash text NOT NULL,
    device_id text,
    ip_address inet,
    user_agent text,
    mfa_verified boolean DEFAULT false NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoke_reason text,
    previous_refresh_token_hash text,
    CONSTRAINT ck_session_expiry CHECK ((expires_at > issued_at))
);


--
-- Name: tbl_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    auth_id text,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    phone text,
    email text,
    designation text,
    employee_ref text,
    role_id bigint NOT NULL,
    status public.user_status DEFAULT 'ACTIVE'::public.user_status NOT NULL,
    mfa_enabled boolean DEFAULT false NOT NULL,
    mfa_secret_encrypted text,
    must_change_password boolean DEFAULT false NOT NULL,
    failed_login_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    password_changed_at timestamp with time zone,
    is_synthetic boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    mfa_last_used_step bigint,
    mfa_enrolled_at timestamp with time zone,
    district_id bigint,
    CONSTRAINT tbl_users_designation_check CHECK ((designation = ANY (ARRAY['ASHA'::text, 'ANM'::text, 'CHO'::text, 'OTHER'::text])))
);


--
-- Name: tbl_video_consultations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_video_consultations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    slot_id uuid NOT NULL,
    specialist_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    status_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    rescheduled_from_id uuid,
    cancel_reason text,
    provider text,
    room_ref text,
    meeting_expires_at timestamp with time zone,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    recording_enabled boolean DEFAULT false NOT NULL,
    attendance public.attendance_status DEFAULT 'PENDING'::public.attendance_status NOT NULL,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_call_times CHECK (((ended_at IS NULL) OR (started_at IS NULL) OR (ended_at >= started_at))),
    CONSTRAINT ck_room_not_public_link CHECK (((room_ref IS NULL) OR (room_ref !~* '^(https?:)?//'::text))),
    CONSTRAINT tbl_video_consultations_recording_enabled_check CHECK ((recording_enabled = false))
);


--
-- Name: tbl_video_join_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_video_join_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consultation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    first_used_at timestamp with time zone,
    left_at timestamp with time zone,
    revoked_at timestamp with time zone,
    ip_address inet,
    CONSTRAINT ck_token_lifetime CHECK (((expires_at > issued_at) AND (expires_at <= (issued_at + '02:00:00'::interval))))
);


--
-- Name: vw_case_current_classification; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_case_current_classification AS
 SELECT DISTINCT ON (screening_id) screening_id,
    patient_id,
    level,
    set_by,
    set_at
   FROM public.tbl_case_classifications
  ORDER BY screening_id, seq DESC;


--
-- Name: vw_case_facts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_case_facts AS
 SELECT s.id AS screening_id,
    s.patient_id,
    s.screening_date,
    (date_trunc('month'::text, (s.screening_date)::timestamp with time zone))::date AS month_start,
    f.district_id,
    COALESCE(m.id, ph.mandal_id) AS mandal_id,
    p.phc_id,
    p.village_id,
    s.case_state,
    (s.case_state <> ALL (ARRAY['DRAFT'::public.case_state, 'CONSENTED'::public.case_state])) AS is_screened,
    COALESCE((cr.signed_at IS NOT NULL), false) AS is_reviewed,
        CASE
            WHEN (cr.signed_at IS NOT NULL) THEN (EXTRACT(epoch FROM (cr.signed_at - s.created_at)) / 3600.0)
            ELSE NULL::numeric
        END AS review_hours,
    (EXISTS ( SELECT 1
           FROM public.tbl_ai_assessments a
          WHERE ((a.screening_id = s.id) AND (a.status = 'COMPLETED'::public.ai_status) AND (a.result_label = 'SUSPICIOUS_FOR_CLINICAL_REVIEW'::public.ai_result_label)))) AS ai_flagged,
    (COALESCE((cr.decision = ANY (ARRAY['SPECIALIST_REVIEW'::public.review_decision, 'URGENT_REFERRAL'::public.review_decision])), false) OR COALESCE((cl.level = ANY (ARRAY['SCREEN_POSITIVE'::public.classification_level, 'CLINICAL_SUSPICION'::public.classification_level, 'PRECANCER_CLINICIAN_CONFIRMED'::public.classification_level, 'MALIGNANCY_PATHOLOGY_CONFIRMED'::public.classification_level])), false)) AS suspicious_finding,
    (r.id IS NOT NULL) AS is_referred,
    COALESCE((r.assessment_completed_at IS NOT NULL), false) AS assessment_completed,
    (EXISTS ( SELECT 1
           FROM (public.tbl_hospital_appointments a
             JOIN public.mst_appointment_statuses st ON ((st.id = a.status_id)))
          WHERE ((a.referral_id = r.id) AND (st.code = 'COMPLETED'::text)))) AS appointment_completed,
    ((EXISTS ( SELECT 1
           FROM (public.tbl_hospital_appointments a
             JOIN public.mst_appointment_statuses st ON ((st.id = a.status_id)))
          WHERE ((a.referral_id = r.id) AND (a.scheduled_at < now()) AND (NOT st.is_terminal)))) OR (EXISTS ( SELECT 1
           FROM (public.tbl_followup_tasks t
             JOIN public.mst_followup_statuses fs ON ((fs.id = t.status_id)))
          WHERE ((t.referral_id = r.id) AND (t.due_at < now()) AND (t.closed_at IS NULL) AND (NOT fs.is_terminal))))) AS is_overdue,
    (EXISTS ( SELECT 1
           FROM (public.tbl_investigation_orders o
             JOIN public.mst_investigation_types it ON ((it.id = o.investigation_type_id)))
          WHERE ((o.referral_id = r.id) AND (it.code = ANY (ARRAY['BIOPSY'::text, 'HISTOPATHOLOGY'::text]))))) AS biopsy_ordered,
    (EXISTS ( SELECT 1
           FROM ((public.tbl_investigation_orders o
             JOIN public.mst_investigation_types it ON ((it.id = o.investigation_type_id)))
             JOIN public.mst_investigation_statuses ist ON ((ist.id = o.status_id)))
          WHERE ((o.referral_id = r.id) AND (it.code = ANY (ARRAY['BIOPSY'::text, 'HISTOPATHOLOGY'::text])) AND (NOT ist.is_terminal)))) AS biopsy_pending,
    (EXISTS ( SELECT 1
           FROM ((public.tbl_investigation_orders o
             JOIN public.mst_investigation_types it ON ((it.id = o.investigation_type_id)))
             JOIN public.tbl_pathology_reports rep ON ((rep.order_id = o.id)))
          WHERE ((o.referral_id = r.id) AND (it.code = ANY (ARRAY['BIOPSY'::text, 'HISTOPATHOLOGY'::text]))))) AS pathology_received,
    (EXISTS ( SELECT 1
           FROM ((public.tbl_pathology_reviews pr
             JOIN public.tbl_pathology_reports rep ON ((rep.id = pr.report_id)))
             JOIN public.tbl_investigation_orders o ON ((o.id = rep.order_id)))
          WHERE ((o.referral_id = r.id) AND (pr.signed_at IS NOT NULL)))) AS pathology_reviewed,
    COALESCE((cl.level = 'PRECANCER_CLINICIAN_CONFIRMED'::public.classification_level), false) AS precancer_confirmed,
    COALESCE((cl.level = 'MALIGNANCY_PATHOLOGY_CONFIRMED'::public.classification_level), false) AS cancer_confirmed,
    (EXISTS ( SELECT 1
           FROM public.tbl_treatment_linkages tl
          WHERE ((tl.referral_id = r.id) AND (tl.status = ANY (ARRAY['CONFIRMED'::public.linkage_status, 'STARTED'::public.linkage_status, 'COMPLETED'::public.linkage_status]))))) AS treatment_linked,
    (EXISTS ( SELECT 1
           FROM public.tbl_treatment_linkages tl
          WHERE ((tl.referral_id = r.id) AND (tl.status = ANY (ARRAY['STARTED'::public.linkage_status, 'COMPLETED'::public.linkage_status]))))) AS treatment_started,
    ((s.case_state = 'LOST_CONTACT'::public.case_state) OR (EXISTS ( SELECT 1
           FROM public.tbl_treatment_linkages tl
          WHERE ((tl.referral_id = r.id) AND (tl.status = 'LOST'::public.linkage_status)))) OR (EXISTS ( SELECT 1
           FROM public.tbl_followup_tasks t
          WHERE ((t.referral_id = r.id) AND (t.task_type = 'LOST_CONTACT'::public.followup_task_type))))) AS lost_to_followup,
    ( SELECT (EXTRACT(epoch FROM (min(pr.signed_at) - s.created_at)) / 3600.0)
           FROM ((public.tbl_pathology_reviews pr
             JOIN public.tbl_pathology_reports rep ON ((rep.id = pr.report_id)))
             JOIN public.tbl_investigation_orders o ON ((o.id = rep.order_id)))
          WHERE ((o.referral_id = r.id) AND (pr.signed_at IS NOT NULL))) AS diagnosis_hours
   FROM (((((((((public.tbl_screenings s
     JOIN public.tbl_patients p ON ((p.id = s.patient_id)))
     JOIN public.mst_facilities f ON ((f.id = s.facility_id)))
     LEFT JOIN public.mst_villages v ON ((v.id = p.village_id)))
     LEFT JOIN public.mst_gram_panchayats gp ON ((gp.id = v.gram_panchayat_id)))
     LEFT JOIN public.mst_mandals m ON ((m.id = v.mandal_id)))
     LEFT JOIN public.mst_phcs ph ON ((ph.id = p.phc_id)))
     LEFT JOIN public.tbl_clinical_reviews cr ON ((cr.screening_id = s.id)))
     LEFT JOIN public.vw_case_current_classification cl ON ((cl.screening_id = s.id)))
     LEFT JOIN LATERAL ( SELECT r2.id,
            r2.referral_code,
            r2.review_id,
            r2.patient_id,
            r2.from_facility_id,
            r2.to_hospital_id,
            r2.specialty_id,
            r2.priority_id,
            r2.mode,
            r2.status,
            r2.reason,
            r2.assigned_specialist_id,
            r2.assigned_navigator_id,
            r2.assessment_completed_at,
            r2.assessment_completed_by,
            r2.cancel_reason,
            r2.created_by,
            r2.idempotency_key,
            r2.version,
            r2.created_at,
            r2.updated_at
           FROM public.tbl_referrals r2
          WHERE ((r2.review_id = cr.id) AND (r2.status <> 'CANCELLED'::public.referral_status))
          ORDER BY r2.created_at DESC
         LIMIT 1) r ON (true));


--
-- Name: vw_district_dashboard_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_district_dashboard_summary AS
 SELECT district_id,
    mandal_id,
    phc_id,
    village_id,
    month_start,
    count(*) FILTER (WHERE is_screened) AS screenings_total,
    count(*) FILTER (WHERE is_reviewed) AS doctor_reviews,
    count(*) FILTER (WHERE ai_flagged) AS ai_flagged_for_review,
    count(*) FILTER (WHERE suspicious_finding) AS suspicious_findings,
    count(*) FILTER (WHERE is_referred) AS specialist_referrals,
    count(*) FILTER (WHERE appointment_completed) AS appointments_completed,
    count(*) FILTER (WHERE assessment_completed) AS specialist_assessments_completed,
    count(*) FILTER (WHERE is_overdue) AS overdue_cases,
    count(*) FILTER (WHERE biopsy_ordered) AS biopsies_ordered,
    count(*) FILTER (WHERE biopsy_pending) AS biopsies_pending,
    count(*) FILTER (WHERE pathology_reviewed) AS pathology_completed,
    count(*) FILTER (WHERE precancer_confirmed) AS precancers_clinician_confirmed,
    count(*) FILTER (WHERE cancer_confirmed) AS cancers_pathology_confirmed,
    count(*) FILTER (WHERE treatment_linked) AS treatment_linked,
    count(*) FILTER (WHERE treatment_started) AS treatment_started,
    count(*) FILTER (WHERE lost_to_followup) AS lost_to_followup,
    round(avg(review_hours), 1) AS avg_hours_to_review,
    round(avg(diagnosis_hours), 1) AS avg_hours_to_diagnosis
   FROM public.vw_case_facts
  GROUP BY district_id, mandal_id, phc_id, village_id, month_start;


--
-- Name: vw_overdue_followups; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_overdue_followups AS
 SELECT t.id AS task_id,
    t.patient_id,
    t.referral_id,
    t.owner_id,
    t.task_type,
    t.due_at,
    t.priority
   FROM (public.tbl_followup_tasks t
     JOIN public.mst_followup_statuses fs ON ((fs.id = t.status_id)))
  WHERE ((t.closed_at IS NULL) AND (NOT fs.is_terminal) AND (t.due_at < now()));


--
-- Name: vw_patient_current_consents; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_patient_current_consents AS
 SELECT DISTINCT ON (pc.patient_id, pc.purpose_id) pc.patient_id,
    cp.code AS purpose_code,
    pc.granted,
    pc.consent_version,
    pc.captured_at,
    pc.id AS consent_id
   FROM (public.tbl_patient_consents pc
     JOIN public.mst_consent_purposes cp ON ((cp.id = pc.purpose_id)))
  ORDER BY pc.patient_id, pc.purpose_id, pc.consent_seq DESC;


--
-- Name: vw_patient_timeline; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_patient_timeline AS
 SELECT p.id AS patient_id,
    p.created_at AS event_time,
    'REGISTRATION'::text AS event_type,
    'patient'::text AS resource_type,
    p.id AS resource_id,
    p.registered_by AS actor_id,
    NULL::text AS detail_code
   FROM public.tbl_patients p
UNION ALL
 SELECT c.patient_id,
    c.captured_at AS event_time,
        CASE
            WHEN c.granted THEN 'CONSENT_GRANTED'::text
            ELSE 'CONSENT_WITHDRAWN'::text
        END AS event_type,
    'consent'::text AS resource_type,
    c.id AS resource_id,
    c.captured_by AS actor_id,
    cp.code AS detail_code
   FROM (public.tbl_patient_consents c
     JOIN public.mst_consent_purposes cp ON ((cp.id = c.purpose_id)))
UNION ALL
 SELECT s.patient_id,
    s.created_at AS event_time,
    'SCREENING'::text AS event_type,
    'screening'::text AS resource_type,
    s.id AS resource_id,
    s.examiner_id AS actor_id,
    (s.case_state)::text AS detail_code
   FROM public.tbl_screenings s
UNION ALL
 SELECT ph.patient_id,
    ph.captured_at AS event_time,
    'IMAGE_CAPTURED'::text AS event_type,
    'photo'::text AS resource_type,
    ph.id AS resource_id,
    ph.captured_by AS actor_id,
    (ph.view_type)::text AS detail_code
   FROM public.tbl_screening_photos ph
UNION ALL
 SELECT s.patient_id,
    a.requested_at AS event_time,
    'AI_ASSESSMENT'::text AS event_type,
    'ai_assessment'::text AS resource_type,
    a.id AS resource_id,
    a.requested_by AS actor_id,
    (a.status)::text AS detail_code
   FROM (public.tbl_ai_assessments a
     JOIN public.tbl_screenings s ON ((s.id = a.screening_id)))
UNION ALL
 SELECT cr.patient_id,
    COALESCE(cr.signed_at, cr.created_at) AS event_time,
        CASE
            WHEN (cr.signed_at IS NULL) THEN 'CLINICAL_REVIEW_DRAFT'::text
            ELSE 'CLINICAL_REVIEW_SIGNED'::text
        END AS event_type,
    'clinical_review'::text AS resource_type,
    cr.id AS resource_id,
    cr.doctor_id AS actor_id,
    (cr.decision)::text AS detail_code
   FROM public.tbl_clinical_reviews cr
UNION ALL
 SELECT r.patient_id,
    r.created_at AS event_time,
    'REFERRAL'::text AS event_type,
    'referral'::text AS resource_type,
    r.id AS resource_id,
    r.created_by AS actor_id,
    (r.status)::text AS detail_code
   FROM public.tbl_referrals r
UNION ALL
 SELECT v.patient_id,
    v.created_at AS event_time,
    'VIDEO_CONSULTATION'::text AS event_type,
    'video_consultation'::text AS resource_type,
    v.id AS resource_id,
    v.requested_by AS actor_id,
    (v.attendance)::text AS detail_code
   FROM public.tbl_video_consultations v
UNION ALL
 SELECT a.patient_id,
    a.scheduled_at AS event_time,
    'HOSPITAL_APPOINTMENT'::text AS event_type,
    'hospital_appointment'::text AS resource_type,
    a.id AS resource_id,
    a.booked_by AS actor_id,
    (a.attendance)::text AS detail_code
   FROM public.tbl_hospital_appointments a
UNION ALL
 SELECT o.patient_id,
    o.ordered_at AS event_time,
    'INVESTIGATION_ORDERED'::text AS event_type,
    'investigation_order'::text AS resource_type,
    o.id AS resource_id,
    o.ordered_by AS actor_id,
    NULL::text AS detail_code
   FROM public.tbl_investigation_orders o
UNION ALL
 SELECT rp.patient_id,
    rp.created_at AS event_time,
    'REPORT_UPLOADED'::text AS event_type,
    'pathology_report'::text AS resource_type,
    rp.id AS resource_id,
    rp.uploaded_by AS actor_id,
    rp.doc_kind AS detail_code
   FROM public.tbl_pathology_reports rp
UNION ALL
 SELECT pr.patient_id,
    COALESCE(pr.signed_at, pr.created_at) AS event_time,
    'PATHOLOGY_REVIEWED'::text AS event_type,
    'pathology_review'::text AS resource_type,
    pr.id AS resource_id,
    pr.reviewer_id AS actor_id,
    (pr.diagnosis_category)::text AS detail_code
   FROM public.tbl_pathology_reviews pr
UNION ALL
 SELECT cc.patient_id,
    cc.set_at AS event_time,
    'CLASSIFICATION'::text AS event_type,
    'classification'::text AS resource_type,
    cc.id AS resource_id,
    cc.set_by AS actor_id,
    (cc.level)::text AS detail_code
   FROM public.tbl_case_classifications cc
UNION ALL
 SELECT tl.patient_id,
    tl.created_at AS event_time,
    'TREATMENT_LINKAGE'::text AS event_type,
    'treatment_linkage'::text AS resource_type,
    tl.id AS resource_id,
    tl.linked_by AS actor_id,
    (tl.status)::text AS detail_code
   FROM public.tbl_treatment_linkages tl
UNION ALL
 SELECT t.patient_id,
    t.created_at AS event_time,
    'FOLLOWUP_TASK'::text AS event_type,
    'followup_task'::text AS resource_type,
    t.id AS resource_id,
    t.owner_id AS actor_id,
    (t.task_type)::text AS detail_code
   FROM public.tbl_followup_tasks t
UNION ALL
 SELECT h.patient_id,
    h.contacted_at AS event_time,
    'CONTACT_ATTEMPT'::text AS event_type,
    'contact'::text AS resource_type,
    h.id AS resource_id,
    h.contacted_by AS actor_id,
    (h.outcome)::text AS detail_code
   FROM public.tbl_patient_contact_history h
UNION ALL
 SELECT cp.patient_id,
    cp.created_at AS event_time,
    'CARE_PLAN'::text AS event_type,
    'care_plan'::text AS resource_type,
    cp.id AS resource_id,
    cp.created_by AS actor_id,
    (cp.status)::text AS detail_code
   FROM public.tbl_care_plans cp
UNION ALL
 SELECT cfs.patient_id,
    cfs.created_at AS event_time,
    'CARE_FOLLOWUP_SCHEDULED'::text AS event_type,
    'care_followup_schedule'::text AS resource_type,
    cfs.id AS resource_id,
    cfs.created_by AS actor_id,
    (cfs.status)::text AS detail_code
   FROM public.tbl_care_followup_schedules cfs
UNION ALL
 SELECT cfr.patient_id,
    cfr.submitted_at AS event_time,
    'CARE_FOLLOWUP_REPORTED'::text AS event_type,
    'care_followup_report'::text AS resource_type,
    cfr.id AS resource_id,
    cfr.reported_by AS actor_id,
        CASE
            WHEN (cfr.hospital_attended IS FALSE) THEN 'REVISIT_MISSED'::text
            WHEN (cfr.hospital_attended IS TRUE) THEN 'REVISIT_ATTENDED'::text
            WHEN cfr.discomfort_present THEN 'DISCOMFORT'::text
            ELSE 'REPORTED'::text
        END AS detail_code
   FROM public.tbl_care_followup_reports cfr
UNION ALL
 SELECT cdr.patient_id,
    cdr.created_at AS event_time,
    'CARE_ESCALATION'::text AS event_type,
    'care_discomfort_report'::text AS resource_type,
    cdr.id AS resource_id,
    cdr.reported_by AS actor_id,
    (cdr.status)::text AS detail_code
   FROM public.tbl_care_discomfort_reports cdr
UNION ALL
 SELECT fr.patient_id,
    fr.signed_at AS event_time,
    'CARE_FINAL_REVIEW'::text AS event_type,
    'care_final_review'::text AS resource_type,
    fr.id AS resource_id,
    fr.medical_officer_id AS actor_id,
    (fr.decision)::text AS detail_code
   FROM public.tbl_care_final_reviews fr
UNION ALL
 SELECT plan.patient_id,
    history.changed_at AS event_time,
    'CARE_STATUS_CHANGE'::text AS event_type,
    'care_plan_status_history'::text AS resource_type,
    history.id AS resource_id,
    history.changed_by AS actor_id,
    (((history.from_status)::text || '->'::text) || (history.to_status)::text) AS detail_code
   FROM (public.tbl_care_plan_status_history history
     JOIN public.tbl_care_plans plan ON ((plan.id = history.plan_id)))
UNION ALL
 SELECT plan.patient_id,
    med.created_at AS event_time,
    'CARE_MEDICINE'::text AS event_type,
    'care_medicine'::text AS resource_type,
    med.id AS resource_id,
    med.created_by AS actor_id,
    med.medicine_name AS detail_code
   FROM (public.tbl_care_medicines med
     JOIN public.tbl_care_plans plan ON ((plan.id = med.plan_id)))
  WHERE (med.is_active IS TRUE)
UNION ALL
 SELECT d.patient_id,
    d.created_at AS event_time,
    'DIAGNOSTIC_ORDER'::text AS event_type,
    'diagnostic_order'::text AS resource_type,
    d.id AS resource_id,
    d.prescribed_by AS actor_id,
    st.code AS detail_code
   FROM (public.tbl_diagnostic_orders d
     JOIN public.mst_investigation_statuses st ON ((st.id = d.status_id)))
UNION ALL
 SELECT da.patient_id,
    da.created_at AS event_time,
    'DIAGNOSTIC_APPOINTMENT'::text AS event_type,
    'diagnostic_appointment'::text AS resource_type,
    da.id AS resource_id,
    da.booked_by AS actor_id,
    ast.code AS detail_code
   FROM (public.tbl_diagnostic_appointments da
     JOIN public.mst_appointment_statuses ast ON ((ast.id = da.status_id)))
UNION ALL
 SELECT report.patient_id,
    report.created_at AS event_time,
    'DIAGNOSTIC_REPORT_UPLOADED'::text AS event_type,
    'diagnostic_order_report'::text AS resource_type,
    report.id AS resource_id,
    report.uploaded_by AS actor_id,
    report.review_status AS detail_code
   FROM public.tbl_diagnostic_order_reports report
UNION ALL
 SELECT report.patient_id,
    report.reviewed_at AS event_time,
    'DIAGNOSTIC_REPORT_REVIEWED'::text AS event_type,
    'diagnostic_order_report'::text AS resource_type,
    report.id AS resource_id,
    report.reviewed_by AS actor_id,
    report.review_status AS detail_code
   FROM public.tbl_diagnostic_order_reports report
  WHERE (report.reviewed_at IS NOT NULL)
UNION ALL
 SELECT advice.patient_id,
    COALESCE(advice.signed_at, advice.created_at) AS event_time,
        CASE
            WHEN (advice.status = 'SIGNED'::text) THEN 'DIAGNOSTIC_ADVICE_SIGNED'::text
            ELSE 'DIAGNOSTIC_ADVICE_DRAFT'::text
        END AS event_type,
    'diagnostic_advice'::text AS resource_type,
    advice.id AS resource_id,
    COALESCE(advice.signed_by, advice.specialist_id) AS actor_id,
    COALESCE(('v'::text || (advice.version_no)::text), advice.status) AS detail_code
   FROM public.tbl_diagnostic_advice advice
UNION ALL
 SELECT followup.patient_id,
    COALESCE(followup.submitted_at, followup.created_at) AS event_time,
        CASE
            WHEN (followup.status = 'DRAFT'::text) THEN 'DIAGNOSTIC_FOLLOWUP_DRAFT'::text
            WHEN (followup.status = 'SUBMITTED'::text) THEN 'DIAGNOSTIC_FOLLOWUP_SUBMITTED'::text
            WHEN (followup.status = 'RETURNED'::text) THEN 'DIAGNOSTIC_FOLLOWUP_RETURNED'::text
            WHEN (followup.status = 'FORWARDED'::text) THEN 'DIAGNOSTIC_FOLLOWUP_FORWARDED'::text
            ELSE 'DIAGNOSTIC_FOLLOWUP'::text
        END AS event_type,
    'diagnostic_advice_followup'::text AS resource_type,
    followup.id AS resource_id,
    followup.health_worker_id AS actor_id,
    followup.status AS detail_code
   FROM public.tbl_diagnostic_advice_followups followup
UNION ALL
 SELECT followup.patient_id,
    followup.returned_at AS event_time,
    'DIAGNOSTIC_FOLLOWUP_RETURNED_BY_NAV'::text AS event_type,
    'diagnostic_advice_followup'::text AS resource_type,
    followup.id AS resource_id,
    followup.returned_by AS actor_id,
    'RETURNED'::text AS detail_code
   FROM public.tbl_diagnostic_advice_followups followup
  WHERE (followup.returned_at IS NOT NULL)
UNION ALL
 SELECT followup.patient_id,
    followup.forwarded_to_specialist_at AS event_time,
    'DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST'::text AS event_type,
    'diagnostic_advice_followup'::text AS resource_type,
    followup.id AS resource_id,
    followup.forwarded_to_specialist_by AS actor_id,
    'FORWARDED'::text AS detail_code
   FROM public.tbl_diagnostic_advice_followups followup
  WHERE (followup.forwarded_to_specialist_at IS NOT NULL)
UNION ALL
 SELECT d.patient_id,
    history.changed_at AS event_time,
    'DIAGNOSTIC_WORKFLOW'::text AS event_type,
    'diagnostic_status_history'::text AS resource_type,
    history.id AS resource_id,
    history.changed_by AS actor_id,
    history.reason AS detail_code
   FROM (public.tbl_diagnostic_status_history history
     JOIN public.tbl_diagnostic_orders d ON ((d.id = history.order_id)))
UNION ALL
 SELECT d.patient_id,
    d.advice_forwarded_to_hw_at AS event_time,
    'DIAGNOSTIC_ADVICE_TO_HW'::text AS event_type,
    'diagnostic_order'::text AS resource_type,
    d.id AS resource_id,
    d.advice_forwarded_to_hw_by AS actor_id,
    d.workflow_status AS detail_code
   FROM public.tbl_diagnostic_orders d
  WHERE (d.advice_forwarded_to_hw_at IS NOT NULL)
UNION ALL
 SELECT d.patient_id,
    d.case_closed_at AS event_time,
    'DIAGNOSTIC_CASE_CLOSED'::text AS event_type,
    'diagnostic_order'::text AS resource_type,
    d.id AS resource_id,
    d.case_closed_by AS actor_id,
    'CLOSED'::text AS detail_code
   FROM public.tbl_diagnostic_orders d
  WHERE (d.case_closed_at IS NOT NULL);


--
-- Name: tbl_user_registration_requests ck_reg_015_recommendation; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.tbl_user_registration_requests
    ADD CONSTRAINT ck_reg_015_recommendation CHECK ((((mo_recommended_by IS NULL) AND (mo_recommended_at IS NULL) AND (mo_recommendation IS NULL) AND (mo_recommendation_note IS NULL)) OR ((mo_recommended_by IS NOT NULL) AND (mo_recommended_at IS NOT NULL) AND (mo_recommendation IS NOT NULL) AND (mo_recommendation = ANY (ARRAY['RECOMMENDED'::text, 'NOT_RECOMMENDED'::text])) AND (mo_recommendation_note IS NOT NULL) AND (length(regexp_replace(mo_recommendation_note, '[[:space:]]'::text, ''::text, 'g'::text)) > 0)))) NOT VALID;


--
-- Name: tbl_user_registration_requests ck_reg_015_status_token_pair; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.tbl_user_registration_requests
    ADD CONSTRAINT ck_reg_015_status_token_pair CHECK ((((status_token_hash IS NULL) AND (status_token_expires_at IS NULL)) OR ((status_token_hash IS NOT NULL) AND (status_token_hash ~ '^[0-9a-f]{64}$'::text) AND (status_token_expires_at IS NOT NULL)))) NOT VALID;


--
-- Name: tbl_user_registration_requests ck_reg_rejection_reason_nonblank; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.tbl_user_registration_requests
    ADD CONSTRAINT ck_reg_rejection_reason_nonblank CHECK (((status <> 'REJECTED'::public.registration_status) OR COALESCE((length(regexp_replace(rejection_reason, '[[:space:]]'::text, ''::text, 'g'::text)) > 0), false))) NOT VALID;


--
-- Name: tbl_user_registration_requests ck_registration_workflow_version; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.tbl_user_registration_requests
    ADD CONSTRAINT ck_registration_workflow_version CHECK (((workflow_version IS NULL) OR (workflow_version = 1))) NOT VALID;


--
-- Name: tbl_consultation_slots ex_no_overlapping_slots; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_consultation_slots
    ADD CONSTRAINT ex_no_overlapping_slots EXCLUDE USING gist (specialist_id WITH =, tstzrange(slot_start, slot_end) WITH &&);


--
-- Name: mst_ai_models mst_ai_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_ai_models
    ADD CONSTRAINT mst_ai_models_pkey PRIMARY KEY (id);


--
-- Name: mst_ai_models mst_ai_models_provider_model_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_ai_models
    ADD CONSTRAINT mst_ai_models_provider_model_version_key UNIQUE (provider, model_version);


--
-- Name: mst_appointment_statuses mst_appointment_statuses_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_appointment_statuses
    ADD CONSTRAINT mst_appointment_statuses_code_key UNIQUE (code);


--
-- Name: mst_appointment_statuses mst_appointment_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_appointment_statuses
    ADD CONSTRAINT mst_appointment_statuses_pkey PRIMARY KEY (id);


--
-- Name: mst_consent_purposes mst_consent_purposes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_consent_purposes
    ADD CONSTRAINT mst_consent_purposes_code_key UNIQUE (code);


--
-- Name: mst_consent_purposes mst_consent_purposes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_consent_purposes
    ADD CONSTRAINT mst_consent_purposes_pkey PRIMARY KEY (id);


--
-- Name: mst_diagnostic_categories mst_diagnostic_categories_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_diagnostic_categories
    ADD CONSTRAINT mst_diagnostic_categories_code_key UNIQUE (code);


--
-- Name: mst_diagnostic_categories mst_diagnostic_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_diagnostic_categories
    ADD CONSTRAINT mst_diagnostic_categories_pkey PRIMARY KEY (id);


--
-- Name: mst_diagnostic_tests mst_diagnostic_tests_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_diagnostic_tests
    ADD CONSTRAINT mst_diagnostic_tests_code_key UNIQUE (code);


--
-- Name: mst_diagnostic_tests mst_diagnostic_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_diagnostic_tests
    ADD CONSTRAINT mst_diagnostic_tests_pkey PRIMARY KEY (id);


--
-- Name: mst_districts mst_districts_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_districts
    ADD CONSTRAINT mst_districts_code_key UNIQUE (code);


--
-- Name: mst_districts mst_districts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_districts
    ADD CONSTRAINT mst_districts_pkey PRIMARY KEY (id);


--
-- Name: mst_exposure_types mst_exposure_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_exposure_types
    ADD CONSTRAINT mst_exposure_types_code_key UNIQUE (code);


--
-- Name: mst_exposure_types mst_exposure_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_exposure_types
    ADD CONSTRAINT mst_exposure_types_pkey PRIMARY KEY (id);


--
-- Name: mst_facilities mst_facilities_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_facilities
    ADD CONSTRAINT mst_facilities_code_key UNIQUE (code);


--
-- Name: mst_facilities mst_facilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_facilities
    ADD CONSTRAINT mst_facilities_pkey PRIMARY KEY (id);


--
-- Name: mst_followup_statuses mst_followup_statuses_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_followup_statuses
    ADD CONSTRAINT mst_followup_statuses_code_key UNIQUE (code);


--
-- Name: mst_followup_statuses mst_followup_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_followup_statuses
    ADD CONSTRAINT mst_followup_statuses_pkey PRIMARY KEY (id);


--
-- Name: mst_gram_panchayats mst_gram_panchayats_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_gram_panchayats
    ADD CONSTRAINT mst_gram_panchayats_code_key UNIQUE (code);


--
-- Name: mst_gram_panchayats mst_gram_panchayats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_gram_panchayats
    ADD CONSTRAINT mst_gram_panchayats_pkey PRIMARY KEY (id);


--
-- Name: mst_hospitals mst_hospitals_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_hospitals
    ADD CONSTRAINT mst_hospitals_code_key UNIQUE (code);


--
-- Name: mst_hospitals mst_hospitals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_hospitals
    ADD CONSTRAINT mst_hospitals_pkey PRIMARY KEY (id);


--
-- Name: mst_investigation_statuses mst_investigation_statuses_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_investigation_statuses
    ADD CONSTRAINT mst_investigation_statuses_code_key UNIQUE (code);


--
-- Name: mst_investigation_statuses mst_investigation_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_investigation_statuses
    ADD CONSTRAINT mst_investigation_statuses_pkey PRIMARY KEY (id);


--
-- Name: mst_investigation_types mst_investigation_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_investigation_types
    ADD CONSTRAINT mst_investigation_types_code_key UNIQUE (code);


--
-- Name: mst_investigation_types mst_investigation_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_investigation_types
    ADD CONSTRAINT mst_investigation_types_pkey PRIMARY KEY (id);


--
-- Name: mst_languages mst_languages_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_languages
    ADD CONSTRAINT mst_languages_code_key UNIQUE (code);


--
-- Name: mst_languages mst_languages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_languages
    ADD CONSTRAINT mst_languages_pkey PRIMARY KEY (id);


--
-- Name: mst_mandals mst_mandals_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_mandals
    ADD CONSTRAINT mst_mandals_code_key UNIQUE (code);


--
-- Name: mst_mandals mst_mandals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_mandals
    ADD CONSTRAINT mst_mandals_pkey PRIMARY KEY (id);


--
-- Name: mst_missed_reasons mst_missed_reasons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_missed_reasons
    ADD CONSTRAINT mst_missed_reasons_code_key UNIQUE (code);


--
-- Name: mst_missed_reasons mst_missed_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_missed_reasons
    ADD CONSTRAINT mst_missed_reasons_pkey PRIMARY KEY (id);


--
-- Name: mst_notification_templates mst_notification_templates_code_language_id_channel_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_notification_templates
    ADD CONSTRAINT mst_notification_templates_code_language_id_channel_key UNIQUE (code, language_id, channel);


--
-- Name: mst_notification_templates mst_notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_notification_templates
    ADD CONSTRAINT mst_notification_templates_pkey PRIMARY KEY (id);


--
-- Name: mst_permissions mst_permissions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_permissions
    ADD CONSTRAINT mst_permissions_code_key UNIQUE (code);


--
-- Name: mst_permissions mst_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_permissions
    ADD CONSTRAINT mst_permissions_pkey PRIMARY KEY (id);


--
-- Name: mst_phcs mst_phcs_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_phcs
    ADD CONSTRAINT mst_phcs_code_key UNIQUE (code);


--
-- Name: mst_phcs mst_phcs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_phcs
    ADD CONSTRAINT mst_phcs_pkey PRIMARY KEY (id);


--
-- Name: mst_protocol_rules mst_protocol_rules_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_protocol_rules
    ADD CONSTRAINT mst_protocol_rules_code_key UNIQUE (code);


--
-- Name: mst_protocol_rules mst_protocol_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_protocol_rules
    ADD CONSTRAINT mst_protocol_rules_pkey PRIMARY KEY (id);


--
-- Name: mst_referral_priorities mst_referral_priorities_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_referral_priorities
    ADD CONSTRAINT mst_referral_priorities_code_key UNIQUE (code);


--
-- Name: mst_referral_priorities mst_referral_priorities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_referral_priorities
    ADD CONSTRAINT mst_referral_priorities_pkey PRIMARY KEY (id);


--
-- Name: mst_referral_priorities mst_referral_priorities_priority_rank_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_referral_priorities
    ADD CONSTRAINT mst_referral_priorities_priority_rank_key UNIQUE (priority_rank);


--
-- Name: mst_roles mst_roles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_roles
    ADD CONSTRAINT mst_roles_code_key UNIQUE (code);


--
-- Name: mst_roles mst_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_roles
    ADD CONSTRAINT mst_roles_pkey PRIMARY KEY (id);


--
-- Name: mst_screening_sites mst_screening_sites_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_screening_sites
    ADD CONSTRAINT mst_screening_sites_code_key UNIQUE (code);


--
-- Name: mst_screening_sites mst_screening_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_screening_sites
    ADD CONSTRAINT mst_screening_sites_pkey PRIMARY KEY (id);


--
-- Name: mst_specialties mst_specialties_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_specialties
    ADD CONSTRAINT mst_specialties_code_key UNIQUE (code);


--
-- Name: mst_specialties mst_specialties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_specialties
    ADD CONSTRAINT mst_specialties_pkey PRIMARY KEY (id);


--
-- Name: mst_symptoms mst_symptoms_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_symptoms
    ADD CONSTRAINT mst_symptoms_code_key UNIQUE (code);


--
-- Name: mst_symptoms mst_symptoms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_symptoms
    ADD CONSTRAINT mst_symptoms_pkey PRIMARY KEY (id);


--
-- Name: mst_ui_translations mst_ui_translations_msg_key_language_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_ui_translations
    ADD CONSTRAINT mst_ui_translations_msg_key_language_id_key UNIQUE (msg_key, language_id);


--
-- Name: mst_ui_translations mst_ui_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_ui_translations
    ADD CONSTRAINT mst_ui_translations_pkey PRIMARY KEY (id);


--
-- Name: mst_villages mst_villages_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_villages
    ADD CONSTRAINT mst_villages_code_key UNIQUE (code);


--
-- Name: mst_villages mst_villages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_villages
    ADD CONSTRAINT mst_villages_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: tbl_ai_assessment_logs tbl_ai_assessment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assessment_logs
    ADD CONSTRAINT tbl_ai_assessment_logs_pkey PRIMARY KEY (id);


--
-- Name: tbl_ai_assessments tbl_ai_assessments_analysis_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assessments
    ADD CONSTRAINT tbl_ai_assessments_analysis_code_key UNIQUE (analysis_code);


--
-- Name: tbl_ai_assessments tbl_ai_assessments_id_screening_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assessments
    ADD CONSTRAINT tbl_ai_assessments_id_screening_id_key UNIQUE (id, screening_id);


--
-- Name: tbl_ai_assessments tbl_ai_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assessments
    ADD CONSTRAINT tbl_ai_assessments_pkey PRIMARY KEY (id);


--
-- Name: tbl_appointment_status_history tbl_appointment_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_appointment_status_history
    ADD CONSTRAINT tbl_appointment_status_history_pkey PRIMARY KEY (id);


--
-- Name: tbl_audit_logs tbl_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_audit_logs
    ADD CONSTRAINT tbl_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: tbl_care_discomfort_reports tbl_care_discomfort_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_discomfort_reports
    ADD CONSTRAINT tbl_care_discomfort_reports_pkey PRIMARY KEY (id);


--
-- Name: tbl_care_final_reviews tbl_care_final_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_final_reviews
    ADD CONSTRAINT tbl_care_final_reviews_pkey PRIMARY KEY (id);


--
-- Name: tbl_care_final_reviews tbl_care_final_reviews_plan_id_signed_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_final_reviews
    ADD CONSTRAINT tbl_care_final_reviews_plan_id_signed_at_key UNIQUE (plan_id, signed_at);


--
-- Name: tbl_care_followup_reports tbl_care_followup_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_followup_reports
    ADD CONSTRAINT tbl_care_followup_reports_pkey PRIMARY KEY (id);


--
-- Name: tbl_care_followup_reports tbl_care_followup_reports_schedule_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_followup_reports
    ADD CONSTRAINT tbl_care_followup_reports_schedule_id_key UNIQUE (schedule_id);


--
-- Name: tbl_care_followup_schedules tbl_care_followup_schedules_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_followup_schedules
    ADD CONSTRAINT tbl_care_followup_schedules_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_care_followup_schedules tbl_care_followup_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_followup_schedules
    ADD CONSTRAINT tbl_care_followup_schedules_pkey PRIMARY KEY (id);


--
-- Name: tbl_care_medicines tbl_care_medicines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_medicines
    ADD CONSTRAINT tbl_care_medicines_pkey PRIMARY KEY (id);


--
-- Name: tbl_care_plan_status_history tbl_care_plan_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plan_status_history
    ADD CONSTRAINT tbl_care_plan_status_history_pkey PRIMARY KEY (id);


--
-- Name: tbl_care_plans tbl_care_plans_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_care_plans tbl_care_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_pkey PRIMARY KEY (id);


--
-- Name: tbl_care_return_to_mo tbl_care_return_to_mo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_return_to_mo
    ADD CONSTRAINT tbl_care_return_to_mo_pkey PRIMARY KEY (id);


--
-- Name: tbl_case_assignments tbl_case_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_assignments
    ADD CONSTRAINT tbl_case_assignments_pkey PRIMARY KEY (id);


--
-- Name: tbl_case_classifications tbl_case_classifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_classifications
    ADD CONSTRAINT tbl_case_classifications_pkey PRIMARY KEY (id);


--
-- Name: tbl_case_escalations tbl_case_escalations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_escalations
    ADD CONSTRAINT tbl_case_escalations_pkey PRIMARY KEY (id);


--
-- Name: tbl_clinical_review_versions tbl_clinical_review_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_clinical_review_versions
    ADD CONSTRAINT tbl_clinical_review_versions_pkey PRIMARY KEY (id);


--
-- Name: tbl_clinical_review_versions tbl_clinical_review_versions_review_id_version_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_clinical_review_versions
    ADD CONSTRAINT tbl_clinical_review_versions_review_id_version_no_key UNIQUE (review_id, version_no);


--
-- Name: tbl_clinical_reviews tbl_clinical_reviews_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_clinical_reviews
    ADD CONSTRAINT tbl_clinical_reviews_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_clinical_reviews tbl_clinical_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_clinical_reviews
    ADD CONSTRAINT tbl_clinical_reviews_pkey PRIMARY KEY (id);


--
-- Name: tbl_clinical_reviews tbl_clinical_reviews_screening_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_clinical_reviews
    ADD CONSTRAINT tbl_clinical_reviews_screening_id_key UNIQUE (screening_id);


--
-- Name: tbl_consultation_notes tbl_consultation_notes_consultation_id_version_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_consultation_notes
    ADD CONSTRAINT tbl_consultation_notes_consultation_id_version_no_key UNIQUE (consultation_id, version_no);


--
-- Name: tbl_consultation_notes tbl_consultation_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_consultation_notes
    ADD CONSTRAINT tbl_consultation_notes_pkey PRIMARY KEY (id);


--
-- Name: tbl_consultation_slots tbl_consultation_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_consultation_slots
    ADD CONSTRAINT tbl_consultation_slots_pkey PRIMARY KEY (id);


--
-- Name: tbl_data_exports tbl_data_exports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_data_exports
    ADD CONSTRAINT tbl_data_exports_pkey PRIMARY KEY (id);


--
-- Name: tbl_demo_datasets tbl_demo_datasets_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_demo_datasets
    ADD CONSTRAINT tbl_demo_datasets_code_key UNIQUE (code);


--
-- Name: tbl_demo_datasets tbl_demo_datasets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_demo_datasets
    ADD CONSTRAINT tbl_demo_datasets_pkey PRIMARY KEY (id);


--
-- Name: tbl_diagnostic_advice_followups tbl_diagnostic_advice_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice_followups
    ADD CONSTRAINT tbl_diagnostic_advice_followups_pkey PRIMARY KEY (id);


--
-- Name: tbl_diagnostic_advice tbl_diagnostic_advice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice
    ADD CONSTRAINT tbl_diagnostic_advice_pkey PRIMARY KEY (id);


--
-- Name: tbl_diagnostic_appointment_history tbl_diagnostic_appointment_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointment_history
    ADD CONSTRAINT tbl_diagnostic_appointment_history_pkey PRIMARY KEY (id);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_booked_by_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_booked_by_idempotency_key_key UNIQUE (booked_by, idempotency_key);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_pkey PRIMARY KEY (id);


--
-- Name: tbl_diagnostic_order_items tbl_diagnostic_order_items_order_id_test_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_items
    ADD CONSTRAINT tbl_diagnostic_order_items_order_id_test_id_key UNIQUE (order_id, test_id);


--
-- Name: tbl_diagnostic_order_items tbl_diagnostic_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_items
    ADD CONSTRAINT tbl_diagnostic_order_items_pkey PRIMARY KEY (id);


--
-- Name: tbl_diagnostic_order_reports tbl_diagnostic_order_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_reports
    ADD CONSTRAINT tbl_diagnostic_order_reports_pkey PRIMARY KEY (id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_order_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_order_code_key UNIQUE (order_code);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_pkey PRIMARY KEY (id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_prescribed_by_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_prescribed_by_idempotency_key_key UNIQUE (prescribed_by, idempotency_key);


--
-- Name: tbl_diagnostic_status_history tbl_diagnostic_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_status_history
    ADD CONSTRAINT tbl_diagnostic_status_history_pkey PRIMARY KEY (id);


--
-- Name: tbl_district_admin_setup_tokens tbl_district_admin_setup_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_district_admin_setup_tokens
    ADD CONSTRAINT tbl_district_admin_setup_tokens_pkey PRIMARY KEY (id);


--
-- Name: tbl_district_admin_setup_tokens tbl_district_admin_setup_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_district_admin_setup_tokens
    ADD CONSTRAINT tbl_district_admin_setup_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: tbl_followup_tasks tbl_followup_tasks_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_followup_tasks
    ADD CONSTRAINT tbl_followup_tasks_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_followup_tasks tbl_followup_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_followup_tasks
    ADD CONSTRAINT tbl_followup_tasks_pkey PRIMARY KEY (id);


--
-- Name: tbl_health_worker_location_assignments tbl_health_worker_location_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_health_worker_location_assignments
    ADD CONSTRAINT tbl_health_worker_location_assignments_pkey PRIMARY KEY (id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_booked_by_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_booked_by_idempotency_key_key UNIQUE (booked_by, idempotency_key);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_pkey PRIMARY KEY (id);


--
-- Name: tbl_image_quality_results tbl_image_quality_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_image_quality_results
    ADD CONSTRAINT tbl_image_quality_results_pkey PRIMARY KEY (id);


--
-- Name: tbl_investigation_orders tbl_investigation_orders_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_orders
    ADD CONSTRAINT tbl_investigation_orders_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_investigation_orders tbl_investigation_orders_ordered_by_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_orders
    ADD CONSTRAINT tbl_investigation_orders_ordered_by_idempotency_key_key UNIQUE (ordered_by, idempotency_key);


--
-- Name: tbl_investigation_orders tbl_investigation_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_orders
    ADD CONSTRAINT tbl_investigation_orders_pkey PRIMARY KEY (id);


--
-- Name: tbl_investigation_status_history tbl_investigation_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_status_history
    ADD CONSTRAINT tbl_investigation_status_history_pkey PRIMARY KEY (id);


--
-- Name: tbl_location_import_batches tbl_location_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_location_import_batches
    ADD CONSTRAINT tbl_location_import_batches_pkey PRIMARY KEY (id);


--
-- Name: tbl_medical_officer_case_claims tbl_medical_officer_case_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_medical_officer_case_claims
    ADD CONSTRAINT tbl_medical_officer_case_claims_pkey PRIMARY KEY (id);


--
-- Name: tbl_medical_officer_mandal_assignments tbl_medical_officer_mandal_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_medical_officer_mandal_assignments
    ADD CONSTRAINT tbl_medical_officer_mandal_assignments_pkey PRIMARY KEY (id);


--
-- Name: tbl_notifications tbl_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT tbl_notifications_pkey PRIMARY KEY (id);


--
-- Name: tbl_offline_sync_queue tbl_offline_sync_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_offline_sync_queue
    ADD CONSTRAINT tbl_offline_sync_queue_pkey PRIMARY KEY (id);


--
-- Name: tbl_offline_sync_queue tbl_offline_sync_queue_user_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_offline_sync_queue
    ADD CONSTRAINT tbl_offline_sync_queue_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);


--
-- Name: tbl_password_reset_tokens tbl_password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_password_reset_tokens
    ADD CONSTRAINT tbl_password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: tbl_password_reset_tokens tbl_password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_password_reset_tokens
    ADD CONSTRAINT tbl_password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: tbl_pathology_reports tbl_pathology_reports_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pathology_reports
    ADD CONSTRAINT tbl_pathology_reports_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_pathology_reports tbl_pathology_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pathology_reports
    ADD CONSTRAINT tbl_pathology_reports_pkey PRIMARY KEY (id);


--
-- Name: tbl_pathology_reports tbl_pathology_reports_report_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pathology_reports
    ADD CONSTRAINT tbl_pathology_reports_report_key_key UNIQUE (report_key);


--
-- Name: tbl_pathology_reviews tbl_pathology_reviews_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pathology_reviews
    ADD CONSTRAINT tbl_pathology_reviews_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_pathology_reviews tbl_pathology_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pathology_reviews
    ADD CONSTRAINT tbl_pathology_reviews_pkey PRIMARY KEY (id);


--
-- Name: tbl_patient_consents tbl_patient_consents_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_consents
    ADD CONSTRAINT tbl_patient_consents_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_patient_consents tbl_patient_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_consents
    ADD CONSTRAINT tbl_patient_consents_pkey PRIMARY KEY (id);


--
-- Name: tbl_patient_contact_history tbl_patient_contact_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_contact_history
    ADD CONSTRAINT tbl_patient_contact_history_pkey PRIMARY KEY (id);


--
-- Name: tbl_patient_duplicate_flags tbl_patient_duplicate_flags_patient_id_candidate_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_duplicate_flags
    ADD CONSTRAINT tbl_patient_duplicate_flags_patient_id_candidate_id_key UNIQUE (patient_id, candidate_id);


--
-- Name: tbl_patient_duplicate_flags tbl_patient_duplicate_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_duplicate_flags
    ADD CONSTRAINT tbl_patient_duplicate_flags_pkey PRIMARY KEY (id);


--
-- Name: tbl_patient_medical_histories tbl_patient_medical_histories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_medical_histories
    ADD CONSTRAINT tbl_patient_medical_histories_pkey PRIMARY KEY (id);


--
-- Name: tbl_patients tbl_patients_patient_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patients
    ADD CONSTRAINT tbl_patients_patient_code_key UNIQUE (patient_code);


--
-- Name: tbl_patients tbl_patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patients
    ADD CONSTRAINT tbl_patients_pkey PRIMARY KEY (id);


--
-- Name: tbl_patients tbl_patients_registered_by_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patients
    ADD CONSTRAINT tbl_patients_registered_by_idempotency_key_key UNIQUE (registered_by, idempotency_key);


--
-- Name: tbl_referral_slips tbl_referral_slips_file_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referral_slips
    ADD CONSTRAINT tbl_referral_slips_file_key_key UNIQUE (file_key);


--
-- Name: tbl_referral_slips tbl_referral_slips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referral_slips
    ADD CONSTRAINT tbl_referral_slips_pkey PRIMARY KEY (id);


--
-- Name: tbl_referral_status_history tbl_referral_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referral_status_history
    ADD CONSTRAINT tbl_referral_status_history_pkey PRIMARY KEY (id);


--
-- Name: tbl_referrals tbl_referrals_created_by_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_created_by_idempotency_key_key UNIQUE (created_by, idempotency_key);


--
-- Name: tbl_referrals tbl_referrals_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_referrals tbl_referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_pkey PRIMARY KEY (id);


--
-- Name: tbl_referrals tbl_referrals_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_referral_code_key UNIQUE (referral_code);


--
-- Name: tbl_role_permissions tbl_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_role_permissions
    ADD CONSTRAINT tbl_role_permissions_pkey PRIMARY KEY (id);


--
-- Name: tbl_role_permissions tbl_role_permissions_role_id_permission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_role_permissions
    ADD CONSTRAINT tbl_role_permissions_role_id_permission_id_key UNIQUE (role_id, permission_id);


--
-- Name: tbl_screening_findings tbl_screening_findings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_findings
    ADD CONSTRAINT tbl_screening_findings_pkey PRIMARY KEY (id);


--
-- Name: tbl_screening_photos tbl_screening_photos_captured_by_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_photos
    ADD CONSTRAINT tbl_screening_photos_captured_by_idempotency_key_key UNIQUE (captured_by, idempotency_key);


--
-- Name: tbl_screening_photos tbl_screening_photos_id_screening_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_photos
    ADD CONSTRAINT tbl_screening_photos_id_screening_id_key UNIQUE (id, screening_id);


--
-- Name: tbl_screening_photos tbl_screening_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_photos
    ADD CONSTRAINT tbl_screening_photos_pkey PRIMARY KEY (id);


--
-- Name: tbl_screening_photos tbl_screening_photos_private_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_photos
    ADD CONSTRAINT tbl_screening_photos_private_key_key UNIQUE (private_key);


--
-- Name: tbl_screening_photos tbl_screening_photos_screening_id_checksum_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_photos
    ADD CONSTRAINT tbl_screening_photos_screening_id_checksum_sha256_key UNIQUE (screening_id, checksum_sha256);


--
-- Name: tbl_screenings tbl_screenings_examiner_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screenings
    ADD CONSTRAINT tbl_screenings_examiner_id_idempotency_key_key UNIQUE (examiner_id, idempotency_key);


--
-- Name: tbl_screenings tbl_screenings_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screenings
    ADD CONSTRAINT tbl_screenings_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_screenings tbl_screenings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screenings
    ADD CONSTRAINT tbl_screenings_pkey PRIMARY KEY (id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_pkey PRIMARY KEY (id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_video_consultation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_video_consultation_id_key UNIQUE (video_consultation_id);


--
-- Name: tbl_specialist_consultation_decisions tbl_specialist_consultation_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_consultation_decisions
    ADD CONSTRAINT tbl_specialist_consultation_decisions_pkey PRIMARY KEY (id);


--
-- Name: tbl_specialist_consultation_decisions tbl_specialist_consultation_decisions_referral_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_consultation_decisions
    ADD CONSTRAINT tbl_specialist_consultation_decisions_referral_id_key UNIQUE (referral_id);


--
-- Name: tbl_sync_conflicts tbl_sync_conflicts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sync_conflicts
    ADD CONSTRAINT tbl_sync_conflicts_pkey PRIMARY KEY (id);


--
-- Name: tbl_system_error_logs tbl_system_error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_system_error_logs
    ADD CONSTRAINT tbl_system_error_logs_pkey PRIMARY KEY (id);


--
-- Name: tbl_transport_support_records tbl_transport_support_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_transport_support_records
    ADD CONSTRAINT tbl_transport_support_records_pkey PRIMARY KEY (id);


--
-- Name: tbl_treatment_linkages tbl_treatment_linkages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_treatment_linkages
    ADD CONSTRAINT tbl_treatment_linkages_pkey PRIMARY KEY (id);


--
-- Name: tbl_user_facility_assignments tbl_user_facility_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_facility_assignments
    ADD CONSTRAINT tbl_user_facility_assignments_pkey PRIMARY KEY (id);


--
-- Name: tbl_user_facility_assignments tbl_user_facility_assignments_user_id_facility_id_valid_fro_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_facility_assignments
    ADD CONSTRAINT tbl_user_facility_assignments_user_id_facility_id_valid_fro_key UNIQUE (user_id, facility_id, valid_from);


--
-- Name: tbl_user_language_preferences tbl_user_language_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_language_preferences
    ADD CONSTRAINT tbl_user_language_preferences_pkey PRIMARY KEY (id);


--
-- Name: tbl_user_language_preferences tbl_user_language_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_language_preferences
    ADD CONSTRAINT tbl_user_language_preferences_user_id_key UNIQUE (user_id);


--
-- Name: tbl_user_registration_requests tbl_user_registration_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_registration_requests
    ADD CONSTRAINT tbl_user_registration_requests_pkey PRIMARY KEY (id);


--
-- Name: tbl_user_sessions tbl_user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_sessions
    ADD CONSTRAINT tbl_user_sessions_pkey PRIMARY KEY (id);


--
-- Name: tbl_user_sessions tbl_user_sessions_refresh_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_sessions
    ADD CONSTRAINT tbl_user_sessions_refresh_token_hash_key UNIQUE (refresh_token_hash);


--
-- Name: tbl_users tbl_users_auth_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_users
    ADD CONSTRAINT tbl_users_auth_id_key UNIQUE (auth_id);


--
-- Name: tbl_users tbl_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_users
    ADD CONSTRAINT tbl_users_pkey PRIMARY KEY (id);


--
-- Name: tbl_video_consultations tbl_video_consultations_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_consultations
    ADD CONSTRAINT tbl_video_consultations_id_patient_id_key UNIQUE (id, patient_id);


--
-- Name: tbl_video_consultations tbl_video_consultations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_consultations
    ADD CONSTRAINT tbl_video_consultations_pkey PRIMARY KEY (id);


--
-- Name: tbl_video_consultations tbl_video_consultations_requested_by_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_consultations
    ADD CONSTRAINT tbl_video_consultations_requested_by_idempotency_key_key UNIQUE (requested_by, idempotency_key);


--
-- Name: tbl_video_join_tokens tbl_video_join_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_join_tokens
    ADD CONSTRAINT tbl_video_join_tokens_pkey PRIMARY KEY (id);


--
-- Name: tbl_video_join_tokens tbl_video_join_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_join_tokens
    ADD CONSTRAINT tbl_video_join_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: tbl_diagnostic_advice uq_diagnostic_advice_order_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice
    ADD CONSTRAINT uq_diagnostic_advice_order_version UNIQUE (order_id, version_no);


--
-- Name: tbl_diagnostic_order_reports uq_diagnostic_order_report_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_reports
    ADD CONSTRAINT uq_diagnostic_order_report_key UNIQUE (report_key);


--
-- Name: tbl_health_worker_location_assignments uq_hw_assignment_start; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_health_worker_location_assignments
    ADD CONSTRAINT uq_hw_assignment_start UNIQUE (user_id, village_id, facility_id, valid_from);


--
-- Name: tbl_medical_officer_mandal_assignments uq_mo_mandal_assignment_start; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_medical_officer_mandal_assignments
    ADD CONSTRAINT uq_mo_mandal_assignment_start UNIQUE (user_id, mandal_id, valid_from);


--
-- Name: mst_facilities uq_mst_facilities_id_district_mandal; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_facilities
    ADD CONSTRAINT uq_mst_facilities_id_district_mandal UNIQUE (id, district_id, mandal_id);


--
-- Name: mst_mandals uq_mst_mandals_id_district; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_mandals
    ADD CONSTRAINT uq_mst_mandals_id_district UNIQUE (id, district_id);


--
-- Name: mst_villages uq_mst_villages_id_mandal; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_villages
    ADD CONSTRAINT uq_mst_villages_id_mandal UNIQUE (id, mandal_id);


--
-- Name: idx_ai_logs_assessment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_logs_assessment ON public.tbl_ai_assessment_logs USING btree (assessment_id);


--
-- Name: idx_ai_photo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_photo ON public.tbl_ai_assessments USING btree (photo_id);


--
-- Name: idx_ai_screening; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_screening ON public.tbl_ai_assessments USING btree (screening_id);


--
-- Name: idx_appt_hist_hosp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appt_hist_hosp ON public.tbl_appointment_status_history USING btree (hospital_appointment_id);


--
-- Name: idx_appt_hist_video; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appt_hist_video ON public.tbl_appointment_status_history USING btree (video_consultation_id);


--
-- Name: idx_appt_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appt_referral ON public.tbl_hospital_appointments USING btree (referral_id);


--
-- Name: idx_appt_sched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appt_sched ON public.tbl_hospital_appointments USING btree (scheduled_at, status_id);


--
-- Name: idx_audit_actor_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_actor_time ON public.tbl_audit_logs USING btree (actor_id, occurred_at DESC);


--
-- Name: idx_audit_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_patient ON public.tbl_audit_logs USING btree (patient_id, occurred_at DESC);


--
-- Name: idx_audit_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_resource ON public.tbl_audit_logs USING btree (resource_type, resource_id);


--
-- Name: idx_care_discomfort_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_discomfort_open ON public.tbl_care_discomfort_reports USING btree (plan_id, status, created_at DESC);


--
-- Name: idx_care_final_reviews_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_final_reviews_plan ON public.tbl_care_final_reviews USING btree (plan_id, signed_at DESC);


--
-- Name: idx_care_followup_hw_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_followup_hw_due ON public.tbl_care_followup_schedules USING btree (assigned_hw_id, due_at) WHERE (status = 'SCHEDULED'::public.care_followup_status);


--
-- Name: idx_care_followup_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_followup_plan ON public.tbl_care_followup_schedules USING btree (plan_id, due_at);


--
-- Name: idx_care_followup_reports_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_followup_reports_patient ON public.tbl_care_followup_reports USING btree (patient_id, submitted_at DESC);


--
-- Name: idx_care_medicines_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_medicines_plan ON public.tbl_care_medicines USING btree (plan_id, sort_order) WHERE (is_active IS TRUE);


--
-- Name: idx_care_plan_status_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_plan_status_history ON public.tbl_care_plan_status_history USING btree (plan_id, changed_at DESC);


--
-- Name: idx_care_plans_mo_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_plans_mo_status ON public.tbl_care_plans USING btree (responsible_mo_id, status, created_at DESC);


--
-- Name: idx_care_plans_navigator_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_plans_navigator_status ON public.tbl_care_plans USING btree (assigned_navigator_id, status, created_at DESC);


--
-- Name: idx_care_plans_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_plans_patient ON public.tbl_care_plans USING btree (patient_id, created_at DESC);


--
-- Name: idx_care_plans_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_plans_referral ON public.tbl_care_plans USING btree (referral_id) WHERE (referral_id IS NOT NULL);


--
-- Name: idx_care_plans_responsible_specialist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_plans_responsible_specialist ON public.tbl_care_plans USING btree (responsible_specialist_id) WHERE (responsible_specialist_id IS NOT NULL);


--
-- Name: idx_care_plans_revisit_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_plans_revisit_date ON public.tbl_care_plans USING btree (hospital_revisit_date) WHERE ((hospital_revisit_date IS NOT NULL) AND (status <> ALL (ARRAY['CLOSED'::public.care_plan_status, 'SUPERSEDED'::public.care_plan_status])));


--
-- Name: idx_care_return_to_mo_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_return_to_mo_patient ON public.tbl_care_return_to_mo USING btree (patient_id, authorized_at DESC);


--
-- Name: idx_case_assign_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_case_assign_user ON public.tbl_case_assignments USING btree (user_id) WHERE (valid_to IS NULL);


--
-- Name: idx_classification_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classification_case ON public.tbl_case_classifications USING btree (screening_id, seq DESC);


--
-- Name: idx_conflicts_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conflicts_open ON public.tbl_sync_conflicts USING btree (resolution) WHERE (resolution = 'OPEN'::public.conflict_resolution);


--
-- Name: idx_consents_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consents_patient ON public.tbl_patient_consents USING btree (patient_id, purpose_id, consent_seq DESC);


--
-- Name: idx_contact_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_patient ON public.tbl_patient_contact_history USING btree (patient_id, contacted_at DESC);


--
-- Name: idx_diagnostic_advice_follow_up_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_advice_follow_up_due ON public.tbl_diagnostic_advice USING btree (follow_up_due_date) WHERE ((is_current IS TRUE) AND (follow_up_required IS TRUE) AND (follow_up_due_date IS NOT NULL));


--
-- Name: idx_diagnostic_advice_followups_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_advice_followups_order ON public.tbl_diagnostic_advice_followups USING btree (order_id, created_at DESC);


--
-- Name: idx_diagnostic_advice_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_advice_patient ON public.tbl_diagnostic_advice USING btree (patient_id, created_at DESC);


--
-- Name: idx_diagnostic_appt_facility_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_appt_facility_time ON public.tbl_diagnostic_appointments USING btree (facility_id, requested_at);


--
-- Name: idx_diagnostic_appt_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_appt_history ON public.tbl_diagnostic_appointment_history USING btree (appointment_id, changed_at);


--
-- Name: idx_diagnostic_appt_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_appt_order ON public.tbl_diagnostic_appointments USING btree (diagnostic_order_id, created_at DESC);


--
-- Name: idx_diagnostic_appt_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_appt_patient ON public.tbl_diagnostic_appointments USING btree (patient_id, created_at DESC);


--
-- Name: idx_diagnostic_appt_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_appt_status ON public.tbl_diagnostic_appointments USING btree (status_id);


--
-- Name: idx_diagnostic_followups_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_followups_status ON public.tbl_diagnostic_advice_followups USING btree (order_id, status, created_at DESC);


--
-- Name: idx_diagnostic_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_order_items_order ON public.tbl_diagnostic_order_items USING btree (order_id);


--
-- Name: idx_diagnostic_order_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_order_items_status ON public.tbl_diagnostic_order_items USING btree (status_id);


--
-- Name: idx_diagnostic_order_reports_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_order_reports_order ON public.tbl_diagnostic_order_reports USING btree (order_id, created_at DESC);


--
-- Name: idx_diagnostic_order_reports_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_order_reports_patient ON public.tbl_diagnostic_order_reports USING btree (patient_id, created_at DESC);


--
-- Name: idx_diagnostic_order_reports_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_order_reports_pending ON public.tbl_diagnostic_order_reports USING btree (review_status, created_at DESC) WHERE (review_status = 'PENDING'::text);


--
-- Name: idx_diagnostic_orders_assigned_hw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_orders_assigned_hw ON public.tbl_diagnostic_orders USING btree (assigned_health_worker_id, created_at DESC) WHERE (assigned_health_worker_id IS NOT NULL);


--
-- Name: idx_diagnostic_orders_facility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_orders_facility ON public.tbl_diagnostic_orders USING btree (facility_id);


--
-- Name: idx_diagnostic_orders_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_orders_patient ON public.tbl_diagnostic_orders USING btree (patient_id, created_at DESC);


--
-- Name: idx_diagnostic_orders_prescriber; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_orders_prescriber ON public.tbl_diagnostic_orders USING btree (prescribed_by, created_at DESC);


--
-- Name: idx_diagnostic_orders_reassessment_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_orders_reassessment_source ON public.tbl_diagnostic_orders USING btree (reassessment_source_order_id) WHERE (reassessment_source_order_id IS NOT NULL);


--
-- Name: idx_diagnostic_orders_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_orders_referral ON public.tbl_diagnostic_orders USING btree (referral_id) WHERE (referral_id IS NOT NULL);


--
-- Name: idx_diagnostic_orders_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_orders_workflow ON public.tbl_diagnostic_orders USING btree (workflow_status, created_at DESC);


--
-- Name: idx_diagnostic_status_history_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_status_history_order ON public.tbl_diagnostic_status_history USING btree (order_id, changed_at);


--
-- Name: idx_diagnostic_tests_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diagnostic_tests_category ON public.mst_diagnostic_tests USING btree (category_id) WHERE (is_active IS TRUE);


--
-- Name: idx_district_admin_setup_token_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_district_admin_setup_token_expiry ON public.tbl_district_admin_setup_tokens USING btree (expires_at) WHERE ((used_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: idx_errors_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_errors_time ON public.tbl_system_error_logs USING btree (occurred_at DESC, severity);


--
-- Name: idx_escalations_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escalations_task ON public.tbl_case_escalations USING btree (task_id, status);


--
-- Name: idx_facilities_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facilities_active ON public.mst_facilities USING btree (is_active);


--
-- Name: idx_facilities_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facilities_category ON public.mst_facilities USING btree (category);


--
-- Name: idx_facilities_district; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facilities_district ON public.mst_facilities USING btree (district_id, facility_type);


--
-- Name: idx_facilities_mandal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facilities_mandal ON public.mst_facilities USING btree (mandal_id);


--
-- Name: idx_facilities_village; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facilities_village ON public.mst_facilities USING btree (village_id);


--
-- Name: idx_findings_screening; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_findings_screening ON public.tbl_screening_findings USING btree (screening_id);


--
-- Name: idx_followup_owner_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followup_owner_due ON public.tbl_followup_tasks USING btree (owner_id, due_at) WHERE (closed_at IS NULL);


--
-- Name: idx_followup_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followup_patient ON public.tbl_followup_tasks USING btree (patient_id);


--
-- Name: idx_gp_mandal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gp_mandal ON public.mst_gram_panchayats USING btree (mandal_id);


--
-- Name: idx_history_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_history_patient ON public.tbl_patient_medical_histories USING btree (patient_id);


--
-- Name: idx_inv_hist_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_hist_order ON public.tbl_investigation_status_history USING btree (order_id, changed_at);


--
-- Name: idx_inv_orders_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_orders_patient ON public.tbl_investigation_orders USING btree (patient_id);


--
-- Name: idx_inv_orders_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_orders_referral ON public.tbl_investigation_orders USING btree (referral_id);


--
-- Name: idx_join_tokens_consult; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_join_tokens_consult ON public.tbl_video_join_tokens USING btree (consultation_id, user_id);


--
-- Name: idx_location_imports_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_imports_at ON public.tbl_location_import_batches USING btree (imported_at DESC);


--
-- Name: idx_mandals_district; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mandals_district ON public.mst_mandals USING btree (district_id);


--
-- Name: idx_mo_claim_active_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mo_claim_active_owner ON public.tbl_medical_officer_case_claims USING btree (medical_officer_id) WHERE (released_at IS NULL);


--
-- Name: idx_mo_mandal_assignment_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mo_mandal_assignment_scope ON public.tbl_medical_officer_mandal_assignments USING btree (mandal_id, user_id) WHERE (valid_to IS NULL);


--
-- Name: idx_notif_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_due ON public.tbl_notifications USING btree (scheduled_at) WHERE (status = 'PENDING'::public.notification_status);


--
-- Name: idx_notif_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_patient ON public.tbl_notifications USING btree (patient_id);


--
-- Name: idx_notif_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_recipient ON public.tbl_notifications USING btree (recipient_user_id, status);


--
-- Name: idx_path_reports_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_path_reports_order ON public.tbl_pathology_reports USING btree (order_id);


--
-- Name: idx_path_reviews_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_path_reviews_report ON public.tbl_pathology_reviews USING btree (report_id);


--
-- Name: idx_patients_duplicate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_duplicate ON public.tbl_patients USING btree (duplicate_hint);


--
-- Name: idx_patients_facility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_facility ON public.tbl_patients USING btree (registered_facility_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_patients_phc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_phc ON public.tbl_patients USING btree (phc_id);


--
-- Name: idx_patients_village; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_village ON public.tbl_patients USING btree (village_id);


--
-- Name: idx_phcs_mandal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phcs_mandal ON public.mst_phcs USING btree (mandal_id);


--
-- Name: idx_photos_screening; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photos_screening ON public.tbl_screening_photos USING btree (screening_id);


--
-- Name: idx_quality_photo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quality_photo ON public.tbl_image_quality_results USING btree (photo_id);


--
-- Name: idx_ref_hist_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ref_hist_referral ON public.tbl_referral_status_history USING btree (referral_id, changed_at);


--
-- Name: idx_referrals_hospital; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_hospital ON public.tbl_referrals USING btree (to_hospital_id, status);


--
-- Name: idx_referrals_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_patient ON public.tbl_referrals USING btree (patient_id);


--
-- Name: idx_referrals_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_review ON public.tbl_referrals USING btree (review_id);


--
-- Name: idx_reg_015_pending_final_decision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reg_015_pending_final_decision ON public.tbl_user_registration_requests USING btree (facility_id, mo_recommended_at) WHERE ((workflow_version = 1) AND (status = 'PENDING'::public.registration_status) AND (mo_recommended_by IS NOT NULL));


--
-- Name: idx_reg_015_pending_mandal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reg_015_pending_mandal ON public.tbl_user_registration_requests USING btree (mandal_id, created_at) WHERE ((workflow_version = 1) AND (status = 'PENDING'::public.registration_status));


--
-- Name: idx_reg_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reg_status ON public.tbl_user_registration_requests USING btree (status, created_at);


--
-- Name: idx_reset_tokens_user_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reset_tokens_user_open ON public.tbl_password_reset_tokens USING btree (user_id) WHERE (used_at IS NULL);


--
-- Name: idx_reviews_doctor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_doctor ON public.tbl_clinical_reviews USING btree (doctor_id, signed_at);


--
-- Name: idx_screenings_examiner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_screenings_examiner ON public.tbl_screenings USING btree (examiner_id);


--
-- Name: idx_screenings_facility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_screenings_facility ON public.tbl_screenings USING btree (facility_id, case_state);


--
-- Name: idx_screenings_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_screenings_patient ON public.tbl_screenings USING btree (patient_id, screening_date DESC);


--
-- Name: idx_sessions_previous_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_previous_hash ON public.tbl_user_sessions USING btree (previous_refresh_token_hash) WHERE (previous_refresh_token_hash IS NOT NULL);


--
-- Name: idx_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user ON public.tbl_user_sessions USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_slips_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slips_referral ON public.tbl_referral_slips USING btree (referral_id);


--
-- Name: idx_slots_specialist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slots_specialist ON public.tbl_consultation_slots USING btree (specialist_id, slot_start);


--
-- Name: idx_specialist_availability_hospital; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_availability_hospital ON public.tbl_specialist_availability_requests USING btree (hospital_id, status, requested_start);


--
-- Name: idx_specialist_availability_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_availability_pending ON public.tbl_specialist_availability_requests USING btree (specialist_id, requested_start) WHERE (status = 'PENDING'::text);


--
-- Name: idx_specialist_decisions_navigator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_decisions_navigator ON public.tbl_specialist_consultation_decisions USING btree (referral_id, status, signed_at DESC);


--
-- Name: idx_specialist_decisions_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_specialist_decisions_patient ON public.tbl_specialist_consultation_decisions USING btree (patient_id, created_at DESC);


--
-- Name: idx_sync_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_status ON public.tbl_offline_sync_queue USING btree (user_id, status);


--
-- Name: idx_transport_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transport_referral ON public.tbl_transport_support_records USING btree (referral_id);


--
-- Name: idx_treatment_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_referral ON public.tbl_treatment_linkages USING btree (referral_id);


--
-- Name: idx_ufa_facility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ufa_facility ON public.tbl_user_facility_assignments USING btree (facility_id);


--
-- Name: idx_ufa_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ufa_user ON public.tbl_user_facility_assignments USING btree (user_id);


--
-- Name: idx_users_district; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_district ON public.tbl_users USING btree (district_id) WHERE ((district_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.tbl_users USING btree (role_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_video_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_referral ON public.tbl_video_consultations USING btree (referral_id);


--
-- Name: idx_video_specialist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_specialist ON public.tbl_video_consultations USING btree (specialist_id);


--
-- Name: idx_villages_gp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_villages_gp ON public.mst_villages USING btree (gram_panchayat_id);


--
-- Name: idx_villages_mandal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_villages_mandal ON public.mst_villages USING btree (mandal_id);


--
-- Name: uq_care_followup_active_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_care_followup_active_plan ON public.tbl_care_followup_schedules USING btree (plan_id) WHERE (status = 'SCHEDULED'::public.care_followup_status);


--
-- Name: uq_care_plans_active_screening; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_care_plans_active_screening ON public.tbl_care_plans USING btree (screening_id) WHERE (status <> ALL (ARRAY['CLOSED'::public.care_plan_status, 'SUPERSEDED'::public.care_plan_status]));


--
-- Name: uq_care_return_to_mo_pending_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_care_return_to_mo_pending_patient ON public.tbl_care_return_to_mo USING btree (patient_id) WHERE (confirmed_at IS NULL);


--
-- Name: uq_case_assign_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_case_assign_active ON public.tbl_case_assignments USING btree (patient_id, user_id, COALESCE(referral_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (valid_to IS NULL);


--
-- Name: uq_diagnostic_advice_current_per_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_diagnostic_advice_current_per_order ON public.tbl_diagnostic_advice USING btree (order_id) WHERE (is_current IS TRUE);


--
-- Name: uq_diagnostic_followup_forwarded_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_diagnostic_followup_forwarded_cycle ON public.tbl_diagnostic_advice_followups USING btree (order_id, advice_id, cycle_no) WHERE (status = 'FORWARDED'::text);


--
-- Name: uq_diagnostic_followup_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_diagnostic_followup_idempotency ON public.tbl_diagnostic_advice_followups USING btree (order_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_diagnostic_followup_one_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_diagnostic_followup_one_submitted ON public.tbl_diagnostic_advice_followups USING btree (order_id) WHERE (status = 'SUBMITTED'::text);


--
-- Name: uq_diagnostic_followup_open_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_diagnostic_followup_open_draft ON public.tbl_diagnostic_advice_followups USING btree (order_id, advice_id) WHERE (status = ANY (ARRAY['DRAFT'::text, 'RETURNED'::text]));


--
-- Name: uq_district_admin_setup_one_open_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_district_admin_setup_one_open_token ON public.tbl_district_admin_setup_tokens USING btree (user_id) WHERE ((used_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: uq_districts_lgd_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_districts_lgd_code ON public.mst_districts USING btree (lgd_code) WHERE (lgd_code IS NOT NULL);


--
-- Name: uq_facilities_code_upper; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_facilities_code_upper ON public.mst_facilities USING btree (upper(code)) WHERE (code IS NOT NULL);


--
-- Name: uq_hw_assignment_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_hw_assignment_active ON public.tbl_health_worker_location_assignments USING btree (user_id, village_id, facility_id) WHERE (valid_to IS NULL);


--
-- Name: uq_mandals_lgd_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mandals_lgd_code ON public.mst_mandals USING btree (lgd_code) WHERE (lgd_code IS NOT NULL);


--
-- Name: uq_mo_claim_one_active_per_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mo_claim_one_active_per_patient ON public.tbl_medical_officer_case_claims USING btree (patient_id) WHERE (released_at IS NULL);


--
-- Name: uq_mo_mandal_assignment_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mo_mandal_assignment_active ON public.tbl_medical_officer_mandal_assignments USING btree (user_id, mandal_id) WHERE (valid_to IS NULL);


--
-- Name: uq_reg_015_status_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reg_015_status_token_hash ON public.tbl_user_registration_requests USING btree (status_token_hash) WHERE (status_token_hash IS NOT NULL);


--
-- Name: uq_reg_pending_username; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reg_pending_username ON public.tbl_user_registration_requests USING btree (lower(username)) WHERE (status = 'PENDING'::public.registration_status);


--
-- Name: uq_specialist_availability_active_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_specialist_availability_active_referral ON public.tbl_specialist_availability_requests USING btree (referral_id) WHERE (status = ANY (ARRAY['STAFF_REVIEW'::text, 'PENDING'::text, 'ACCEPTED'::text, 'SUGGESTED'::text]));


--
-- Name: uq_ufa_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ufa_one_primary ON public.tbl_user_facility_assignments USING btree (user_id) WHERE (is_primary AND (valid_to IS NULL));


--
-- Name: uq_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_users_username ON public.tbl_users USING btree (lower(username));


--
-- Name: uq_video_active_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_video_active_slot ON public.tbl_video_consultations USING btree (slot_id) WHERE is_active;


--
-- Name: uq_villages_lgd_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_villages_lgd_code ON public.mst_villages USING btree (lgd_code) WHERE (lgd_code IS NOT NULL);


--
-- Name: tbl_ai_assessments trg_ai_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ai_guard BEFORE INSERT OR UPDATE ON public.tbl_ai_assessments FOR EACH ROW EXECUTE FUNCTION public.fn_ai_guard();


--
-- Name: tbl_hospital_appointments trg_appt_booker_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_appt_booker_role BEFORE INSERT OR UPDATE ON public.tbl_hospital_appointments FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('booked_by', 'MEDICAL_OFFICER,NAVIGATOR,HOSPITAL_STAFF,SPECIALIST');


--
-- Name: tbl_hospital_appointments trg_appt_confirmer_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_appt_confirmer_role BEFORE INSERT OR UPDATE ON public.tbl_hospital_appointments FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('confirmed_by', 'HOSPITAL_STAFF,NAVIGATOR,SPECIALIST');


--
-- Name: tbl_care_discomfort_reports trg_care_discomfort_hw_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_care_discomfort_hw_role BEFORE INSERT OR UPDATE ON public.tbl_care_discomfort_reports FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('reported_by', 'HEALTH_WORKER');


--
-- Name: tbl_care_final_reviews trg_care_final_review_clinician; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_care_final_review_clinician BEFORE INSERT OR UPDATE OF medical_officer_id ON public.tbl_care_final_reviews FOR EACH ROW EXECUTE FUNCTION public.fn_care_final_review_clinician_guard();


--
-- Name: tbl_care_followup_schedules trg_care_followup_hw_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_care_followup_hw_role BEFORE INSERT OR UPDATE ON public.tbl_care_followup_schedules FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('assigned_hw_id', 'HEALTH_WORKER');


--
-- Name: tbl_care_followup_reports trg_care_followup_report_hw_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_care_followup_report_hw_role BEFORE INSERT OR UPDATE ON public.tbl_care_followup_reports FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('reported_by', 'HEALTH_WORKER');


--
-- Name: tbl_care_plans trg_care_plan_mo_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_care_plan_mo_role BEFORE INSERT OR UPDATE ON public.tbl_care_plans FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('responsible_mo_id', 'MEDICAL_OFFICER');


--
-- Name: tbl_care_plans trg_care_plan_navigator_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_care_plan_navigator_role BEFORE INSERT OR UPDATE ON public.tbl_care_plans FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('assigned_navigator_id', 'NAVIGATOR');


--
-- Name: tbl_care_plans trg_care_plan_specialist_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_care_plan_specialist_role BEFORE INSERT OR UPDATE OF responsible_specialist_id ON public.tbl_care_plans FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('responsible_specialist_id', 'SPECIALIST');


--
-- Name: tbl_care_return_to_mo trg_care_return_authorizer_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_care_return_authorizer_role BEFORE INSERT OR UPDATE OF authorized_by ON public.tbl_care_return_to_mo FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('authorized_by', 'SPECIALIST');


--
-- Name: tbl_care_return_to_mo trg_care_return_confirmer_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_care_return_confirmer_role BEFORE INSERT OR UPDATE OF confirmed_by ON public.tbl_care_return_to_mo FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('confirmed_by', 'MEDICAL_OFFICER');


--
-- Name: tbl_case_assignments trg_case_assign_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_case_assign_role BEFORE INSERT OR UPDATE ON public.tbl_case_assignments FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('user_id', 'HEALTH_WORKER,MEDICAL_OFFICER,SPECIALIST,NAVIGATOR,HOSPITAL_STAFF');


--
-- Name: tbl_case_classifications trg_classification_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_classification_guard BEFORE INSERT ON public.tbl_case_classifications FOR EACH ROW EXECUTE FUNCTION public.fn_classification_guard();


--
-- Name: tbl_consultation_notes trg_consult_note_author_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_consult_note_author_role BEFORE INSERT ON public.tbl_consultation_notes FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('author_id', 'SPECIALIST,MEDICAL_OFFICER');


--
-- Name: tbl_diagnostic_advice trg_diagnostic_advice_specialist_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_diagnostic_advice_specialist_role BEFORE INSERT OR UPDATE ON public.tbl_diagnostic_advice FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('specialist_id', 'SPECIALIST');


--
-- Name: tbl_diagnostic_appointments trg_diagnostic_appt_booker_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_diagnostic_appt_booker_role BEFORE INSERT ON public.tbl_diagnostic_appointments FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('booked_by', 'NAVIGATOR,HOSPITAL_STAFF');


--
-- Name: tbl_diagnostic_appointments trg_diagnostic_appt_confirmer_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_diagnostic_appt_confirmer_role BEFORE INSERT OR UPDATE ON public.tbl_diagnostic_appointments FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('confirmed_by', 'HOSPITAL_STAFF');


--
-- Name: tbl_diagnostic_appointment_history trg_diagnostic_appt_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_diagnostic_appt_history_append_only BEFORE DELETE OR UPDATE ON public.tbl_diagnostic_appointment_history FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_diagnostic_orders trg_diagnostic_prescriber_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_diagnostic_prescriber_role BEFORE INSERT ON public.tbl_diagnostic_orders FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('prescribed_by', 'SPECIALIST,MEDICAL_OFFICER');


--
-- Name: mst_facilities trg_facility_location; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_facility_location BEFORE INSERT OR UPDATE ON public.mst_facilities FOR EACH ROW EXECUTE FUNCTION public.fn_facility_location_check();


--
-- Name: tbl_followup_tasks trg_followup_owner_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_followup_owner_role BEFORE INSERT OR UPDATE ON public.tbl_followup_tasks FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('owner_id', 'NAVIGATOR');


--
-- Name: tbl_investigation_orders trg_inv_orderer_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inv_orderer_role BEFORE INSERT ON public.tbl_investigation_orders FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('ordered_by', 'SPECIALIST,MEDICAL_OFFICER');


--
-- Name: tbl_treatment_linkages trg_linkage_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_linkage_role BEFORE INSERT ON public.tbl_treatment_linkages FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('linked_by', 'MEDICAL_OFFICER,SPECIALIST,NAVIGATOR');


--
-- Name: mst_diagnostic_tests trg_mst_diagnostic_tests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mst_diagnostic_tests_updated_at BEFORE UPDATE ON public.mst_diagnostic_tests FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_pathology_reviews trg_pathology_review_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pathology_review_guard BEFORE UPDATE ON public.tbl_pathology_reviews FOR EACH ROW EXECUTE FUNCTION public.fn_pathology_review_guard();


--
-- Name: tbl_pathology_reviews trg_pathology_review_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pathology_review_no_delete BEFORE DELETE ON public.tbl_pathology_reviews FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_pathology_reviews trg_pathology_reviewer_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pathology_reviewer_role BEFORE INSERT OR UPDATE ON public.tbl_pathology_reviews FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('reviewer_id', 'MEDICAL_OFFICER,SPECIALIST');


--
-- Name: tbl_patients trg_patient_registrar_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_patient_registrar_role BEFORE INSERT ON public.tbl_patients FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('registered_by', 'HEALTH_WORKER,MEDICAL_OFFICER');


--
-- Name: tbl_patients trg_patient_set_mandal_and_validate_hw_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_patient_set_mandal_and_validate_hw_assignment BEFORE INSERT OR UPDATE OF village_id, registered_facility_id, registered_by, mandal_id ON public.tbl_patients FOR EACH ROW EXECUTE FUNCTION public.fn_patient_set_mandal_and_validate_hw_assignment();


--
-- Name: tbl_screening_photos trg_photo_requires_consent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_photo_requires_consent BEFORE INSERT ON public.tbl_screening_photos FOR EACH ROW EXECUTE FUNCTION public.fn_require_consent('IMAGE_CAPTURE');


--
-- Name: tbl_referrals trg_referral_author_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_referral_author_role BEFORE INSERT ON public.tbl_referrals FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('created_by', 'MEDICAL_OFFICER');


--
-- Name: tbl_referrals trg_referral_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_referral_guard BEFORE INSERT ON public.tbl_referrals FOR EACH ROW EXECUTE FUNCTION public.fn_referral_guard();


--
-- Name: tbl_referrals trg_referral_navigator_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_referral_navigator_role BEFORE INSERT OR UPDATE ON public.tbl_referrals FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('assigned_navigator_id', 'NAVIGATOR');


--
-- Name: tbl_referrals trg_referral_specialist_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_referral_specialist_role BEFORE INSERT OR UPDATE ON public.tbl_referrals FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('assigned_specialist_id', 'SPECIALIST');


--
-- Name: tbl_user_registration_requests trg_reg_reviewer_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reg_reviewer_role BEFORE INSERT OR UPDATE ON public.tbl_user_registration_requests FOR EACH ROW EXECUTE FUNCTION public.fn_validate_registration_reviewer();


--
-- Name: tbl_clinical_reviews trg_review_doctor_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_review_doctor_role BEFORE INSERT OR UPDATE ON public.tbl_clinical_reviews FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('doctor_id', 'MEDICAL_OFFICER');


--
-- Name: tbl_clinical_reviews trg_review_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_review_guard BEFORE UPDATE ON public.tbl_clinical_reviews FOR EACH ROW EXECUTE FUNCTION public.fn_review_guard();


--
-- Name: tbl_clinical_reviews trg_review_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_review_snapshot AFTER INSERT OR UPDATE ON public.tbl_clinical_reviews FOR EACH ROW EXECUTE FUNCTION public.fn_review_snapshot();


--
-- Name: tbl_screenings trg_screening_consent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_screening_consent BEFORE INSERT OR UPDATE OF consent_id ON public.tbl_screenings FOR EACH ROW EXECUTE FUNCTION public.fn_screening_consent_check();


--
-- Name: tbl_screenings trg_screening_examiner_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_screening_examiner_role BEFORE INSERT OR UPDATE ON public.tbl_screenings FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('examiner_id', 'HEALTH_WORKER,MEDICAL_OFFICER');


--
-- Name: tbl_screenings trg_screening_state; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_screening_state BEFORE UPDATE OF case_state ON public.tbl_screenings FOR EACH ROW EXECUTE FUNCTION public.fn_check_case_transition();


--
-- Name: tbl_consultation_slots trg_slot_specialist_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_slot_specialist_role BEFORE INSERT OR UPDATE ON public.tbl_consultation_slots FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('specialist_id', 'SPECIALIST');


--
-- Name: tbl_specialist_availability_requests trg_specialist_availability_request_canceller_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_specialist_availability_request_canceller_role BEFORE INSERT OR UPDATE ON public.tbl_specialist_availability_requests FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('cancelled_by', 'HOSPITAL_STAFF');


--
-- Name: tbl_specialist_availability_requests trg_specialist_availability_request_confirmer_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_specialist_availability_request_confirmer_role BEFORE INSERT OR UPDATE ON public.tbl_specialist_availability_requests FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('confirmed_by', 'HOSPITAL_STAFF');


--
-- Name: tbl_specialist_availability_requests trg_specialist_availability_request_requester_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_specialist_availability_request_requester_role BEFORE INSERT OR UPDATE ON public.tbl_specialist_availability_requests FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('requested_by', 'HOSPITAL_STAFF,NAVIGATOR');


--
-- Name: tbl_specialist_availability_requests trg_specialist_availability_request_responder_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_specialist_availability_request_responder_role BEFORE INSERT OR UPDATE ON public.tbl_specialist_availability_requests FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('responded_by', 'SPECIALIST');


--
-- Name: tbl_specialist_availability_requests trg_specialist_availability_request_specialist_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_specialist_availability_request_specialist_role BEFORE INSERT OR UPDATE ON public.tbl_specialist_availability_requests FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('specialist_id', 'SPECIALIST');


--
-- Name: tbl_specialist_availability_requests trg_specialist_availability_request_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_specialist_availability_request_updated_at BEFORE UPDATE ON public.tbl_specialist_availability_requests FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_specialist_consultation_decisions trg_specialist_decision_signed_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_specialist_decision_signed_immutable BEFORE DELETE OR UPDATE ON public.tbl_specialist_consultation_decisions FOR EACH ROW EXECUTE FUNCTION public.fn_protect_signed_specialist_decision();


--
-- Name: tbl_specialist_consultation_decisions trg_specialist_decision_signer_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_specialist_decision_signer_role BEFORE INSERT OR UPDATE ON public.tbl_specialist_consultation_decisions FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('signed_by', 'SPECIALIST');


--
-- Name: tbl_specialist_consultation_decisions trg_specialist_decision_specialist_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_specialist_decision_specialist_role BEFORE INSERT OR UPDATE ON public.tbl_specialist_consultation_decisions FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('specialist_id', 'SPECIALIST');


--
-- Name: tbl_specialist_consultation_decisions trg_specialist_decision_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_specialist_decision_updated_at BEFORE UPDATE ON public.tbl_specialist_consultation_decisions FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_ai_assessment_logs trg_tbl_ai_assessment_logs_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_ai_assessment_logs_append_only BEFORE DELETE OR UPDATE ON public.tbl_ai_assessment_logs FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_appointment_status_history trg_tbl_appointment_status_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_appointment_status_history_append_only BEFORE DELETE OR UPDATE ON public.tbl_appointment_status_history FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_audit_logs trg_tbl_audit_logs_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_audit_logs_append_only BEFORE DELETE OR UPDATE ON public.tbl_audit_logs FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_care_discomfort_reports trg_tbl_care_discomfort_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_care_discomfort_reports_updated_at BEFORE UPDATE ON public.tbl_care_discomfort_reports FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_care_followup_schedules trg_tbl_care_followup_schedules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_care_followup_schedules_updated_at BEFORE UPDATE ON public.tbl_care_followup_schedules FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_care_medicines trg_tbl_care_medicines_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_care_medicines_updated_at BEFORE UPDATE ON public.tbl_care_medicines FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_care_plan_status_history trg_tbl_care_plan_status_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_care_plan_status_history_append_only BEFORE DELETE OR UPDATE ON public.tbl_care_plan_status_history FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_care_plans trg_tbl_care_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_care_plans_updated_at BEFORE UPDATE ON public.tbl_care_plans FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_case_classifications trg_tbl_case_classifications_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_case_classifications_append_only BEFORE DELETE OR UPDATE ON public.tbl_case_classifications FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_clinical_review_versions trg_tbl_clinical_review_versions_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_clinical_review_versions_append_only BEFORE DELETE OR UPDATE ON public.tbl_clinical_review_versions FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_clinical_reviews trg_tbl_clinical_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_clinical_reviews_updated_at BEFORE UPDATE ON public.tbl_clinical_reviews FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_consultation_notes trg_tbl_consultation_notes_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_consultation_notes_append_only BEFORE DELETE OR UPDATE ON public.tbl_consultation_notes FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_data_exports trg_tbl_data_exports_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_data_exports_append_only BEFORE DELETE OR UPDATE ON public.tbl_data_exports FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_diagnostic_advice_followups trg_tbl_diagnostic_advice_followups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_diagnostic_advice_followups_updated_at BEFORE UPDATE ON public.tbl_diagnostic_advice_followups FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_diagnostic_advice trg_tbl_diagnostic_advice_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_diagnostic_advice_updated_at BEFORE UPDATE ON public.tbl_diagnostic_advice FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_diagnostic_appointments trg_tbl_diagnostic_appointments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_diagnostic_appointments_updated_at BEFORE UPDATE ON public.tbl_diagnostic_appointments FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_diagnostic_order_items trg_tbl_diagnostic_order_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_diagnostic_order_items_updated_at BEFORE UPDATE ON public.tbl_diagnostic_order_items FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_diagnostic_orders trg_tbl_diagnostic_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_diagnostic_orders_updated_at BEFORE UPDATE ON public.tbl_diagnostic_orders FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_diagnostic_status_history trg_tbl_diagnostic_status_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_diagnostic_status_history_append_only BEFORE DELETE OR UPDATE ON public.tbl_diagnostic_status_history FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_followup_tasks trg_tbl_followup_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_followup_tasks_updated_at BEFORE UPDATE ON public.tbl_followup_tasks FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_hospital_appointments trg_tbl_hospital_appointments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_hospital_appointments_updated_at BEFORE UPDATE ON public.tbl_hospital_appointments FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_investigation_orders trg_tbl_investigation_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_investigation_orders_updated_at BEFORE UPDATE ON public.tbl_investigation_orders FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_investigation_status_history trg_tbl_investigation_status_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_investigation_status_history_append_only BEFORE DELETE OR UPDATE ON public.tbl_investigation_status_history FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_patient_consents trg_tbl_patient_consents_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_patient_consents_append_only BEFORE DELETE OR UPDATE ON public.tbl_patient_consents FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_patient_contact_history trg_tbl_patient_contact_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_patient_contact_history_append_only BEFORE DELETE OR UPDATE ON public.tbl_patient_contact_history FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_patients trg_tbl_patients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_patients_updated_at BEFORE UPDATE ON public.tbl_patients FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_referral_status_history trg_tbl_referral_status_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_referral_status_history_append_only BEFORE DELETE OR UPDATE ON public.tbl_referral_status_history FOR EACH ROW EXECUTE FUNCTION public.fn_block_mutation();


--
-- Name: tbl_referrals trg_tbl_referrals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_referrals_updated_at BEFORE UPDATE ON public.tbl_referrals FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_screenings trg_tbl_screenings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_screenings_updated_at BEFORE UPDATE ON public.tbl_screenings FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_transport_support_records trg_tbl_transport_support_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_transport_support_records_updated_at BEFORE UPDATE ON public.tbl_transport_support_records FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_treatment_linkages trg_tbl_treatment_linkages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_treatment_linkages_updated_at BEFORE UPDATE ON public.tbl_treatment_linkages FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_user_language_preferences trg_tbl_user_language_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_user_language_preferences_updated_at BEFORE UPDATE ON public.tbl_user_language_preferences FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_users trg_tbl_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_users_updated_at BEFORE UPDATE ON public.tbl_users FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_video_consultations trg_tbl_video_consultations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tbl_video_consultations_updated_at BEFORE UPDATE ON public.tbl_video_consultations FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: tbl_health_worker_location_assignments trg_validate_health_worker_location_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_health_worker_location_assignment BEFORE INSERT OR UPDATE OF user_id, district_id, mandal_id, village_id, facility_id ON public.tbl_health_worker_location_assignments FOR EACH ROW EXECUTE FUNCTION public.fn_validate_health_worker_location_assignment();


--
-- Name: tbl_medical_officer_case_claims trg_validate_medical_officer_case_claim; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_medical_officer_case_claim BEFORE INSERT OR UPDATE OF patient_id, medical_officer_id ON public.tbl_medical_officer_case_claims FOR EACH ROW EXECUTE FUNCTION public.fn_validate_medical_officer_case_claim();


--
-- Name: tbl_medical_officer_mandal_assignments trg_validate_medical_officer_mandal_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_medical_officer_mandal_assignment BEFORE INSERT OR UPDATE OF user_id, mandal_id ON public.tbl_medical_officer_mandal_assignments FOR EACH ROW EXECUTE FUNCTION public.fn_validate_medical_officer_mandal_assignment();


--
-- Name: tbl_video_consultations trg_video_requires_consent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_requires_consent BEFORE INSERT ON public.tbl_video_consultations FOR EACH ROW EXECUTE FUNCTION public.fn_require_consent('TELECONSULT');


--
-- Name: tbl_video_consultations trg_video_slot_booked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_slot_booked AFTER INSERT OR UPDATE OF slot_id, is_active ON public.tbl_video_consultations FOR EACH ROW EXECUTE FUNCTION public.fn_video_slot_booked();


--
-- Name: tbl_video_consultations trg_video_slot_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_slot_guard BEFORE INSERT OR UPDATE OF slot_id, specialist_id ON public.tbl_video_consultations FOR EACH ROW EXECUTE FUNCTION public.fn_video_slot_guard();


--
-- Name: tbl_video_consultations trg_video_specialist_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_video_specialist_role BEFORE INSERT OR UPDATE ON public.tbl_video_consultations FOR EACH ROW EXECUTE FUNCTION public.fn_require_role('specialist_id', 'SPECIALIST');


--
-- Name: mst_villages trg_village_mandal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_village_mandal BEFORE INSERT OR UPDATE OF gram_panchayat_id, mandal_id ON public.mst_villages FOR EACH ROW EXECUTE FUNCTION public.fn_village_mandal_from_gp();


--
-- Name: tbl_care_plans fk_care_plans_referral_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT fk_care_plans_referral_patient FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_case_assignments fk_case_assign_referral; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_assignments
    ADD CONSTRAINT fk_case_assign_referral FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_health_worker_location_assignments fk_hw_assignment_facility_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_health_worker_location_assignments
    ADD CONSTRAINT fk_hw_assignment_facility_location FOREIGN KEY (facility_id, district_id, mandal_id) REFERENCES public.mst_facilities(id, district_id, mandal_id);


--
-- Name: tbl_health_worker_location_assignments fk_hw_assignment_mandal_district; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_health_worker_location_assignments
    ADD CONSTRAINT fk_hw_assignment_mandal_district FOREIGN KEY (mandal_id, district_id) REFERENCES public.mst_mandals(id, district_id);


--
-- Name: tbl_health_worker_location_assignments fk_hw_assignment_village_mandal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_health_worker_location_assignments
    ADD CONSTRAINT fk_hw_assignment_village_mandal FOREIGN KEY (village_id, mandal_id) REFERENCES public.mst_villages(id, mandal_id);


--
-- Name: tbl_patients fk_patient_village_mandal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patients
    ADD CONSTRAINT fk_patient_village_mandal FOREIGN KEY (village_id, mandal_id) REFERENCES public.mst_villages(id, mandal_id);


--
-- Name: mst_diagnostic_tests mst_diagnostic_tests_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_diagnostic_tests
    ADD CONSTRAINT mst_diagnostic_tests_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.mst_diagnostic_categories(id);


--
-- Name: mst_diagnostic_tests mst_diagnostic_tests_investigation_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_diagnostic_tests
    ADD CONSTRAINT mst_diagnostic_tests_investigation_type_id_fkey FOREIGN KEY (investigation_type_id) REFERENCES public.mst_investigation_types(id);


--
-- Name: mst_facilities mst_facilities_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_facilities
    ADD CONSTRAINT mst_facilities_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.mst_districts(id);


--
-- Name: mst_facilities mst_facilities_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_facilities
    ADD CONSTRAINT mst_facilities_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.mst_hospitals(id);


--
-- Name: mst_facilities mst_facilities_mandal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_facilities
    ADD CONSTRAINT mst_facilities_mandal_id_fkey FOREIGN KEY (mandal_id) REFERENCES public.mst_mandals(id);


--
-- Name: mst_facilities mst_facilities_phc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_facilities
    ADD CONSTRAINT mst_facilities_phc_id_fkey FOREIGN KEY (phc_id) REFERENCES public.mst_phcs(id);


--
-- Name: mst_facilities mst_facilities_village_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_facilities
    ADD CONSTRAINT mst_facilities_village_id_fkey FOREIGN KEY (village_id) REFERENCES public.mst_villages(id);


--
-- Name: mst_gram_panchayats mst_gram_panchayats_mandal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_gram_panchayats
    ADD CONSTRAINT mst_gram_panchayats_mandal_id_fkey FOREIGN KEY (mandal_id) REFERENCES public.mst_mandals(id);


--
-- Name: mst_hospitals mst_hospitals_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_hospitals
    ADD CONSTRAINT mst_hospitals_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.mst_districts(id);


--
-- Name: mst_mandals mst_mandals_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_mandals
    ADD CONSTRAINT mst_mandals_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.mst_districts(id);


--
-- Name: mst_notification_templates mst_notification_templates_language_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_notification_templates
    ADD CONSTRAINT mst_notification_templates_language_id_fkey FOREIGN KEY (language_id) REFERENCES public.mst_languages(id);


--
-- Name: mst_phcs mst_phcs_mandal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_phcs
    ADD CONSTRAINT mst_phcs_mandal_id_fkey FOREIGN KEY (mandal_id) REFERENCES public.mst_mandals(id);


--
-- Name: mst_screening_sites mst_screening_sites_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_screening_sites
    ADD CONSTRAINT mst_screening_sites_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.mst_facilities(id);


--
-- Name: mst_screening_sites mst_screening_sites_village_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_screening_sites
    ADD CONSTRAINT mst_screening_sites_village_id_fkey FOREIGN KEY (village_id) REFERENCES public.mst_villages(id);


--
-- Name: mst_ui_translations mst_ui_translations_language_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_ui_translations
    ADD CONSTRAINT mst_ui_translations_language_id_fkey FOREIGN KEY (language_id) REFERENCES public.mst_languages(id);


--
-- Name: mst_villages mst_villages_gram_panchayat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_villages
    ADD CONSTRAINT mst_villages_gram_panchayat_id_fkey FOREIGN KEY (gram_panchayat_id) REFERENCES public.mst_gram_panchayats(id);


--
-- Name: mst_villages mst_villages_mandal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_villages
    ADD CONSTRAINT mst_villages_mandal_id_fkey FOREIGN KEY (mandal_id) REFERENCES public.mst_mandals(id);


--
-- Name: tbl_ai_assessment_logs tbl_ai_assessment_logs_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assessment_logs
    ADD CONSTRAINT tbl_ai_assessment_logs_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.tbl_ai_assessments(id);


--
-- Name: tbl_ai_assessments tbl_ai_assessments_ai_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assessments
    ADD CONSTRAINT tbl_ai_assessments_ai_model_id_fkey FOREIGN KEY (ai_model_id) REFERENCES public.mst_ai_models(id);


--
-- Name: tbl_ai_assessments tbl_ai_assessments_photo_id_screening_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assessments
    ADD CONSTRAINT tbl_ai_assessments_photo_id_screening_id_fkey FOREIGN KEY (photo_id, screening_id) REFERENCES public.tbl_screening_photos(id, screening_id);


--
-- Name: tbl_ai_assessments tbl_ai_assessments_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ai_assessments
    ADD CONSTRAINT tbl_ai_assessments_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_appointment_status_history tbl_appointment_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_appointment_status_history
    ADD CONSTRAINT tbl_appointment_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_appointment_status_history tbl_appointment_status_history_from_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_appointment_status_history
    ADD CONSTRAINT tbl_appointment_status_history_from_status_id_fkey FOREIGN KEY (from_status_id) REFERENCES public.mst_appointment_statuses(id);


--
-- Name: tbl_appointment_status_history tbl_appointment_status_history_hospital_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_appointment_status_history
    ADD CONSTRAINT tbl_appointment_status_history_hospital_appointment_id_fkey FOREIGN KEY (hospital_appointment_id) REFERENCES public.tbl_hospital_appointments(id);


--
-- Name: tbl_appointment_status_history tbl_appointment_status_history_to_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_appointment_status_history
    ADD CONSTRAINT tbl_appointment_status_history_to_status_id_fkey FOREIGN KEY (to_status_id) REFERENCES public.mst_appointment_statuses(id);


--
-- Name: tbl_appointment_status_history tbl_appointment_status_history_video_consultation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_appointment_status_history
    ADD CONSTRAINT tbl_appointment_status_history_video_consultation_id_fkey FOREIGN KEY (video_consultation_id) REFERENCES public.tbl_video_consultations(id);


--
-- Name: tbl_audit_logs tbl_audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_audit_logs
    ADD CONSTRAINT tbl_audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_discomfort_reports tbl_care_discomfort_reports_escalated_to_mo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_discomfort_reports
    ADD CONSTRAINT tbl_care_discomfort_reports_escalated_to_mo_fkey FOREIGN KEY (escalated_to_mo) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_discomfort_reports tbl_care_discomfort_reports_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_discomfort_reports
    ADD CONSTRAINT tbl_care_discomfort_reports_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_care_discomfort_reports tbl_care_discomfort_reports_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_discomfort_reports
    ADD CONSTRAINT tbl_care_discomfort_reports_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.tbl_care_plans(id);


--
-- Name: tbl_care_discomfort_reports tbl_care_discomfort_reports_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_discomfort_reports
    ADD CONSTRAINT tbl_care_discomfort_reports_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_final_reviews tbl_care_final_reviews_medical_officer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_final_reviews
    ADD CONSTRAINT tbl_care_final_reviews_medical_officer_id_fkey FOREIGN KEY (medical_officer_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_final_reviews tbl_care_final_reviews_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_final_reviews
    ADD CONSTRAINT tbl_care_final_reviews_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_care_final_reviews tbl_care_final_reviews_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_final_reviews
    ADD CONSTRAINT tbl_care_final_reviews_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.tbl_care_plans(id);


--
-- Name: tbl_care_final_reviews tbl_care_final_reviews_screening_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_final_reviews
    ADD CONSTRAINT tbl_care_final_reviews_screening_id_fkey FOREIGN KEY (screening_id) REFERENCES public.tbl_screenings(id);


--
-- Name: tbl_care_followup_reports tbl_care_followup_reports_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_followup_reports
    ADD CONSTRAINT tbl_care_followup_reports_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_followup_reports tbl_care_followup_reports_schedule_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_followup_reports
    ADD CONSTRAINT tbl_care_followup_reports_schedule_id_patient_id_fkey FOREIGN KEY (schedule_id, patient_id) REFERENCES public.tbl_care_followup_schedules(id, patient_id);


--
-- Name: tbl_care_followup_schedules tbl_care_followup_schedules_assigned_hw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_followup_schedules
    ADD CONSTRAINT tbl_care_followup_schedules_assigned_hw_id_fkey FOREIGN KEY (assigned_hw_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_followup_schedules tbl_care_followup_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_followup_schedules
    ADD CONSTRAINT tbl_care_followup_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_followup_schedules tbl_care_followup_schedules_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_followup_schedules
    ADD CONSTRAINT tbl_care_followup_schedules_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_care_followup_schedules tbl_care_followup_schedules_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_followup_schedules
    ADD CONSTRAINT tbl_care_followup_schedules_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.tbl_care_plans(id);


--
-- Name: tbl_care_medicines tbl_care_medicines_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_medicines
    ADD CONSTRAINT tbl_care_medicines_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_medicines tbl_care_medicines_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_medicines
    ADD CONSTRAINT tbl_care_medicines_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.tbl_care_plans(id);


--
-- Name: tbl_care_plan_status_history tbl_care_plan_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plan_status_history
    ADD CONSTRAINT tbl_care_plan_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_plan_status_history tbl_care_plan_status_history_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plan_status_history
    ADD CONSTRAINT tbl_care_plan_status_history_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.tbl_care_plans(id);


--
-- Name: tbl_care_plans tbl_care_plans_assigned_navigator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_assigned_navigator_id_fkey FOREIGN KEY (assigned_navigator_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_plans tbl_care_plans_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_plans tbl_care_plans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_plans tbl_care_plans_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_care_plans tbl_care_plans_responsible_mo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_responsible_mo_id_fkey FOREIGN KEY (responsible_mo_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_plans tbl_care_plans_responsible_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_responsible_specialist_id_fkey FOREIGN KEY (responsible_specialist_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_plans tbl_care_plans_screening_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_screening_id_fkey FOREIGN KEY (screening_id) REFERENCES public.tbl_screenings(id);


--
-- Name: tbl_care_plans tbl_care_plans_supersedes_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_supersedes_plan_id_fkey FOREIGN KEY (supersedes_plan_id) REFERENCES public.tbl_care_plans(id);


--
-- Name: tbl_care_plans tbl_care_plans_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_plans
    ADD CONSTRAINT tbl_care_plans_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_return_to_mo tbl_care_return_to_mo_authorized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_return_to_mo
    ADD CONSTRAINT tbl_care_return_to_mo_authorized_by_fkey FOREIGN KEY (authorized_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_return_to_mo tbl_care_return_to_mo_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_return_to_mo
    ADD CONSTRAINT tbl_care_return_to_mo_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_care_return_to_mo tbl_care_return_to_mo_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_return_to_mo
    ADD CONSTRAINT tbl_care_return_to_mo_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_care_return_to_mo tbl_care_return_to_mo_referral_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_care_return_to_mo
    ADD CONSTRAINT tbl_care_return_to_mo_referral_id_fkey FOREIGN KEY (referral_id) REFERENCES public.tbl_referrals(id);


--
-- Name: tbl_case_assignments tbl_case_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_assignments
    ADD CONSTRAINT tbl_case_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_case_assignments tbl_case_assignments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_assignments
    ADD CONSTRAINT tbl_case_assignments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_case_assignments tbl_case_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_assignments
    ADD CONSTRAINT tbl_case_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_case_classifications tbl_case_classifications_clinical_review_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_classifications
    ADD CONSTRAINT tbl_case_classifications_clinical_review_id_patient_id_fkey FOREIGN KEY (clinical_review_id, patient_id) REFERENCES public.tbl_clinical_reviews(id, patient_id);


--
-- Name: tbl_case_classifications tbl_case_classifications_pathology_review_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_classifications
    ADD CONSTRAINT tbl_case_classifications_pathology_review_id_patient_id_fkey FOREIGN KEY (pathology_review_id, patient_id) REFERENCES public.tbl_pathology_reviews(id, patient_id);


--
-- Name: tbl_case_classifications tbl_case_classifications_screening_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_classifications
    ADD CONSTRAINT tbl_case_classifications_screening_id_patient_id_fkey FOREIGN KEY (screening_id, patient_id) REFERENCES public.tbl_screenings(id, patient_id);


--
-- Name: tbl_case_classifications tbl_case_classifications_set_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_classifications
    ADD CONSTRAINT tbl_case_classifications_set_by_fkey FOREIGN KEY (set_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_case_escalations tbl_case_escalations_escalated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_escalations
    ADD CONSTRAINT tbl_case_escalations_escalated_by_fkey FOREIGN KEY (escalated_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_case_escalations tbl_case_escalations_escalated_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_escalations
    ADD CONSTRAINT tbl_case_escalations_escalated_to_fkey FOREIGN KEY (escalated_to) REFERENCES public.tbl_users(id);


--
-- Name: tbl_case_escalations tbl_case_escalations_referral_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_escalations
    ADD CONSTRAINT tbl_case_escalations_referral_id_patient_id_fkey FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_case_escalations tbl_case_escalations_task_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_case_escalations
    ADD CONSTRAINT tbl_case_escalations_task_id_patient_id_fkey FOREIGN KEY (task_id, patient_id) REFERENCES public.tbl_followup_tasks(id, patient_id);


--
-- Name: tbl_clinical_review_versions tbl_clinical_review_versions_edited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_clinical_review_versions
    ADD CONSTRAINT tbl_clinical_review_versions_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_clinical_review_versions tbl_clinical_review_versions_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_clinical_review_versions
    ADD CONSTRAINT tbl_clinical_review_versions_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.tbl_clinical_reviews(id);


--
-- Name: tbl_clinical_reviews tbl_clinical_reviews_ai_assessment_id_screening_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_clinical_reviews
    ADD CONSTRAINT tbl_clinical_reviews_ai_assessment_id_screening_id_fkey FOREIGN KEY (ai_assessment_id, screening_id) REFERENCES public.tbl_ai_assessments(id, screening_id);


--
-- Name: tbl_clinical_reviews tbl_clinical_reviews_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_clinical_reviews
    ADD CONSTRAINT tbl_clinical_reviews_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_clinical_reviews tbl_clinical_reviews_screening_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_clinical_reviews
    ADD CONSTRAINT tbl_clinical_reviews_screening_id_patient_id_fkey FOREIGN KEY (screening_id, patient_id) REFERENCES public.tbl_screenings(id, patient_id);


--
-- Name: tbl_consultation_notes tbl_consultation_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_consultation_notes
    ADD CONSTRAINT tbl_consultation_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_consultation_notes tbl_consultation_notes_consultation_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_consultation_notes
    ADD CONSTRAINT tbl_consultation_notes_consultation_id_patient_id_fkey FOREIGN KEY (consultation_id, patient_id) REFERENCES public.tbl_video_consultations(id, patient_id);


--
-- Name: tbl_consultation_slots tbl_consultation_slots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_consultation_slots
    ADD CONSTRAINT tbl_consultation_slots_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_consultation_slots tbl_consultation_slots_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_consultation_slots
    ADD CONSTRAINT tbl_consultation_slots_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.mst_hospitals(id);


--
-- Name: tbl_consultation_slots tbl_consultation_slots_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_consultation_slots
    ADD CONSTRAINT tbl_consultation_slots_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_data_exports tbl_data_exports_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_data_exports
    ADD CONSTRAINT tbl_data_exports_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_data_exports tbl_data_exports_exported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_data_exports
    ADD CONSTRAINT tbl_data_exports_exported_by_fkey FOREIGN KEY (exported_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_demo_datasets tbl_demo_datasets_seeded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_demo_datasets
    ADD CONSTRAINT tbl_demo_datasets_seeded_by_fkey FOREIGN KEY (seeded_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_advice tbl_diagnostic_advice_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice
    ADD CONSTRAINT tbl_diagnostic_advice_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_advice_followups tbl_diagnostic_advice_followups_advice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice_followups
    ADD CONSTRAINT tbl_diagnostic_advice_followups_advice_id_fkey FOREIGN KEY (advice_id) REFERENCES public.tbl_diagnostic_advice(id) ON DELETE CASCADE;


--
-- Name: tbl_diagnostic_advice_followups tbl_diagnostic_advice_followups_forwarded_to_specialist_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice_followups
    ADD CONSTRAINT tbl_diagnostic_advice_followups_forwarded_to_specialist_by_fkey FOREIGN KEY (forwarded_to_specialist_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_advice_followups tbl_diagnostic_advice_followups_health_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice_followups
    ADD CONSTRAINT tbl_diagnostic_advice_followups_health_worker_id_fkey FOREIGN KEY (health_worker_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_advice_followups tbl_diagnostic_advice_followups_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice_followups
    ADD CONSTRAINT tbl_diagnostic_advice_followups_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.tbl_diagnostic_orders(id) ON DELETE CASCADE;


--
-- Name: tbl_diagnostic_advice_followups tbl_diagnostic_advice_followups_order_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice_followups
    ADD CONSTRAINT tbl_diagnostic_advice_followups_order_id_patient_id_fkey FOREIGN KEY (order_id, patient_id) REFERENCES public.tbl_diagnostic_orders(id, patient_id);


--
-- Name: tbl_diagnostic_advice_followups tbl_diagnostic_advice_followups_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice_followups
    ADD CONSTRAINT tbl_diagnostic_advice_followups_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_diagnostic_advice_followups tbl_diagnostic_advice_followups_returned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice_followups
    ADD CONSTRAINT tbl_diagnostic_advice_followups_returned_by_fkey FOREIGN KEY (returned_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_advice_followups tbl_diagnostic_advice_followups_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice_followups
    ADD CONSTRAINT tbl_diagnostic_advice_followups_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_advice tbl_diagnostic_advice_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice
    ADD CONSTRAINT tbl_diagnostic_advice_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.tbl_diagnostic_orders(id) ON DELETE CASCADE;


--
-- Name: tbl_diagnostic_advice tbl_diagnostic_advice_order_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice
    ADD CONSTRAINT tbl_diagnostic_advice_order_id_patient_id_fkey FOREIGN KEY (order_id, patient_id) REFERENCES public.tbl_diagnostic_orders(id, patient_id);


--
-- Name: tbl_diagnostic_advice tbl_diagnostic_advice_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice
    ADD CONSTRAINT tbl_diagnostic_advice_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_diagnostic_advice tbl_diagnostic_advice_signed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice
    ADD CONSTRAINT tbl_diagnostic_advice_signed_by_fkey FOREIGN KEY (signed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_advice tbl_diagnostic_advice_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice
    ADD CONSTRAINT tbl_diagnostic_advice_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_advice tbl_diagnostic_advice_supersedes_advice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_advice
    ADD CONSTRAINT tbl_diagnostic_advice_supersedes_advice_id_fkey FOREIGN KEY (supersedes_advice_id) REFERENCES public.tbl_diagnostic_advice(id);


--
-- Name: tbl_diagnostic_appointment_history tbl_diagnostic_appointment_history_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointment_history
    ADD CONSTRAINT tbl_diagnostic_appointment_history_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.tbl_diagnostic_appointments(id) ON DELETE CASCADE;


--
-- Name: tbl_diagnostic_appointment_history tbl_diagnostic_appointment_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointment_history
    ADD CONSTRAINT tbl_diagnostic_appointment_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_appointment_history tbl_diagnostic_appointment_history_from_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointment_history
    ADD CONSTRAINT tbl_diagnostic_appointment_history_from_status_id_fkey FOREIGN KEY (from_status_id) REFERENCES public.mst_appointment_statuses(id);


--
-- Name: tbl_diagnostic_appointment_history tbl_diagnostic_appointment_history_to_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointment_history
    ADD CONSTRAINT tbl_diagnostic_appointment_history_to_status_id_fkey FOREIGN KEY (to_status_id) REFERENCES public.mst_appointment_statuses(id);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_booked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_booked_by_fkey FOREIGN KEY (booked_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_diagnostic_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_diagnostic_order_id_fkey FOREIGN KEY (diagnostic_order_id) REFERENCES public.tbl_diagnostic_orders(id);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_diagnostic_order_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_diagnostic_order_id_patient_id_fkey FOREIGN KEY (diagnostic_order_id, patient_id) REFERENCES public.tbl_diagnostic_orders(id, patient_id);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.mst_facilities(id);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_rescheduled_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_rescheduled_from_id_fkey FOREIGN KEY (rescheduled_from_id) REFERENCES public.tbl_diagnostic_appointments(id);


--
-- Name: tbl_diagnostic_appointments tbl_diagnostic_appointments_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_appointments
    ADD CONSTRAINT tbl_diagnostic_appointments_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.mst_appointment_statuses(id);


--
-- Name: tbl_diagnostic_order_items tbl_diagnostic_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_items
    ADD CONSTRAINT tbl_diagnostic_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.tbl_diagnostic_orders(id) ON DELETE CASCADE;


--
-- Name: tbl_diagnostic_order_items tbl_diagnostic_order_items_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_items
    ADD CONSTRAINT tbl_diagnostic_order_items_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.mst_investigation_statuses(id);


--
-- Name: tbl_diagnostic_order_items tbl_diagnostic_order_items_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_items
    ADD CONSTRAINT tbl_diagnostic_order_items_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.mst_diagnostic_tests(id);


--
-- Name: tbl_diagnostic_order_reports tbl_diagnostic_order_reports_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_reports
    ADD CONSTRAINT tbl_diagnostic_order_reports_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.tbl_diagnostic_orders(id) ON DELETE CASCADE;


--
-- Name: tbl_diagnostic_order_reports tbl_diagnostic_order_reports_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_reports
    ADD CONSTRAINT tbl_diagnostic_order_reports_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_diagnostic_order_reports tbl_diagnostic_order_reports_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_reports
    ADD CONSTRAINT tbl_diagnostic_order_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_order_reports tbl_diagnostic_order_reports_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_order_reports
    ADD CONSTRAINT tbl_diagnostic_order_reports_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_advice_forwarded_to_hw_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_advice_forwarded_to_hw_by_fkey FOREIGN KEY (advice_forwarded_to_hw_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_assigned_health_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_assigned_health_worker_id_fkey FOREIGN KEY (assigned_health_worker_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_case_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_case_closed_by_fkey FOREIGN KEY (case_closed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.mst_facilities(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_followup_forwarded_to_specialist_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_followup_forwarded_to_specialist_by_fkey FOREIGN KEY (followup_forwarded_to_specialist_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_forwarded_to_hs_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_forwarded_to_hs_by_fkey FOREIGN KEY (forwarded_to_hs_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_prescribed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_prescribed_by_fkey FOREIGN KEY (prescribed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_reassessment_source_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_reassessment_source_order_id_fkey FOREIGN KEY (reassessment_source_order_id) REFERENCES public.tbl_diagnostic_orders(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_referral_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_referral_id_patient_id_fkey FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_routed_to_specialist_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_routed_to_specialist_by_fkey FOREIGN KEY (routed_to_specialist_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_orders tbl_diagnostic_orders_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_orders
    ADD CONSTRAINT tbl_diagnostic_orders_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.mst_investigation_statuses(id);


--
-- Name: tbl_diagnostic_status_history tbl_diagnostic_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_status_history
    ADD CONSTRAINT tbl_diagnostic_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_diagnostic_status_history tbl_diagnostic_status_history_from_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_status_history
    ADD CONSTRAINT tbl_diagnostic_status_history_from_status_id_fkey FOREIGN KEY (from_status_id) REFERENCES public.mst_investigation_statuses(id);


--
-- Name: tbl_diagnostic_status_history tbl_diagnostic_status_history_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_status_history
    ADD CONSTRAINT tbl_diagnostic_status_history_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.tbl_diagnostic_order_items(id) ON DELETE CASCADE;


--
-- Name: tbl_diagnostic_status_history tbl_diagnostic_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_status_history
    ADD CONSTRAINT tbl_diagnostic_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.tbl_diagnostic_orders(id) ON DELETE CASCADE;


--
-- Name: tbl_diagnostic_status_history tbl_diagnostic_status_history_to_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diagnostic_status_history
    ADD CONSTRAINT tbl_diagnostic_status_history_to_status_id_fkey FOREIGN KEY (to_status_id) REFERENCES public.mst_investigation_statuses(id);


--
-- Name: tbl_district_admin_setup_tokens tbl_district_admin_setup_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_district_admin_setup_tokens
    ADD CONSTRAINT tbl_district_admin_setup_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_district_admin_setup_tokens tbl_district_admin_setup_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_district_admin_setup_tokens
    ADD CONSTRAINT tbl_district_admin_setup_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_followup_tasks tbl_followup_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_followup_tasks
    ADD CONSTRAINT tbl_followup_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_followup_tasks tbl_followup_tasks_missed_reason_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_followup_tasks
    ADD CONSTRAINT tbl_followup_tasks_missed_reason_id_fkey FOREIGN KEY (missed_reason_id) REFERENCES public.mst_missed_reasons(id);


--
-- Name: tbl_followup_tasks tbl_followup_tasks_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_followup_tasks
    ADD CONSTRAINT tbl_followup_tasks_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_followup_tasks tbl_followup_tasks_referral_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_followup_tasks
    ADD CONSTRAINT tbl_followup_tasks_referral_id_patient_id_fkey FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_followup_tasks tbl_followup_tasks_related_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_followup_tasks
    ADD CONSTRAINT tbl_followup_tasks_related_appointment_id_fkey FOREIGN KEY (related_appointment_id) REFERENCES public.tbl_hospital_appointments(id);


--
-- Name: tbl_followup_tasks tbl_followup_tasks_related_investigation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_followup_tasks
    ADD CONSTRAINT tbl_followup_tasks_related_investigation_id_fkey FOREIGN KEY (related_investigation_id) REFERENCES public.tbl_investigation_orders(id);


--
-- Name: tbl_followup_tasks tbl_followup_tasks_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_followup_tasks
    ADD CONSTRAINT tbl_followup_tasks_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.mst_followup_statuses(id);


--
-- Name: tbl_health_worker_location_assignments tbl_health_worker_location_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_health_worker_location_assignments
    ADD CONSTRAINT tbl_health_worker_location_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_health_worker_location_assignments tbl_health_worker_location_assignments_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_health_worker_location_assignments
    ADD CONSTRAINT tbl_health_worker_location_assignments_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.mst_districts(id);


--
-- Name: tbl_health_worker_location_assignments tbl_health_worker_location_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_health_worker_location_assignments
    ADD CONSTRAINT tbl_health_worker_location_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_booked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_booked_by_fkey FOREIGN KEY (booked_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.mst_hospitals(id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_missed_reason_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_missed_reason_id_fkey FOREIGN KEY (missed_reason_id) REFERENCES public.mst_missed_reasons(id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_outcome_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_outcome_recorded_by_fkey FOREIGN KEY (outcome_recorded_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_referral_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_referral_id_patient_id_fkey FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_rescheduled_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_rescheduled_from_id_fkey FOREIGN KEY (rescheduled_from_id) REFERENCES public.tbl_hospital_appointments(id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_specialty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_specialty_id_fkey FOREIGN KEY (specialty_id) REFERENCES public.mst_specialties(id);


--
-- Name: tbl_hospital_appointments tbl_hospital_appointments_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hospital_appointments
    ADD CONSTRAINT tbl_hospital_appointments_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.mst_appointment_statuses(id);


--
-- Name: tbl_image_quality_results tbl_image_quality_results_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_image_quality_results
    ADD CONSTRAINT tbl_image_quality_results_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.tbl_screening_photos(id);


--
-- Name: tbl_investigation_orders tbl_investigation_orders_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_orders
    ADD CONSTRAINT tbl_investigation_orders_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.mst_hospitals(id);


--
-- Name: tbl_investigation_orders tbl_investigation_orders_investigation_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_orders
    ADD CONSTRAINT tbl_investigation_orders_investigation_type_id_fkey FOREIGN KEY (investigation_type_id) REFERENCES public.mst_investigation_types(id);


--
-- Name: tbl_investigation_orders tbl_investigation_orders_ordered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_orders
    ADD CONSTRAINT tbl_investigation_orders_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_investigation_orders tbl_investigation_orders_referral_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_orders
    ADD CONSTRAINT tbl_investigation_orders_referral_id_patient_id_fkey FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_investigation_orders tbl_investigation_orders_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_orders
    ADD CONSTRAINT tbl_investigation_orders_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.mst_investigation_statuses(id);


--
-- Name: tbl_investigation_status_history tbl_investigation_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_status_history
    ADD CONSTRAINT tbl_investigation_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_investigation_status_history tbl_investigation_status_history_from_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_status_history
    ADD CONSTRAINT tbl_investigation_status_history_from_status_id_fkey FOREIGN KEY (from_status_id) REFERENCES public.mst_investigation_statuses(id);


--
-- Name: tbl_investigation_status_history tbl_investigation_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_status_history
    ADD CONSTRAINT tbl_investigation_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.tbl_investigation_orders(id);


--
-- Name: tbl_investigation_status_history tbl_investigation_status_history_to_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_investigation_status_history
    ADD CONSTRAINT tbl_investigation_status_history_to_status_id_fkey FOREIGN KEY (to_status_id) REFERENCES public.mst_investigation_statuses(id);


--
-- Name: tbl_location_import_batches tbl_location_import_batches_imported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_location_import_batches
    ADD CONSTRAINT tbl_location_import_batches_imported_by_fkey FOREIGN KEY (imported_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_medical_officer_case_claims tbl_medical_officer_case_claims_medical_officer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_medical_officer_case_claims
    ADD CONSTRAINT tbl_medical_officer_case_claims_medical_officer_id_fkey FOREIGN KEY (medical_officer_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_medical_officer_case_claims tbl_medical_officer_case_claims_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_medical_officer_case_claims
    ADD CONSTRAINT tbl_medical_officer_case_claims_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_medical_officer_case_claims tbl_medical_officer_case_claims_released_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_medical_officer_case_claims
    ADD CONSTRAINT tbl_medical_officer_case_claims_released_by_fkey FOREIGN KEY (released_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_medical_officer_mandal_assignments tbl_medical_officer_mandal_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_medical_officer_mandal_assignments
    ADD CONSTRAINT tbl_medical_officer_mandal_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_medical_officer_mandal_assignments tbl_medical_officer_mandal_assignments_mandal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_medical_officer_mandal_assignments
    ADD CONSTRAINT tbl_medical_officer_mandal_assignments_mandal_id_fkey FOREIGN KEY (mandal_id) REFERENCES public.mst_mandals(id);


--
-- Name: tbl_medical_officer_mandal_assignments tbl_medical_officer_mandal_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_medical_officer_mandal_assignments
    ADD CONSTRAINT tbl_medical_officer_mandal_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_notifications tbl_notifications_language_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT tbl_notifications_language_id_fkey FOREIGN KEY (language_id) REFERENCES public.mst_languages(id);


--
-- Name: tbl_notifications tbl_notifications_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT tbl_notifications_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_notifications tbl_notifications_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT tbl_notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_notifications tbl_notifications_related_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT tbl_notifications_related_appointment_id_fkey FOREIGN KEY (related_appointment_id) REFERENCES public.tbl_hospital_appointments(id);


--
-- Name: tbl_notifications tbl_notifications_related_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT tbl_notifications_related_task_id_fkey FOREIGN KEY (related_task_id) REFERENCES public.tbl_followup_tasks(id);


--
-- Name: tbl_notifications tbl_notifications_related_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT tbl_notifications_related_video_id_fkey FOREIGN KEY (related_video_id) REFERENCES public.tbl_video_consultations(id);


--
-- Name: tbl_notifications tbl_notifications_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_notifications
    ADD CONSTRAINT tbl_notifications_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.mst_notification_templates(id);


--
-- Name: tbl_offline_sync_queue tbl_offline_sync_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_offline_sync_queue
    ADD CONSTRAINT tbl_offline_sync_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_password_reset_tokens tbl_password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_password_reset_tokens
    ADD CONSTRAINT tbl_password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_pathology_reports tbl_pathology_reports_order_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pathology_reports
    ADD CONSTRAINT tbl_pathology_reports_order_id_patient_id_fkey FOREIGN KEY (order_id, patient_id) REFERENCES public.tbl_investigation_orders(id, patient_id);


--
-- Name: tbl_pathology_reports tbl_pathology_reports_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pathology_reports
    ADD CONSTRAINT tbl_pathology_reports_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_pathology_reviews tbl_pathology_reviews_report_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pathology_reviews
    ADD CONSTRAINT tbl_pathology_reviews_report_id_patient_id_fkey FOREIGN KEY (report_id, patient_id) REFERENCES public.tbl_pathology_reports(id, patient_id);


--
-- Name: tbl_pathology_reviews tbl_pathology_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pathology_reviews
    ADD CONSTRAINT tbl_pathology_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_pathology_reviews tbl_pathology_reviews_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pathology_reviews
    ADD CONSTRAINT tbl_pathology_reviews_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES public.tbl_pathology_reviews(id);


--
-- Name: tbl_patient_consents tbl_patient_consents_captured_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_consents
    ADD CONSTRAINT tbl_patient_consents_captured_by_fkey FOREIGN KEY (captured_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_patient_consents tbl_patient_consents_language_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_consents
    ADD CONSTRAINT tbl_patient_consents_language_id_fkey FOREIGN KEY (language_id) REFERENCES public.mst_languages(id);


--
-- Name: tbl_patient_consents tbl_patient_consents_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_consents
    ADD CONSTRAINT tbl_patient_consents_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_patient_consents tbl_patient_consents_purpose_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_consents
    ADD CONSTRAINT tbl_patient_consents_purpose_id_fkey FOREIGN KEY (purpose_id) REFERENCES public.mst_consent_purposes(id);


--
-- Name: tbl_patient_contact_history tbl_patient_contact_history_contacted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_contact_history
    ADD CONSTRAINT tbl_patient_contact_history_contacted_by_fkey FOREIGN KEY (contacted_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_patient_contact_history tbl_patient_contact_history_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_contact_history
    ADD CONSTRAINT tbl_patient_contact_history_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_patient_contact_history tbl_patient_contact_history_task_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_contact_history
    ADD CONSTRAINT tbl_patient_contact_history_task_id_patient_id_fkey FOREIGN KEY (task_id, patient_id) REFERENCES public.tbl_followup_tasks(id, patient_id);


--
-- Name: tbl_patient_duplicate_flags tbl_patient_duplicate_flags_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_duplicate_flags
    ADD CONSTRAINT tbl_patient_duplicate_flags_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_patient_duplicate_flags tbl_patient_duplicate_flags_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_duplicate_flags
    ADD CONSTRAINT tbl_patient_duplicate_flags_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_patient_duplicate_flags tbl_patient_duplicate_flags_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_duplicate_flags
    ADD CONSTRAINT tbl_patient_duplicate_flags_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_patient_medical_histories tbl_patient_medical_histories_exposure_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_medical_histories
    ADD CONSTRAINT tbl_patient_medical_histories_exposure_type_id_fkey FOREIGN KEY (exposure_type_id) REFERENCES public.mst_exposure_types(id);


--
-- Name: tbl_patient_medical_histories tbl_patient_medical_histories_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_medical_histories
    ADD CONSTRAINT tbl_patient_medical_histories_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_patient_medical_histories tbl_patient_medical_histories_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patient_medical_histories
    ADD CONSTRAINT tbl_patient_medical_histories_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_patients tbl_patients_mandal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patients
    ADD CONSTRAINT tbl_patients_mandal_id_fkey FOREIGN KEY (mandal_id) REFERENCES public.mst_mandals(id);


--
-- Name: tbl_patients tbl_patients_phc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patients
    ADD CONSTRAINT tbl_patients_phc_id_fkey FOREIGN KEY (phc_id) REFERENCES public.mst_phcs(id);


--
-- Name: tbl_patients tbl_patients_preferred_language_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patients
    ADD CONSTRAINT tbl_patients_preferred_language_id_fkey FOREIGN KEY (preferred_language_id) REFERENCES public.mst_languages(id);


--
-- Name: tbl_patients tbl_patients_registered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patients
    ADD CONSTRAINT tbl_patients_registered_by_fkey FOREIGN KEY (registered_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_patients tbl_patients_registered_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patients
    ADD CONSTRAINT tbl_patients_registered_facility_id_fkey FOREIGN KEY (registered_facility_id) REFERENCES public.mst_facilities(id);


--
-- Name: tbl_patients tbl_patients_village_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_patients
    ADD CONSTRAINT tbl_patients_village_id_fkey FOREIGN KEY (village_id) REFERENCES public.mst_villages(id);


--
-- Name: tbl_referral_slips tbl_referral_slips_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referral_slips
    ADD CONSTRAINT tbl_referral_slips_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_referral_slips tbl_referral_slips_language_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referral_slips
    ADD CONSTRAINT tbl_referral_slips_language_id_fkey FOREIGN KEY (language_id) REFERENCES public.mst_languages(id);


--
-- Name: tbl_referral_slips tbl_referral_slips_referral_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referral_slips
    ADD CONSTRAINT tbl_referral_slips_referral_id_fkey FOREIGN KEY (referral_id) REFERENCES public.tbl_referrals(id);


--
-- Name: tbl_referral_status_history tbl_referral_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referral_status_history
    ADD CONSTRAINT tbl_referral_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_referral_status_history tbl_referral_status_history_referral_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referral_status_history
    ADD CONSTRAINT tbl_referral_status_history_referral_id_fkey FOREIGN KEY (referral_id) REFERENCES public.tbl_referrals(id);


--
-- Name: tbl_referrals tbl_referrals_assessment_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_assessment_completed_by_fkey FOREIGN KEY (assessment_completed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_referrals tbl_referrals_assigned_navigator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_assigned_navigator_id_fkey FOREIGN KEY (assigned_navigator_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_referrals tbl_referrals_assigned_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_assigned_specialist_id_fkey FOREIGN KEY (assigned_specialist_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_referrals tbl_referrals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_referrals tbl_referrals_from_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_from_facility_id_fkey FOREIGN KEY (from_facility_id) REFERENCES public.mst_facilities(id);


--
-- Name: tbl_referrals tbl_referrals_priority_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_priority_id_fkey FOREIGN KEY (priority_id) REFERENCES public.mst_referral_priorities(id);


--
-- Name: tbl_referrals tbl_referrals_review_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_review_id_patient_id_fkey FOREIGN KEY (review_id, patient_id) REFERENCES public.tbl_clinical_reviews(id, patient_id);


--
-- Name: tbl_referrals tbl_referrals_specialty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_specialty_id_fkey FOREIGN KEY (specialty_id) REFERENCES public.mst_specialties(id);


--
-- Name: tbl_referrals tbl_referrals_to_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_referrals
    ADD CONSTRAINT tbl_referrals_to_hospital_id_fkey FOREIGN KEY (to_hospital_id) REFERENCES public.mst_hospitals(id);


--
-- Name: tbl_role_permissions tbl_role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_role_permissions
    ADD CONSTRAINT tbl_role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.mst_permissions(id);


--
-- Name: tbl_role_permissions tbl_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_role_permissions
    ADD CONSTRAINT tbl_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.mst_roles(id);


--
-- Name: tbl_screening_findings tbl_screening_findings_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_findings
    ADD CONSTRAINT tbl_screening_findings_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_screening_findings tbl_screening_findings_screening_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_findings
    ADD CONSTRAINT tbl_screening_findings_screening_id_fkey FOREIGN KEY (screening_id) REFERENCES public.tbl_screenings(id);


--
-- Name: tbl_screening_findings tbl_screening_findings_symptom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_findings
    ADD CONSTRAINT tbl_screening_findings_symptom_id_fkey FOREIGN KEY (symptom_id) REFERENCES public.mst_symptoms(id);


--
-- Name: tbl_screening_photos tbl_screening_photos_captured_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_photos
    ADD CONSTRAINT tbl_screening_photos_captured_by_fkey FOREIGN KEY (captured_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_screening_photos tbl_screening_photos_screening_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_photos
    ADD CONSTRAINT tbl_screening_photos_screening_id_patient_id_fkey FOREIGN KEY (screening_id, patient_id) REFERENCES public.tbl_screenings(id, patient_id);


--
-- Name: tbl_screening_photos tbl_screening_photos_supersedes_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screening_photos
    ADD CONSTRAINT tbl_screening_photos_supersedes_photo_id_fkey FOREIGN KEY (supersedes_photo_id) REFERENCES public.tbl_screening_photos(id);


--
-- Name: tbl_screenings tbl_screenings_consent_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screenings
    ADD CONSTRAINT tbl_screenings_consent_id_patient_id_fkey FOREIGN KEY (consent_id, patient_id) REFERENCES public.tbl_patient_consents(id, patient_id);


--
-- Name: tbl_screenings tbl_screenings_examiner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screenings
    ADD CONSTRAINT tbl_screenings_examiner_id_fkey FOREIGN KEY (examiner_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_screenings tbl_screenings_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screenings
    ADD CONSTRAINT tbl_screenings_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.mst_facilities(id);


--
-- Name: tbl_screenings tbl_screenings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screenings
    ADD CONSTRAINT tbl_screenings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.tbl_patients(id);


--
-- Name: tbl_screenings tbl_screenings_screening_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_screenings
    ADD CONSTRAINT tbl_screenings_screening_site_id_fkey FOREIGN KEY (screening_site_id) REFERENCES public.mst_screening_sites(id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_request_referral_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_request_referral_id_patient_id_fkey FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.mst_hospitals(id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_rescheduled_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_rescheduled_from_id_fkey FOREIGN KEY (rescheduled_from_id) REFERENCES public.tbl_specialist_availability_requests(id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_responded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.tbl_consultation_slots(id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_specialty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_specialty_id_fkey FOREIGN KEY (specialty_id) REFERENCES public.mst_specialties(id);


--
-- Name: tbl_specialist_availability_requests tbl_specialist_availability_requests_video_consultation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_video_consultation_id_fkey FOREIGN KEY (video_consultation_id) REFERENCES public.tbl_video_consultations(id);


--
-- Name: tbl_specialist_consultation_decisions tbl_specialist_consultation_decisio_investigation_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_consultation_decisions
    ADD CONSTRAINT tbl_specialist_consultation_decisio_investigation_order_id_fkey FOREIGN KEY (investigation_order_id) REFERENCES public.tbl_investigation_orders(id);


--
-- Name: tbl_specialist_consultation_decisions tbl_specialist_consultation_decisio_referral_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_consultation_decisions
    ADD CONSTRAINT tbl_specialist_consultation_decisio_referral_id_patient_id_fkey FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_specialist_consultation_decisions tbl_specialist_consultation_decision_investigation_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_consultation_decisions
    ADD CONSTRAINT tbl_specialist_consultation_decision_investigation_type_id_fkey FOREIGN KEY (investigation_type_id) REFERENCES public.mst_investigation_types(id);


--
-- Name: tbl_specialist_consultation_decisions tbl_specialist_consultation_decisions_consultation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_consultation_decisions
    ADD CONSTRAINT tbl_specialist_consultation_decisions_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.tbl_video_consultations(id);


--
-- Name: tbl_specialist_consultation_decisions tbl_specialist_consultation_decisions_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_consultation_decisions
    ADD CONSTRAINT tbl_specialist_consultation_decisions_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.mst_hospitals(id);


--
-- Name: tbl_specialist_consultation_decisions tbl_specialist_consultation_decisions_priority_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_consultation_decisions
    ADD CONSTRAINT tbl_specialist_consultation_decisions_priority_id_fkey FOREIGN KEY (priority_id) REFERENCES public.mst_referral_priorities(id);


--
-- Name: tbl_specialist_consultation_decisions tbl_specialist_consultation_decisions_signed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_consultation_decisions
    ADD CONSTRAINT tbl_specialist_consultation_decisions_signed_by_fkey FOREIGN KEY (signed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_specialist_consultation_decisions tbl_specialist_consultation_decisions_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_specialist_consultation_decisions
    ADD CONSTRAINT tbl_specialist_consultation_decisions_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_sync_conflicts tbl_sync_conflicts_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sync_conflicts
    ADD CONSTRAINT tbl_sync_conflicts_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.tbl_offline_sync_queue(id);


--
-- Name: tbl_sync_conflicts tbl_sync_conflicts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sync_conflicts
    ADD CONSTRAINT tbl_sync_conflicts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_system_error_logs tbl_system_error_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_system_error_logs
    ADD CONSTRAINT tbl_system_error_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_transport_support_records tbl_transport_support_records_arranged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_transport_support_records
    ADD CONSTRAINT tbl_transport_support_records_arranged_by_fkey FOREIGN KEY (arranged_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_transport_support_records tbl_transport_support_records_from_village_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_transport_support_records
    ADD CONSTRAINT tbl_transport_support_records_from_village_id_fkey FOREIGN KEY (from_village_id) REFERENCES public.mst_villages(id);


--
-- Name: tbl_transport_support_records tbl_transport_support_records_referral_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_transport_support_records
    ADD CONSTRAINT tbl_transport_support_records_referral_id_patient_id_fkey FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_transport_support_records tbl_transport_support_records_task_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_transport_support_records
    ADD CONSTRAINT tbl_transport_support_records_task_id_patient_id_fkey FOREIGN KEY (task_id, patient_id) REFERENCES public.tbl_followup_tasks(id, patient_id);


--
-- Name: tbl_transport_support_records tbl_transport_support_records_to_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_transport_support_records
    ADD CONSTRAINT tbl_transport_support_records_to_hospital_id_fkey FOREIGN KEY (to_hospital_id) REFERENCES public.mst_hospitals(id);


--
-- Name: tbl_treatment_linkages tbl_treatment_linkages_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_treatment_linkages
    ADD CONSTRAINT tbl_treatment_linkages_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.mst_hospitals(id);


--
-- Name: tbl_treatment_linkages tbl_treatment_linkages_linked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_treatment_linkages
    ADD CONSTRAINT tbl_treatment_linkages_linked_by_fkey FOREIGN KEY (linked_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_treatment_linkages tbl_treatment_linkages_pathology_review_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_treatment_linkages
    ADD CONSTRAINT tbl_treatment_linkages_pathology_review_id_patient_id_fkey FOREIGN KEY (pathology_review_id, patient_id) REFERENCES public.tbl_pathology_reviews(id, patient_id);


--
-- Name: tbl_treatment_linkages tbl_treatment_linkages_referral_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_treatment_linkages
    ADD CONSTRAINT tbl_treatment_linkages_referral_id_patient_id_fkey FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_user_facility_assignments tbl_user_facility_assignments_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_facility_assignments
    ADD CONSTRAINT tbl_user_facility_assignments_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.mst_facilities(id);


--
-- Name: tbl_user_facility_assignments tbl_user_facility_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_facility_assignments
    ADD CONSTRAINT tbl_user_facility_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_user_language_preferences tbl_user_language_preferences_language_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_language_preferences
    ADD CONSTRAINT tbl_user_language_preferences_language_id_fkey FOREIGN KEY (language_id) REFERENCES public.mst_languages(id);


--
-- Name: tbl_user_language_preferences tbl_user_language_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_language_preferences
    ADD CONSTRAINT tbl_user_language_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_user_registration_requests tbl_user_registration_requests_created_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_registration_requests
    ADD CONSTRAINT tbl_user_registration_requests_created_user_id_fkey FOREIGN KEY (created_user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_user_registration_requests tbl_user_registration_requests_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_registration_requests
    ADD CONSTRAINT tbl_user_registration_requests_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.mst_facilities(id);


--
-- Name: tbl_user_registration_requests tbl_user_registration_requests_language_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_registration_requests
    ADD CONSTRAINT tbl_user_registration_requests_language_id_fkey FOREIGN KEY (language_id) REFERENCES public.mst_languages(id);


--
-- Name: tbl_user_registration_requests tbl_user_registration_requests_mandal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_registration_requests
    ADD CONSTRAINT tbl_user_registration_requests_mandal_id_fkey FOREIGN KEY (mandal_id) REFERENCES public.mst_mandals(id);


--
-- Name: tbl_user_registration_requests tbl_user_registration_requests_mo_recommended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_registration_requests
    ADD CONSTRAINT tbl_user_registration_requests_mo_recommended_by_fkey FOREIGN KEY (mo_recommended_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_user_registration_requests tbl_user_registration_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_registration_requests
    ADD CONSTRAINT tbl_user_registration_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_user_registration_requests tbl_user_registration_requests_village_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_registration_requests
    ADD CONSTRAINT tbl_user_registration_requests_village_id_fkey FOREIGN KEY (village_id) REFERENCES public.mst_villages(id);


--
-- Name: tbl_user_sessions tbl_user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_sessions
    ADD CONSTRAINT tbl_user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_users tbl_users_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_users
    ADD CONSTRAINT tbl_users_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.mst_districts(id);


--
-- Name: tbl_users tbl_users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_users
    ADD CONSTRAINT tbl_users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.mst_roles(id);


--
-- Name: tbl_video_consultations tbl_video_consultations_referral_id_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_consultations
    ADD CONSTRAINT tbl_video_consultations_referral_id_patient_id_fkey FOREIGN KEY (referral_id, patient_id) REFERENCES public.tbl_referrals(id, patient_id);


--
-- Name: tbl_video_consultations tbl_video_consultations_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_consultations
    ADD CONSTRAINT tbl_video_consultations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.tbl_users(id);


--
-- Name: tbl_video_consultations tbl_video_consultations_rescheduled_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_consultations
    ADD CONSTRAINT tbl_video_consultations_rescheduled_from_id_fkey FOREIGN KEY (rescheduled_from_id) REFERENCES public.tbl_video_consultations(id);


--
-- Name: tbl_video_consultations tbl_video_consultations_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_consultations
    ADD CONSTRAINT tbl_video_consultations_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.tbl_consultation_slots(id);


--
-- Name: tbl_video_consultations tbl_video_consultations_specialist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_consultations
    ADD CONSTRAINT tbl_video_consultations_specialist_id_fkey FOREIGN KEY (specialist_id) REFERENCES public.tbl_users(id);


--
-- Name: tbl_video_consultations tbl_video_consultations_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_consultations
    ADD CONSTRAINT tbl_video_consultations_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.mst_appointment_statuses(id);


--
-- Name: tbl_video_join_tokens tbl_video_join_tokens_consultation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_join_tokens
    ADD CONSTRAINT tbl_video_join_tokens_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.tbl_video_consultations(id);


--
-- Name: tbl_video_join_tokens tbl_video_join_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_video_join_tokens
    ADD CONSTRAINT tbl_video_join_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.tbl_users(id);


--
-- PostgreSQL database dump complete
--





--
-- PostgreSQL database dump
--






SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: mst_ai_models; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_ai_models (id, provider, model_version, description, permitted_use, validation_status, supports_localization, dataset_card_ref, model_card_ref, is_research_only, clinical_use, is_active, created_at) OVERRIDING SYSTEM VALUE VALUES
	(1, 'mock', 'mock-v1', 'Mock adapter returning fixed example labels. NOT FOR CLINICAL USE', 'Hackathon demonstration only - NOT FOR CLINICAL USE', 'NOT_VALIDATED', false, NULL, NULL, true, false, true, '2026-10-31 17:01:20.369913+05:30'),
	(2, 'ollama-cloud', 'gemma4:cloud', 'General-purpose cloud vision model for preliminary visual observations; not trained or validated for oral disease diagnosis.', 'Preliminary screening support only - NOT FOR CLINICAL USE', 'NOT_VALIDATED', false, NULL, NULL, true, false, true, '2026-11-08 09:01:45.67759+05:30'),
	(3, 'ollama-cloud', 'gemma4:31b-cloud', 'Ollama Cloud Gemma 4 31B - research-only hackathon demonstration', 'Hackathon demonstration only - NOT FOR CLINICAL USE', 'NOT_VALIDATED', false, NULL, NULL, true, false, true, '2026-11-08 09:37:24.974788+05:30'),
	(4, 'cloudflare-workers-ai', '@cf/meta/llama-3.2-11b-vision-instruct', 'Cloudflare Workers AI vision model for preliminary image suitability and visual observations; not trained or validated for clinical diagnosis.', 'Preliminary screening support only - NOT FOR CLINICAL USE', 'NOT_VALIDATED', false, NULL, NULL, true, false, true, '2026-11-12 00:59:24.30043+05:30');


--
-- Data for Name: mst_appointment_statuses; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_appointment_statuses (id, code, name_en, name_te, is_terminal, sort_order) OVERRIDING SYSTEM VALUE VALUES
	(1, 'REQUESTED', 'Requested', 'అభ్యర్థించబడింది', false, 1),
	(2, 'CONFIRMED', 'Confirmed', 'నిర్ధారించబడింది', false, 2),
	(3, 'RESCHEDULED', 'Rescheduled', 'తిరిగి షెడ్యూల్ చేయబడింది', true, 3),
	(4, 'COMPLETED', 'Completed', 'పూర్తయింది', true, 4),
	(5, 'MISSED', 'Missed', 'హాజరు కాలేదు', true, 5),
	(6, 'CANCELLED', 'Cancelled', 'రద్దు చేయబడింది', true, 6);


--
-- Data for Name: mst_consent_purposes; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_consent_purposes (id, code, name_en, name_te, text_en, text_te, version, is_required, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'SCREENING', 'Oral screening examination', 'నోటి పరీక్ష', 'I agree to a demonstration oral screening examination (synthetic data only).', NULL, 'v1', true, true),
	(2, 'IMAGE_CAPTURE', 'Photograph capture', 'ఫోటో తీయడం', 'I agree to oral photographs being taken for this demonstration.', NULL, 'v1', true, true),
	(3, 'TELECONSULT', 'Video consultation', 'వీడియో సంప్రదింపు', 'I agree to a video consultation with a specialist (not recorded).', NULL, 'v1', false, true),
	(4, 'DATA_PROCESSING', 'Data processing', 'డేటా ప్రాసెసింగ్', 'I agree to my demonstration record being stored and processed securely.', NULL, 'v1', true, true),
	(5, 'AI_RESEARCH', 'Research AI demonstration', 'పరిశోధన AI ప్రదర్శన', 'I understand the AI output is a research demonstration, not a diagnosis.', NULL, 'v1', false, true);


--
-- Data for Name: mst_diagnostic_categories; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_diagnostic_categories (id, code, name_en, name_te, sort_order, is_active, created_at) OVERRIDING SYSTEM VALUE VALUES
	(1, 'LAB', 'Laboratory', 'ప్రయోగశాల', 10, true, '2026-11-11 22:10:42.069943+05:30'),
	(2, 'PATHOLOGY', 'Pathology', 'పాథాలజీ', 30, true, '2026-11-11 22:10:42.069943+05:30'),
	(3, 'IMAGING', 'Imaging', 'ఇమేజింగ్', 20, true, '2026-11-11 22:10:42.069943+05:30'),
	(4, 'CLINICAL', 'Clinical examination', 'వైద్య పరీక్ష', 40, true, '2026-11-11 22:10:42.069943+05:30');


--
-- Data for Name: mst_investigation_types; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_investigation_types (id, code, name_en, name_te, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'CLINICAL_REEXAM', 'Specialist clinical re-examination', 'నిపుణుల తిరిగి పరీక్ష', true),
	(2, 'BIOPSY', 'Biopsy', 'బయాప్సీ', true),
	(3, 'HISTOPATHOLOGY', 'Histopathology', 'హిస్టోపాథాలజీ', true),
	(4, 'CT', 'CT scan', 'సిటి స్కాన్', true),
	(5, 'MRI', 'MRI scan', 'ఎంఆర్‌ఐ స్కాన్', true),
	(6, 'OTHER', 'Other investigation', 'ఇతర పరీక్ష', true);


--
-- Data for Name: mst_diagnostic_tests; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_diagnostic_tests (id, category_id, code, name_en, name_te, default_fasting, investigation_type_id, is_active, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES
	(1, 4, 'CLINICAL_REEXAM', 'Specialist clinical re-examination', 'నిపుణుల తిరిగి పరీక్ష', false, 1, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(2, 2, 'BIOPSY', 'Biopsy', 'బయాప్సీ', false, 2, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(3, 2, 'HISTOPATHOLOGY', 'Histopathology', 'హిస్టోపాథాలజీ', false, 3, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(4, 3, 'CT', 'CT scan', 'సిటి స్కాన్', true, 4, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(5, 3, 'MRI', 'MRI scan', 'ఎంఆర్‌ఐ స్కాన్', true, 5, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(6, 1, 'OTHER', 'Other investigation', 'ఇతర పరీక్ష', false, 6, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(7, 2, 'CYTOLOGY', 'Cytology smear', 'సైటాలజీ స్మియర్', false, NULL, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(8, 1, 'BLOOD_GLUCOSE', 'Blood glucose', 'రక్తంలో చక్కెర', true, NULL, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(9, 3, 'OPG', 'Orthopantomogram (OPG)', 'ఓపిజి ఎక్స్-రే', false, NULL, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(10, 1, 'CBC', 'Complete blood count', 'పూర్తి రక్త గణన', true, NULL, true, '2026-11-11 22:10:42.069943+05:30', '2026-11-11 22:10:42.069943+05:30'),
	(16, 3, 'ULTRASOUND', 'Ultrasound', 'అల్ట్రాసౌండ్', false, NULL, true, '2026-11-13 18:31:29.543697+05:30', '2026-11-13 18:31:29.543697+05:30'),
	(17, 3, 'MRI_BRAIN', 'MRI Brain', 'ఎంఆర్‌ఐ మెదడు', true, NULL, true, '2026-11-13 18:31:29.543697+05:30', '2026-11-13 18:31:29.543697+05:30'),
	(18, 3, 'XRAY', 'X-Ray', 'ఎక్స్-రే', false, NULL, true, '2026-11-13 18:31:29.543697+05:30', '2026-11-13 18:31:29.543697+05:30'),
	(19, 3, 'MRI_SPINE', 'MRI Spine', 'ఎంఆర్‌ఐ వెన్నెముక', true, NULL, true, '2026-11-13 18:31:29.543697+05:30', '2026-11-13 18:31:29.543697+05:30'),
	(20, 3, 'MRI_OTHER', 'MRI Other', 'ఎంఆర్‌ఐ ఇతర', true, NULL, true, '2026-11-13 18:31:29.543697+05:30', '2026-11-13 18:31:29.543697+05:30');


--
-- Data for Name: mst_districts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_districts (id, code, name_en, name_te, state_name, is_active, lgd_code, state_lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id) OVERRIDING SYSTEM VALUE VALUES
	(2, 'LGD_D_744', 'Anakapalli', NULL, 'Andhra Pradesh', true, 744, 28, 'LGD', false, '2026-11-12 16:32:24.60678+05:30', 14),
	(1, 'ASR', 'Alluri Sitharama Raju', 'అల్లూరి సీతారామరాజు', 'Andhra Pradesh', true, 745, 28, 'MANUAL', true, '2026-10-31 21:15:28.300039+05:30', 1);


--
-- Data for Name: mst_exposure_types; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_exposure_types (id, code, name_en, name_te, category, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'SMOKED_TOBACCO', 'Smoked tobacco', 'పొగాకు తాగడం', 'TOBACCO', true),
	(2, 'SMOKELESS_TOBACCO', 'Chewing tobacco', 'పొగాకు నమలడం', 'TOBACCO', true),
	(3, 'GUTKHA', 'Gutkha', 'గుట్కా', 'TOBACCO', true),
	(4, 'REVERSE_SMOKING', 'Reverse smoking', 'రివర్స్ స్మోకింగ్', 'TOBACCO', true),
	(5, 'ARECA_NUT', 'Areca nut / betel quid', 'వక్క / తాంబూలం', 'ARECA', true),
	(6, 'ALCOHOL', 'Alcohol', 'మద్యం', 'ALCOHOL', true);


--
-- Data for Name: mst_mandals; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_mandals (id, district_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id) OVERRIDING SYSTEM VALUE VALUES
	(12, 2, 'LGD_SD_4871', 'Anakapalli', NULL, true, 4871, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(13, 2, 'LGD_SD_4878', 'Atchuthapuram', NULL, true, 4878, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(14, 2, 'LGD_SD_4873', 'Butchayyapeta', NULL, true, 4873, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(15, 2, 'LGD_SD_4858', 'Cheedikada', NULL, true, 4858, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(16, 2, 'LGD_SD_4872', 'Chodavaram', NULL, true, 4872, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(17, 2, 'LGD_SD_4859', 'Devarapalli', NULL, true, 4859, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(18, 2, 'LGD_SD_4853', 'Golugonda', NULL, true, 4853, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(19, 2, 'LGD_SD_4860', 'K.Kotapadu', NULL, true, 4860, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(20, 2, 'LGD_SD_4876', 'Kasimkota', NULL, true, 4876, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(21, 2, 'LGD_SD_4874', 'Kotauratla', NULL, true, 4874, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(22, 2, 'LGD_SD_4857', 'Madugula', NULL, true, 4857, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(23, 2, 'LGD_SD_4875', 'Makavarapalem', NULL, true, 4875, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(24, 2, 'LGD_SD_4877', 'Munagapaka', NULL, true, 4877, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(25, 2, 'LGD_SD_4880', 'Nakkapalli', NULL, true, 4880, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(26, 2, 'LGD_SD_4854', 'Narsipatnam', NULL, true, 4854, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(27, 2, 'LGD_SD_4852', 'Nathavaram', NULL, true, 4852, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(28, 2, 'LGD_SD_4870', 'Paravada', NULL, true, 4870, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(29, 2, 'LGD_SD_4881', 'Payakaraopeta', NULL, true, 4881, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(30, 2, 'LGD_SD_4883', 'Rambilli', NULL, true, 4883, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(31, 2, 'LGD_SD_4856', 'Ravikamatham', NULL, true, 4856, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(32, 2, 'LGD_SD_4855', 'Rolugunta', NULL, true, 4855, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(33, 2, 'LGD_SD_4882', 'S.Rayavaram', NULL, true, 4882, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(34, 2, 'LGD_SD_4861', 'Sabbavaram', NULL, true, 4861, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(35, 2, 'LGD_SD_4879', 'Yelamanchili', NULL, true, 4879, 'LGD', false, '2026-11-12 16:33:05.749332+05:30', 15),
	(10, 1, 'LGD_SD_4841', 'Munchingi Puttu', NULL, true, 4841, 'LGD', true, '2026-10-31 21:16:47.717974+05:30', 2),
	(1, 1, 'PADERU', 'Paderu', 'పాడేరు', true, 4847, 'MANUAL', true, '2026-10-31 21:16:47.717974+05:30', 2),
	(11, 1, 'LGD_SD_4842', 'Peda Bayalu', NULL, true, 4842, 'LGD', true, '2026-10-31 21:16:47.717974+05:30', 2),
	(9, 1, 'LGD_SD_4851', 'Koyyuru', NULL, true, 4851, 'LGD', true, '2026-10-31 21:16:47.717974+05:30', 2),
	(3, 1, 'HUKUMPETA', 'Hukumpeta', 'హుకుంపేట', true, 4846, 'MANUAL', true, '2026-10-31 21:16:47.717974+05:30', 2),
	(8, 1, 'LGD_SD_4850', 'Gudem Kotha Veedhi', NULL, true, 4850, 'LGD', true, '2026-10-31 21:16:47.717974+05:30', 2),
	(2, 1, 'G_MADUGULA', 'G. Madugula', 'జి. మాడుగుల', true, 4848, 'MANUAL', true, '2026-10-31 21:16:47.717974+05:30', 2),
	(7, 1, 'LGD_SD_4843', 'Dumbriguda', NULL, true, 4843, 'LGD', true, '2026-10-31 21:16:47.717974+05:30', 2),
	(6, 1, 'LGD_SD_4849', 'Chinthapalli', NULL, true, 4849, 'LGD', true, '2026-10-31 21:16:47.717974+05:30', 2),
	(5, 1, 'LGD_SD_4844', 'Araku Valley', NULL, true, 4844, 'LGD', true, '2026-10-31 21:16:47.717974+05:30', 2),
	(4, 1, 'LGD_SD_4845', 'Ananthagiri', NULL, true, 4845, 'LGD', true, '2026-10-31 21:16:47.717974+05:30', 2);


--
-- Data for Name: mst_gram_panchayats; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_gram_panchayats (id, mandal_id, code, name_en, name_te, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 2, 'GP_DEMO_GM', 'Demo Gram Panchayat (G. Madugula)', NULL, true);


--
-- Data for Name: mst_hospitals; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_hospitals (id, district_id, code, name_en, name_te, level, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 1, 'AH_PADERU_DEMO', 'Area Hospital Paderu (demo)', NULL, 'AH', true),
	(2, 1, 'RCC_DEMO', 'Regional Cancer Centre (demo)', NULL, 'TERTIARY', true),
	(3, 1, 'AD_7A1D4A87E4', 'CHC', NULL, 'CHC', true),
	(4, 1, 'AD_2CE001DE23', 'Clinic', NULL, 'AH', true),
	(5, 1, 'AD_5F51894561', 'Hospital', NULL, 'CHC', true),
	(6, 1, 'AD_427E6A2E80', 'Area hospital', NULL, 'AH', true);


--
-- Data for Name: mst_phcs; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_phcs (id, mandal_id, code, name_en, name_te, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 2, 'PHC_GM_DEMO', 'PHC G. Madugula (demo)', NULL, true),
	(2, 1, 'AD_A7817112EB', 'medical centre', NULL, true),
	(3, 7, 'AD_C032B42ADC', 'PHC', 'TEJASWANI DHANASANI', true),
	(4, 11, 'AD_639AEC4F22', 'PHC', NULL, true);


--
-- Data for Name: mst_villages; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1, 1, 'VIL_DEMO_1', 'Demo Village 1', NULL, true, NULL, 'MANUAL', false, NULL, NULL, 2),
	(2, 1, 'VIL_DEMO_2', 'Demo Village 2', NULL, true, NULL, 'MANUAL', false, NULL, NULL, 2),
	(3, NULL, 'LGD_V_584320', 'Addategela', NULL, true, 584320, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(4, NULL, 'LGD_V_584209', 'Ananthagiri', NULL, true, 584209, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(5, NULL, 'LGD_V_584199', 'Baliaguda @ Cheedivalasa', NULL, true, 584199, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(6, NULL, 'LGD_V_584130', 'Baliyaguda', NULL, true, 584130, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(7, NULL, 'LGD_V_584371', 'Ballagaruvu', NULL, true, 584371, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(8, NULL, 'LGD_V_584184', 'Ballamamidi', NULL, true, 584184, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(9, NULL, 'LGD_V_584350', 'Bandakonda', NULL, true, 584350, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(10, NULL, 'LGD_V_584314', 'Bandavalasa', NULL, true, 584314, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(11, NULL, 'LGD_V_584238', 'Bangarampeta', NULL, true, 584238, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(12, NULL, 'LGD_V_584308', 'Banjoda', NULL, true, 584308, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(13, NULL, 'LGD_V_584119', 'Bediliguda', NULL, true, 584119, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(14, NULL, 'LGD_V_584352', 'Bembi', NULL, true, 584352, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(15, NULL, 'LGD_V_584215', 'Bhagamarivalasa', NULL, true, 584215, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(16, NULL, 'LGD_V_584279', 'Bhalluguda', NULL, true, 584279, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(17, NULL, 'LGD_V_584134', 'Bheemavaram', NULL, true, 584134, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(18, NULL, 'LGD_V_584112', 'Bheesupuram', NULL, true, 584112, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(19, NULL, 'LGD_V_584341', 'Billakamba', NULL, true, 584341, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(20, NULL, 'LGD_V_584139', 'Billakota', NULL, true, 584139, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(21, NULL, 'LGD_V_931007', 'Bithragadda', 'బిత్రగడ్డ', true, 931007, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(22, NULL, 'LGD_V_584187', 'Bodaguda', NULL, true, 584187, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(23, NULL, 'LGD_V_584344', 'Boddaputtu', NULL, true, 584344, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(24, NULL, 'LGD_V_584110', 'Bonduguda', NULL, true, 584110, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(25, NULL, 'LGD_V_584107', 'Bondyaguda', NULL, true, 584107, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(26, NULL, 'LGD_V_584333', 'Bongija', NULL, true, 584333, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(27, NULL, 'LGD_V_584149', 'Bongija', NULL, true, 584149, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(28, NULL, 'LGD_V_584334', 'Bonuru', NULL, true, 584334, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(29, NULL, 'LGD_V_584162', 'Boodi', NULL, true, 584162, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(30, NULL, 'LGD_V_584126', 'Boraborivalasa', NULL, true, 584126, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(31, NULL, 'LGD_V_584127', 'Boringuvalasa', NULL, true, 584127, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(32, NULL, 'LGD_V_584123', 'Borra', NULL, true, 584123, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(33, NULL, 'LGD_V_584379', 'Borrapalem', NULL, true, 584379, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(34, NULL, 'LGD_V_584323', 'Buddigaruvu', NULL, true, 584323, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(35, NULL, 'LGD_V_584141', 'Buliyaguda @ Buruju', NULL, true, 584141, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(36, NULL, 'LGD_V_584150', 'Buruga', NULL, true, 584150, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(37, NULL, 'LGD_V_584289', 'Burugulapadu', NULL, true, 584289, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(38, NULL, 'LGD_V_584259', 'Busipadu', NULL, true, 584259, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(39, NULL, 'LGD_V_584115', 'Chappadi', NULL, true, 584115, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(40, NULL, 'LGD_V_584378', 'Chatakamba', NULL, true, 584378, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(41, NULL, 'LGD_V_584339', 'Cheedigaruvu', NULL, true, 584339, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(42, NULL, 'LGD_V_584382', 'Cheedimetta', NULL, true, 584382, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(43, NULL, 'LGD_V_584185', 'Cheedivalasa', NULL, true, 584185, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(44, NULL, 'LGD_V_584313', 'Cheedivalasa', NULL, true, 584313, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(45, NULL, 'LGD_V_584267', 'Cheedivalasa', NULL, true, 584267, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(46, NULL, 'LGD_V_584253', 'Cheedivalasa', NULL, true, 584253, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(47, NULL, 'LGD_V_584336', 'Cheedivalasa', NULL, true, 584336, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(48, NULL, 'LGD_V_584268', 'Cherukubidda', NULL, true, 584268, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(49, NULL, 'LGD_V_584227', 'Cherukumadata', NULL, true, 584227, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(50, NULL, 'LGD_V_584250', 'Chilakalagedda', NULL, true, 584250, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(51, NULL, 'LGD_V_584282', 'Chimiti', NULL, true, 584282, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(52, NULL, 'LGD_V_584146', 'China Konela', NULL, true, 584146, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(53, NULL, 'LGD_V_584155', 'China Rabha', NULL, true, 584155, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(54, NULL, 'LGD_V_584384', 'Chinaburuga', NULL, true, 584384, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(55, NULL, 'LGD_V_584391', 'Chindugulapadu', NULL, true, 584391, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(56, NULL, 'LGD_V_584367', 'Chintalapalem', NULL, true, 584367, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(57, NULL, 'LGD_V_584385', 'Chintapaka', NULL, true, 584385, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(58, NULL, 'LGD_V_584136', 'Chippapalle', NULL, true, 584136, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(59, NULL, 'LGD_V_584386', 'Chitrallapalem', NULL, true, 584386, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(60, NULL, 'LGD_V_584143', 'Chittampadu', NULL, true, 584143, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(61, NULL, 'LGD_V_584224', 'Chittamvalasa', NULL, true, 584224, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(62, NULL, 'LGD_V_584228', 'Chittamvalasa', NULL, true, 584228, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(63, NULL, 'LGD_V_584160', 'Dabbalapadu', NULL, true, 584160, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(64, NULL, 'LGD_V_584246', 'Dabbalapadu', NULL, true, 584246, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(65, NULL, 'LGD_V_584244', 'Dabbalapalem', NULL, true, 584244, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(66, NULL, 'LGD_V_931003', 'Dalimputtu', 'దాలెంపుట్టు', true, 931003, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(67, NULL, 'LGD_V_584299', 'Damsalavalasa', NULL, true, 584299, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(68, NULL, 'LGD_V_584237', 'Damsarai', NULL, true, 584237, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(69, NULL, 'LGD_V_584225', 'Damuku', NULL, true, 584225, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(70, NULL, 'LGD_V_584292', 'Damukurai', NULL, true, 584292, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(71, NULL, 'LGD_V_584212', 'Dandabadu', NULL, true, 584212, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(72, NULL, 'LGD_V_584354', 'Dayarti', NULL, true, 584354, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(73, NULL, 'LGD_V_584116', 'Dekkapuram', NULL, true, 584116, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(1159, NULL, 'LGD_V_585450', 'Adagarapalle', NULL, true, 585450, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(74, NULL, 'LGD_V_584277', 'Dhanukota', NULL, true, 584277, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(75, NULL, 'LGD_V_584359', 'Dibbapalem', NULL, true, 584359, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(76, NULL, 'LGD_V_584234', 'Diguva Kambavalasa', NULL, true, 584234, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(77, NULL, 'LGD_V_584270', 'Diguvamallelu', NULL, true, 584270, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(78, NULL, 'LGD_V_584191', 'Diguvasobha', NULL, true, 584191, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(79, NULL, 'LGD_V_584305', 'Diguvasonabha', NULL, true, 584305, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(80, NULL, 'LGD_V_584402', 'Dimbrivanivandlavada', NULL, true, 584402, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(81, NULL, 'LGD_V_584316', 'Donkaiputtu', NULL, true, 584316, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(82, NULL, 'LGD_V_584407', 'Donumuru', NULL, true, 584407, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(83, NULL, 'LGD_V_584214', 'Doraguda', NULL, true, 584214, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(84, NULL, 'LGD_V_584177', 'Dumbrivalasa', NULL, true, 584177, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(85, NULL, 'LGD_V_584276', 'Eetamanuvalasa', NULL, true, 584276, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(86, NULL, 'LGD_V_584269', 'Eguvamallelu', NULL, true, 584269, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(87, NULL, 'LGD_V_584121', 'Eguvamamidi', NULL, true, 584121, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(88, NULL, 'LGD_V_584194', 'Eguvasobha', NULL, true, 584194, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(89, NULL, 'LGD_V_584366', 'Gaddibanda', NULL, true, 584366, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(90, NULL, 'LGD_V_584335', 'Gaddibanda', NULL, true, 584335, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(91, NULL, 'LGD_V_584174', 'Gadiguda', NULL, true, 584174, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(92, NULL, 'LGD_V_584156', 'Gadilalova', NULL, true, 584156, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(93, NULL, 'LGD_V_584255', 'Gangavaram', NULL, true, 584255, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(94, NULL, 'LGD_V_584331', 'Gangavaram', NULL, true, 584331, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(95, NULL, 'LGD_V_584296', 'Gangudivalasa', NULL, true, 584296, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(96, NULL, 'LGD_V_584137', 'Garugubilli', NULL, true, 584137, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(97, NULL, 'LGD_V_584211', 'Gatuguda', NULL, true, 584211, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(98, NULL, 'LGD_V_584340', 'Gazzellagaruvu', NULL, true, 584340, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(99, NULL, 'LGD_V_584120', 'Getuvalasa', NULL, true, 584120, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(100, NULL, 'LGD_V_584364', 'Godugumamidipalem', NULL, true, 584364, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(101, NULL, 'LGD_V_584311', 'Gommangipadu', NULL, true, 584311, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(102, NULL, 'LGD_V_584131', 'Gondiguda', NULL, true, 584131, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(103, NULL, 'LGD_V_584393', 'Goppulapalem', NULL, true, 584393, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(104, NULL, 'LGD_V_584295', 'Gorregommu', NULL, true, 584295, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(105, NULL, 'LGD_V_584140', 'Gottipadu', NULL, true, 584140, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(106, NULL, 'LGD_V_584157', 'Gudem', NULL, true, 584157, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(107, NULL, 'LGD_V_584373', 'Gujjali', NULL, true, 584373, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(108, NULL, 'LGD_V_584383', 'Gulamalapalle', NULL, true, 584383, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(109, NULL, 'LGD_V_584274', 'Gumma', NULL, true, 584274, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(110, NULL, 'LGD_V_584345', 'Gummanti', NULL, true, 584345, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(111, NULL, 'LGD_V_584372', 'Gummanti', NULL, true, 584372, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(112, NULL, 'LGD_V_584417', 'Gummidipadu', NULL, true, 584417, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(113, NULL, 'LGD_V_584405', 'Gurajala', NULL, true, 584405, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(114, NULL, 'LGD_V_584398', 'Gurilova', NULL, true, 584398, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(115, NULL, 'LGD_V_584197', 'Heetaguda', NULL, true, 584197, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(116, NULL, 'LGD_V_584179', 'Jakariguda', NULL, true, 584179, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(117, NULL, 'LGD_V_584325', 'Jalada', NULL, true, 584325, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(118, NULL, 'LGD_V_584322', 'Jampaputtu', NULL, true, 584322, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(119, NULL, 'LGD_V_584180', 'Jamuguda', NULL, true, 584180, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(120, NULL, 'LGD_V_584248', 'Jeelugulapadu', NULL, true, 584248, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(121, NULL, 'LGD_V_584363', 'Jeenapadu', NULL, true, 584363, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(122, NULL, 'LGD_V_931006', 'Jeerugedda', 'జీరుగడ్డ', true, 931006, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(123, NULL, 'LGD_V_584414', 'Jorlaguda', NULL, true, 584414, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(124, NULL, 'LGD_V_584283', 'Kadarevu', NULL, true, 584283, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(125, NULL, 'LGD_V_584396', 'Kagulagaruvu', NULL, true, 584396, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(126, NULL, 'LGD_V_931004', 'Kakarapadu', 'కాకరపాడు', true, 931004, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(127, NULL, 'LGD_V_584196', 'Kamalapuram', NULL, true, 584196, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(128, NULL, 'LGD_V_584213', 'Kambavalasa', NULL, true, 584213, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(129, NULL, 'LGD_V_584254', 'Kambavalasa', NULL, true, 584254, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(130, NULL, 'LGD_V_584324', 'Kannamgaruvu', NULL, true, 584324, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(131, NULL, 'LGD_V_584229', 'Kantipuram', NULL, true, 584229, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(132, NULL, 'LGD_V_584129', 'Kapativalasa', NULL, true, 584129, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(133, NULL, 'LGD_V_584272', 'Karaiguda', NULL, true, 584272, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(134, NULL, 'LGD_V_584104', 'Karaiguda', NULL, true, 584104, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(135, NULL, 'LGD_V_584111', 'Karakavalasa', NULL, true, 584111, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(136, NULL, 'LGD_V_584223', 'Karakavalasa', NULL, true, 584223, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(137, NULL, 'LGD_V_584261', 'Karakavalasa', NULL, true, 584261, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(138, NULL, 'LGD_V_584260', 'Karivesu', NULL, true, 584260, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(139, NULL, 'LGD_V_584399', 'Karriguda', NULL, true, 584399, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(140, NULL, 'LGD_V_584252', 'Kasipatnam', NULL, true, 584252, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(141, NULL, 'LGD_V_584113', 'Katika', NULL, true, 584113, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(142, NULL, 'LGD_V_584161', 'Katimanuvalasa', NULL, true, 584161, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(143, NULL, 'LGD_V_584163', 'Katturu', NULL, true, 584163, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(144, NULL, 'LGD_V_584406', 'Kavaliguda', NULL, true, 584406, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(145, NULL, 'LGD_V_584109', 'Kittalingi', NULL, true, 584109, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(146, NULL, 'LGD_V_584249', 'Kittayyatota', NULL, true, 584249, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(147, NULL, 'LGD_V_584329', 'Kivarla', NULL, true, 584329, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(148, NULL, 'LGD_V_584222', 'Kodamaguda', NULL, true, 584222, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(149, NULL, 'LGD_V_584144', 'Kondavenkatapuram', NULL, true, 584144, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(150, NULL, 'LGD_V_584374', 'Kondemkota', NULL, true, 584374, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(151, NULL, 'LGD_V_584173', 'Kondiba', NULL, true, 584173, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(152, NULL, 'LGD_V_584117', 'Kontysimidi', NULL, true, 584117, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(153, NULL, 'LGD_V_584181', 'Kosamamidi', NULL, true, 584181, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(154, NULL, 'LGD_V_584368', 'Kotaparti', NULL, true, 584368, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(155, NULL, 'LGD_V_584148', 'Kotaparti', NULL, true, 584148, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(156, NULL, 'LGD_V_584153', 'Kotapartivalasa', NULL, true, 584153, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(157, NULL, 'LGD_V_584362', 'Kotharevallapalem', NULL, true, 584362, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(158, NULL, 'LGD_V_584230', 'Kothavalasa', NULL, true, 584230, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(159, NULL, 'LGD_V_584231', 'Kothavalasa', NULL, true, 584231, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(160, NULL, 'LGD_V_584388', 'Kottamguda', NULL, true, 584388, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(161, NULL, 'LGD_V_584328', 'Kottavalasa', NULL, true, 584328, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(162, NULL, 'LGD_V_584190', 'Kottavalasa', NULL, true, 584190, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(163, NULL, 'LGD_V_584210', 'Kottavalasa @ Verumulapuram', NULL, true, 584210, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(164, NULL, 'LGD_V_584256', 'Kotturu', NULL, true, 584256, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(165, NULL, 'LGD_V_584118', 'Kotyaguda', NULL, true, 584118, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(166, NULL, 'LGD_V_584257', 'Krishnapuram', NULL, true, 584257, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(167, NULL, 'LGD_V_584342', 'Kudiya', NULL, true, 584342, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(168, NULL, 'LGD_V_584297', 'Kumburti', NULL, true, 584297, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(169, NULL, 'LGD_V_584124', 'Kummarivalasa', NULL, true, 584124, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(170, NULL, 'LGD_V_584108', 'Kunapuram', NULL, true, 584108, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(171, NULL, 'LGD_V_584169', 'Lanjilaguda', NULL, true, 584169, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(172, NULL, 'LGD_V_584170', 'Laxmipuram', NULL, true, 584170, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(173, NULL, 'LGD_V_584198', 'Laxmipuram', NULL, true, 584198, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(174, NULL, 'LGD_V_584105', 'Liddangi', NULL, true, 584105, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(175, NULL, 'LGD_V_584189', 'Limbaguda @ Nimmada', NULL, true, 584189, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(176, NULL, 'LGD_V_584290', 'Lungaparti', NULL, true, 584290, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(177, NULL, 'LGD_V_584300', 'Maddigaruvu', NULL, true, 584300, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(178, NULL, 'LGD_V_584265', 'Maddipadu', NULL, true, 584265, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(179, NULL, 'LGD_V_584353', 'Madrebu', NULL, true, 584353, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(180, NULL, 'LGD_V_584356', 'Makanapalle', NULL, true, 584356, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(181, NULL, 'LGD_V_584205', 'Malingavalasa', NULL, true, 584205, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(182, NULL, 'LGD_V_584415', 'Malipadu', NULL, true, 584415, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(183, NULL, 'LGD_V_584370', 'Mallampeta', NULL, true, 584370, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(184, NULL, 'LGD_V_584164', 'Mandaparti', NULL, true, 584164, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(185, NULL, 'LGD_V_584310', 'Mandruvalasa', NULL, true, 584310, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(186, NULL, 'LGD_V_584281', 'Mangagumma', NULL, true, 584281, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(187, NULL, 'LGD_V_584208', 'Mardaguda', NULL, true, 584208, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(188, NULL, 'LGD_V_584240', 'Marrimanuvalasa', NULL, true, 584240, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(189, NULL, 'LGD_V_584293', 'Marrivalasa @ Manuvalasa', NULL, true, 584293, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(190, NULL, 'LGD_V_584258', 'Medaparti', NULL, true, 584258, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(191, NULL, 'LGD_V_584284', 'Mettavalasa', NULL, true, 584284, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(192, NULL, 'LGD_V_584309', 'Mettavalasa', NULL, true, 584309, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(193, NULL, 'LGD_V_584262', 'Mirithidungada', NULL, true, 584262, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(194, NULL, 'LGD_V_584207', 'Mondijanguda', NULL, true, 584207, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(195, NULL, 'LGD_V_584307', 'Moolapatnam', NULL, true, 584307, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(196, NULL, 'LGD_V_584219', 'Mulyaguda', NULL, true, 584219, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(197, NULL, 'LGD_V_584217', 'Muvvamvalasa', NULL, true, 584217, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(198, NULL, 'LGD_V_584176', 'Nadimivalasa', NULL, true, 584176, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(199, NULL, 'LGD_V_584317', 'Nakkalamamidi', NULL, true, 584317, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(200, NULL, 'LGD_V_584226', 'Nandanapuram', NULL, true, 584226, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(201, NULL, 'LGD_V_584203', 'Nandigummi', NULL, true, 584203, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(202, NULL, 'LGD_V_584404', 'Nandiguni', NULL, true, 584404, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(203, NULL, 'LGD_V_584172', 'Nandikota', NULL, true, 584172, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(204, NULL, 'LGD_V_584278', 'Nandulavalasa', NULL, true, 584278, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(205, NULL, 'LGD_V_584271', 'Nelapalem', NULL, true, 584271, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(206, NULL, 'LGD_V_584165', 'Nerellavalasa', NULL, true, 584165, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(207, NULL, 'LGD_V_584303', 'Nimmalapadu', NULL, true, 584303, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(208, NULL, 'LGD_V_584273', 'Nimmavuta', NULL, true, 584273, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(209, NULL, 'LGD_V_584183', 'Ninnimamidi', NULL, true, 584183, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(210, NULL, 'LGD_V_584186', 'Nisaniguda', NULL, true, 584186, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(211, NULL, 'LGD_V_584418', 'Nunemamid', NULL, true, 584418, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(212, NULL, 'LGD_V_584411', 'Onikannela', NULL, true, 584411, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(213, NULL, 'LGD_V_584389', 'Onukonda', NULL, true, 584389, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(214, NULL, 'LGD_V_584266', 'Palabandavalasa', NULL, true, 584266, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(215, NULL, 'LGD_V_584239', 'Pallamvanivalasa', NULL, true, 584239, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(216, NULL, 'LGD_V_584236', 'Panasamanuvalasa', NULL, true, 584236, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(217, NULL, 'LGD_V_584337', 'Pandirimamidi', NULL, true, 584337, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(218, NULL, 'LGD_V_584318', 'Pandirimamidi', NULL, true, 584318, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(219, NULL, 'LGD_V_584171', 'Pandirimamidivalasa', NULL, true, 584171, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(220, NULL, 'LGD_V_584204', 'Patakota', NULL, true, 584204, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(221, NULL, 'LGD_V_584351', 'Patipalle', NULL, true, 584351, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(222, NULL, 'LGD_V_584298', 'Patti', NULL, true, 584298, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(223, NULL, 'LGD_V_584387', 'Peda Buruga-I', NULL, true, 584387, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(224, NULL, 'LGD_V_584154', 'Peda Rabha', NULL, true, 584154, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(225, NULL, 'LGD_V_584343', 'Pedabayalu', NULL, true, 584343, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(226, NULL, 'LGD_V_584410', 'Pedabayalu', NULL, true, 584410, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(227, NULL, 'LGD_V_584280', 'Pedabidda', NULL, true, 584280, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(228, NULL, 'LGD_V_584390', 'Pedaburugu II', NULL, true, 584390, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(229, NULL, 'LGD_V_584361', 'Pedagangavaram', NULL, true, 584361, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(230, NULL, 'LGD_V_584159', 'Pedakonela', NULL, true, 584159, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(231, NULL, 'LGD_V_584376', 'Pedakota', NULL, true, 584376, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(232, NULL, 'LGD_V_584122', 'Pedduru', NULL, true, 584122, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(233, NULL, 'LGD_V_584245', 'Pedduru', NULL, true, 584245, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(234, NULL, 'LGD_V_584221', 'Pempuduvalasa', NULL, true, 584221, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(235, NULL, 'LGD_V_584315', 'Penamarti', NULL, true, 584315, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(236, NULL, 'LGD_V_584380', 'Pinakota', NULL, true, 584380, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(237, NULL, 'LGD_V_584347', 'Poderti', NULL, true, 584347, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(238, NULL, 'LGD_V_584128', 'Pooluguda', NULL, true, 584128, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(239, NULL, 'LGD_V_584220', 'Pooluguda', NULL, true, 584220, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(240, NULL, 'LGD_V_584193', 'Pooluguda', NULL, true, 584193, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(241, NULL, 'LGD_V_584263', 'Porlu', NULL, true, 584263, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(242, NULL, 'LGD_V_584377', 'Porlubanda', NULL, true, 584377, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(243, NULL, 'LGD_V_584288', 'Pulusumamidi', NULL, true, 584288, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(244, NULL, 'LGD_V_584409', 'Purulabanda', NULL, true, 584409, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(245, NULL, 'LGD_V_584338', 'Putikaputtu', NULL, true, 584338, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(246, NULL, 'LGD_V_584306', 'Pynampadu', NULL, true, 584306, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(247, NULL, 'LGD_V_584158', 'R.T.Puram', NULL, true, 584158, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(248, NULL, 'LGD_V_584357', 'Rachakilam', NULL, true, 584357, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(249, NULL, 'LGD_V_584142', 'Rajupaka', NULL, true, 584142, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(250, NULL, 'LGD_V_584330', 'Rallagaruvu', NULL, true, 584330, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(251, NULL, 'LGD_V_584151', 'Rampalle', NULL, true, 584151, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(252, NULL, 'LGD_V_584132', 'Ranjaliguda @ Ranginiguda', NULL, true, 584132, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(253, NULL, 'LGD_V_584218', 'Rayavalasa', NULL, true, 584218, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(254, NULL, 'LGD_V_584291', 'Rayipadu', NULL, true, 584291, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(255, NULL, 'LGD_V_584201', 'Regam', NULL, true, 584201, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(256, NULL, 'LGD_V_584397', 'Regapunayagiri', NULL, true, 584397, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(257, NULL, 'LGD_V_584375', 'Regulapalem', NULL, true, 584375, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(258, NULL, 'LGD_V_584360', 'Revallapalem', NULL, true, 584360, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(259, NULL, 'LGD_V_584178', 'Sada', NULL, true, 584178, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(260, NULL, 'LGD_V_584232', 'Samareddipalem', NULL, true, 584232, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(261, NULL, 'LGD_V_584135', 'Sankuparti', NULL, true, 584135, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(262, NULL, 'LGD_V_584106', 'Saraiguda', NULL, true, 584106, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(263, NULL, 'LGD_V_584167', 'Saravani Palem', NULL, true, 584167, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(264, NULL, 'LGD_V_584133', 'Sariapalle', NULL, true, 584133, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(265, NULL, 'LGD_V_584355', 'Sariya', NULL, true, 584355, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(266, NULL, 'LGD_V_584188', 'Seesaguda', NULL, true, 584188, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(267, NULL, 'LGD_V_584195', 'Seesamanda', NULL, true, 584195, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(268, NULL, 'LGD_V_584166', 'Seetampeta', NULL, true, 584166, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(269, NULL, 'LGD_V_584182', 'Singarbha', NULL, true, 584182, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(270, NULL, 'LGD_V_584138', 'Singavaram', NULL, true, 584138, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(271, NULL, 'LGD_V_584233', 'Sivalingapuram', NULL, true, 584233, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(272, NULL, 'LGD_V_584392', 'Solabongu', NULL, true, 584392, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(273, NULL, 'LGD_V_584192', 'Sorasapodaru', NULL, true, 584192, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(274, NULL, 'LGD_V_584152', 'Sottadivalasa', NULL, true, 584152, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(275, NULL, 'LGD_V_931005', 'Sukuduputtu', 'సూకుడుపుట్టు', true, 931005, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(276, NULL, 'LGD_V_584206', 'Tadiguda', NULL, true, 584206, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(277, NULL, 'LGD_V_584403', 'Talaripadu', NULL, true, 584403, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(278, NULL, 'LGD_V_584200', 'Talaripadu', NULL, true, 584200, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(279, NULL, 'LGD_V_584358', 'Tamuta', NULL, true, 584358, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(280, NULL, 'LGD_V_584332', 'Tangellabanda', NULL, true, 584332, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(281, NULL, 'LGD_V_584348', 'Tankota', NULL, true, 584348, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(282, NULL, 'LGD_V_584319', 'Taragam', NULL, true, 584319, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(283, NULL, 'LGD_V_584394', 'Tattapudi', NULL, true, 584394, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(284, NULL, 'LGD_V_584168', 'Tattavalasa', NULL, true, 584168, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(285, NULL, 'LGD_V_584235', 'Teegalamada', NULL, true, 584235, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(286, NULL, 'LGD_V_584408', 'Tekkapuram', NULL, true, 584408, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(287, NULL, 'LGD_V_584327', 'Tenkalavalasa', NULL, true, 584327, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(288, NULL, 'LGD_V_584401', 'Tenkariguda', NULL, true, 584401, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(289, NULL, 'LGD_V_584395', 'Tenkubudda', NULL, true, 584395, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(290, NULL, 'LGD_V_584216', 'Tenteliguda', NULL, true, 584216, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(291, NULL, 'LGD_V_584202', 'Tenuputtu', NULL, true, 584202, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(292, NULL, 'LGD_V_584175', 'Tokavalasa', NULL, true, 584175, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(293, NULL, 'LGD_V_584125', 'Tokuru', NULL, true, 584125, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(294, NULL, 'LGD_V_584145', 'Totavalasa', NULL, true, 584145, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(295, NULL, 'LGD_V_584242', 'Totavalasa', NULL, true, 584242, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(296, NULL, 'LGD_V_584304', 'Tumbarti', NULL, true, 584304, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(297, NULL, 'LGD_V_584241', 'Tummanuvalasa', NULL, true, 584241, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(298, NULL, 'LGD_V_584349', 'Tunisebu', NULL, true, 584349, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(299, NULL, 'LGD_V_584365', 'Valasala Garuvu', NULL, true, 584365, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(300, NULL, 'LGD_V_584302', 'Valasi', NULL, true, 584302, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(301, NULL, 'LGD_V_584413', 'Vandavalova', NULL, true, 584413, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(302, NULL, 'LGD_V_584275', 'Vanjalavalasa', NULL, true, 584275, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(303, NULL, 'LGD_V_584321', 'Vantarbha', NULL, true, 584321, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(304, NULL, 'LGD_V_584381', 'Vanthalamamidi', NULL, true, 584381, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(305, NULL, 'LGD_V_584286', 'Vanthanagaruvu', NULL, true, 584286, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(306, NULL, 'LGD_V_584247', 'Vantinivanipalem', NULL, true, 584247, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(307, NULL, 'LGD_V_584243', 'Varakavadu', NULL, true, 584243, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(308, NULL, 'LGD_V_584114', 'Vatalamamidi', NULL, true, 584114, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(309, NULL, 'LGD_V_584416', 'Vegupadu', NULL, true, 584416, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(310, NULL, 'LGD_V_584287', 'Velagalapadu', NULL, true, 584287, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(311, NULL, 'LGD_V_584369', 'Velagalapadu', NULL, true, 584369, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(312, NULL, 'LGD_V_584346', 'Velamamidi', NULL, true, 584346, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(313, NULL, 'LGD_V_584312', 'Vengada', NULL, true, 584312, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(314, NULL, 'LGD_V_584251', 'Venkayyapalem', NULL, true, 584251, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(315, NULL, 'LGD_V_584326', 'Voobalu', NULL, true, 584326, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(316, NULL, 'LGD_V_584294', 'Vootagedda', NULL, true, 584294, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(317, NULL, 'LGD_V_584264', 'Vootamamidi', NULL, true, 584264, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(318, NULL, 'LGD_V_584412', 'Vulagumma', NULL, true, 584412, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(319, NULL, 'LGD_V_584147', 'Y.S.R.Puram', NULL, true, 584147, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(320, NULL, 'LGD_V_584400', 'Yerraguppa', NULL, true, 584400, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(321, NULL, 'LGD_V_584285', 'Yerrametta', NULL, true, 584285, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(322, NULL, 'LGD_V_584301', 'Zendagaruvu', NULL, true, 584301, 'LGD', false, '2026-10-31 21:17:36.388397+05:30', 3, 4),
	(323, NULL, 'LGD_V_584099', 'Adaru', NULL, true, 584099, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(324, NULL, 'LGD_V_583973', 'Addumanda', NULL, true, 583973, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(325, NULL, 'LGD_V_584002', 'Amalaguda', NULL, true, 584002, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(326, NULL, 'LGD_V_583966', 'Antiparthi', NULL, true, 583966, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(327, NULL, 'LGD_V_584100', 'Bairuguda', NULL, true, 584100, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(328, NULL, 'LGD_V_583979', 'Baliyaguda', NULL, true, 583979, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(329, NULL, 'LGD_V_584086', 'Baliyaguda', NULL, true, 584086, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(330, NULL, 'LGD_V_584037', 'Bamsuguda', NULL, true, 584037, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(331, NULL, 'LGD_V_584032', 'Bandapanuvalasa', NULL, true, 584032, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(332, NULL, 'LGD_V_584042', 'Baski', NULL, true, 584042, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(333, NULL, 'LGD_V_584007', 'Battivalasa', NULL, true, 584007, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(334, NULL, 'LGD_V_584089', 'Beddaguda', NULL, true, 584089, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(335, NULL, 'LGD_V_584095', 'Beddaguda', NULL, true, 584095, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(336, NULL, 'LGD_V_584012', 'Bishnuguda', NULL, true, 584012, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(337, NULL, 'LGD_V_584061', 'Boduguda', NULL, true, 584061, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(338, NULL, 'LGD_V_584051', 'Bondaguda', NULL, true, 584051, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(339, NULL, 'LGD_V_584082', 'Bondam', NULL, true, 584082, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(340, NULL, 'LGD_V_584041', 'Bonduguda', NULL, true, 584041, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(341, NULL, 'LGD_V_583978', 'Bonduguda', NULL, true, 583978, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(342, NULL, 'LGD_V_583953', 'Borrachinta', NULL, true, 583953, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(343, NULL, 'LGD_V_583983', 'Borrakaluvalasa', NULL, true, 583983, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(344, NULL, 'LGD_V_584009', 'Borriguda', NULL, true, 584009, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(345, NULL, 'LGD_V_584060', 'Bosubeda', NULL, true, 584060, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(346, NULL, 'LGD_V_584085', 'Boyiguda', NULL, true, 584085, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(347, NULL, 'LGD_V_583962', 'Chandrapoda', NULL, true, 583962, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(348, NULL, 'LGD_V_583940', 'Cheedivalasa', NULL, true, 583940, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(349, NULL, 'LGD_V_583949', 'Chellubadi', NULL, true, 583949, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(350, NULL, 'LGD_V_583952', 'Chendrapodaru', NULL, true, 583952, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(351, NULL, 'LGD_V_584075', 'Chinagangagudi', NULL, true, 584075, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(352, NULL, 'LGD_V_583937', 'Chinalabudu', NULL, true, 583937, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(353, NULL, 'LGD_V_583938', 'Chittamgondi', NULL, true, 583938, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(354, NULL, 'LGD_V_584028', 'Chompi', NULL, true, 584028, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(355, NULL, 'LGD_V_583941', 'Dabuguda', NULL, true, 583941, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(356, NULL, 'LGD_V_584067', 'Daburangini', NULL, true, 584067, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(357, NULL, 'LGD_V_584059', 'Dalapatiguda', NULL, true, 584059, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(358, NULL, 'LGD_V_584102', 'Danasalavalasa', NULL, true, 584102, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(359, NULL, 'LGD_V_584057', 'Danirangini', NULL, true, 584057, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(360, NULL, 'LGD_V_583995', 'Dappuguda', NULL, true, 583995, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(361, NULL, 'LGD_V_583959', 'Davadaguda', NULL, true, 583959, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(362, NULL, 'LGD_V_583958', 'Dellipadu', NULL, true, 583958, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(363, NULL, 'LGD_V_584040', 'Devarapalle', NULL, true, 584040, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(364, NULL, 'LGD_V_929963', 'Dhoburangini', 'దోభురంగిణి', true, 929963, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(365, NULL, 'LGD_V_584054', 'Dingriputtu', NULL, true, 584054, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(366, NULL, 'LGD_V_584023', 'Dolliguda', NULL, true, 584023, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(367, NULL, 'LGD_V_583943', 'Domalajoru', NULL, true, 583943, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(368, NULL, 'LGD_V_584045', 'Doraguda', NULL, true, 584045, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(369, NULL, 'LGD_V_583970', 'Duddikonda', NULL, true, 583970, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(370, NULL, 'LGD_V_583961', 'Dumbriguda', NULL, true, 583961, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(371, NULL, 'LGD_V_584039', 'Dungiyaputtu', NULL, true, 584039, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(372, NULL, 'LGD_V_584062', 'Gadyaguda', NULL, true, 584062, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(373, NULL, 'LGD_V_584074', 'Gandametta', NULL, true, 584074, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(374, NULL, 'LGD_V_583969', 'Gangasanivalasa', NULL, true, 583969, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(375, NULL, 'LGD_V_584017', 'Ganjayavalasa', NULL, true, 584017, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(376, NULL, 'LGD_V_583997', 'Gannela', NULL, true, 583997, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(377, NULL, 'LGD_V_584013', 'Garudaguda', NULL, true, 584013, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(378, NULL, 'LGD_V_583957', 'Gatapadu', NULL, true, 583957, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(379, NULL, 'LGD_V_584052', 'Gattanaguda', NULL, true, 584052, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(380, NULL, 'LGD_V_584079', 'Gattaraguda', NULL, true, 584079, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(381, NULL, 'LGD_V_584015', 'Gatuguda', NULL, true, 584015, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(382, NULL, 'LGD_V_584036', 'Girliguda', NULL, true, 584036, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(383, NULL, 'LGD_V_584091', 'Gojara', NULL, true, 584091, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(384, NULL, 'LGD_V_583996', 'Gondiguda', NULL, true, 583996, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(385, NULL, 'LGD_V_584044', 'Gugguda', NULL, true, 584044, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(386, NULL, 'LGD_V_584065', 'Hattaguda', NULL, true, 584065, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(387, NULL, 'LGD_V_583976', 'Iragai', NULL, true, 583976, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(388, NULL, 'LGD_V_584035', 'Jaginivalasa', NULL, true, 584035, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(389, NULL, 'LGD_V_584070', 'Janamguda', NULL, true, 584070, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(390, NULL, 'LGD_V_583984', 'Janamguda', NULL, true, 583984, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(391, NULL, 'LGD_V_583955', 'Jarimanuguda', NULL, true, 583955, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(392, NULL, 'LGD_V_583954', 'Jarlangi', NULL, true, 583954, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(393, NULL, 'LGD_V_583971', 'Kaguvalasa', NULL, true, 583971, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(394, NULL, 'LGD_V_583991', 'Kaguvalasa', NULL, true, 583991, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(395, NULL, 'LGD_V_583948', 'Kajjuruguda', NULL, true, 583948, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(396, NULL, 'LGD_V_583945', 'Kamalabanda', NULL, true, 583945, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(397, NULL, 'LGD_V_583993', 'Kamalatota', NULL, true, 583993, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(398, NULL, 'LGD_V_583989', 'Kandulaguddi', NULL, true, 583989, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(399, NULL, 'LGD_V_584103', 'Kantabamsuguda (Ct)', NULL, true, 584103, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(400, NULL, 'LGD_V_584050', 'Kappalagondi', NULL, true, 584050, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(401, NULL, 'LGD_V_584092', 'Karakavalasa', NULL, true, 584092, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(402, NULL, 'LGD_V_583947', 'Kentubade', NULL, true, 583947, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(403, NULL, 'LGD_V_583964', 'Kikkatiguda', NULL, true, 583964, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(404, NULL, 'LGD_V_584066', 'Kinnamguda', NULL, true, 584066, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(405, NULL, 'LGD_V_584030', 'Kodipunjuvalasa', NULL, true, 584030, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(406, NULL, 'LGD_V_584088', 'Koliyaguda', NULL, true, 584088, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(407, NULL, 'LGD_V_584077', 'Korraguda', NULL, true, 584077, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(408, NULL, 'LGD_V_584055', 'Korraguda', NULL, true, 584055, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(409, NULL, 'LGD_V_584068', 'Korraguda', NULL, true, 584068, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(410, NULL, 'LGD_V_584000', 'Kosiguda', NULL, true, 584000, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(411, NULL, 'LGD_V_584063', 'Kothaballuguda', NULL, true, 584063, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(412, NULL, 'LGD_V_584081', 'Kothavalasa', NULL, true, 584081, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(413, NULL, 'LGD_V_584027', 'Kottavalasa', NULL, true, 584027, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(414, NULL, 'LGD_V_584003', 'Kottavalasa', NULL, true, 584003, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(415, NULL, 'LGD_V_583960', 'Kundiguda', NULL, true, 583960, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(416, NULL, 'LGD_V_584094', 'Kuruseela', NULL, true, 584094, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(417, NULL, 'LGD_V_584048', 'Kusumguda', NULL, true, 584048, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(418, NULL, 'LGD_V_584034', 'Lamtampadu', NULL, true, 584034, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(419, NULL, 'LGD_V_583963', 'Landiguda', NULL, true, 583963, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(420, NULL, 'LGD_V_584097', 'Leddangi', NULL, true, 584097, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(421, NULL, 'LGD_V_584010', 'Lembaguda', NULL, true, 584010, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(422, NULL, 'LGD_V_584069', 'Limbaguda', NULL, true, 584069, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(423, NULL, 'LGD_V_584020', 'Littiguda', NULL, true, 584020, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(424, NULL, 'LGD_V_929964', 'Loteru Musiriguda', 'లోతేరు ముసిరిగుడ', true, 929964, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(425, NULL, 'LGD_V_583985', 'Lotheru', NULL, true, 583985, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(426, NULL, 'LGD_V_584058', 'Madaguda', NULL, true, 584058, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(427, NULL, 'LGD_V_584006', 'Madala', NULL, true, 584006, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(428, NULL, 'LGD_V_584090', 'Majjivalasa', NULL, true, 584090, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(429, NULL, 'LGD_V_583935', 'Mala Singaram', NULL, true, 583935, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(430, NULL, 'LGD_V_584046', 'Manjuguda', NULL, true, 584046, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(431, NULL, 'LGD_V_583950', 'Mettapadu', NULL, true, 583950, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(432, NULL, 'LGD_V_583951', 'Mettapadu', NULL, true, 583951, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(433, NULL, 'LGD_V_583974', 'Morriguda', NULL, true, 583974, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(434, NULL, 'LGD_V_584016', 'Mulyagalugu', NULL, true, 584016, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(435, NULL, 'LGD_V_583972', 'Musiriguda', NULL, true, 583972, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(436, NULL, 'LGD_V_584008', 'Musriguda', NULL, true, 584008, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(437, NULL, 'LGD_V_583977', 'Nanda', NULL, true, 583977, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(438, NULL, 'LGD_V_584053', 'Nandiguda', NULL, true, 584053, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(439, NULL, 'LGD_V_584080', 'Ninnimamidivalasa', NULL, true, 584080, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(440, NULL, 'LGD_V_584011', 'Novvaguda', NULL, true, 584011, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(441, NULL, 'LGD_V_584024', 'Padmapuram', NULL, true, 584024, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(442, NULL, 'LGD_V_584056', 'Pakanaguda', NULL, true, 584056, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(443, NULL, 'LGD_V_584019', 'Panirangini', NULL, true, 584019, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(444, NULL, 'LGD_V_584026', 'Pappuduvalasa', NULL, true, 584026, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(445, NULL, 'LGD_V_584064', 'Pathaballuguda', NULL, true, 584064, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(446, NULL, 'LGD_V_584018', 'Peda Labudu', NULL, true, 584018, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(447, NULL, 'LGD_V_583968', 'Peda Valasa', NULL, true, 583968, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(448, NULL, 'LGD_V_584076', 'Pedagangagudi', NULL, true, 584076, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(449, NULL, 'LGD_V_583956', 'Pedagaruvu', NULL, true, 583956, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(450, NULL, 'LGD_V_584101', 'Pedageddavalasa', NULL, true, 584101, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(451, NULL, 'LGD_V_584071', 'Piribanda', NULL, true, 584071, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(452, NULL, 'LGD_V_584038', 'Piripodaru', NULL, true, 584038, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(453, NULL, 'LGD_V_584047', 'Pitraguda', NULL, true, 584047, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(454, NULL, 'LGD_V_584014', 'Pittamarriguda', NULL, true, 584014, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(455, NULL, 'LGD_V_583999', 'Polamguda', NULL, true, 583999, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(456, NULL, 'LGD_V_583988', 'Polliguda', NULL, true, 583988, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(457, NULL, 'LGD_V_583975', 'Pooluguda', NULL, true, 583975, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(458, NULL, 'LGD_V_584005', 'Pottangipadu', NULL, true, 584005, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(459, NULL, 'LGD_V_583992', 'Pujaribanda', NULL, true, 583992, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(460, NULL, 'LGD_V_583942', 'Raktakandi', NULL, true, 583942, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(461, NULL, 'LGD_V_584001', 'Ramakrishnanagar', NULL, true, 584001, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(462, NULL, 'LGD_V_584083', 'Rampuduvalasa', NULL, true, 584083, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(463, NULL, 'LGD_V_583934', 'Ranajilleda', NULL, true, 583934, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(464, NULL, 'LGD_V_584084', 'Ranginiguda', NULL, true, 584084, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(465, NULL, 'LGD_V_584021', 'Ravvalaguda', NULL, true, 584021, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(466, NULL, 'LGD_V_584087', 'Rega', NULL, true, 584087, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(467, NULL, 'LGD_V_583946', 'Sabaka', NULL, true, 583946, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(468, NULL, 'LGD_V_584022', 'Sarabhaguda', NULL, true, 584022, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(469, NULL, 'LGD_V_583967', 'Sarubedda', NULL, true, 583967, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(470, NULL, 'LGD_V_584004', 'Sarubedda', NULL, true, 584004, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(471, NULL, 'LGD_V_584031', 'Siragam', NULL, true, 584031, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(472, NULL, 'LGD_V_584098', 'Sirasaguda', NULL, true, 584098, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(473, NULL, 'LGD_V_584072', 'Somelapadu', NULL, true, 584072, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(474, NULL, 'LGD_V_584078', 'Sukuruguda', NULL, true, 584078, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(475, NULL, 'LGD_V_584073', 'Sunkarametta', NULL, true, 584073, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(476, NULL, 'LGD_V_583990', 'Tadaka', NULL, true, 583990, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(477, NULL, 'LGD_V_583986', 'Tangulabedda', NULL, true, 583986, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(478, NULL, 'LGD_V_583981', 'Tidiguda', NULL, true, 583981, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(479, NULL, 'LGD_V_584043', 'Todubanda', NULL, true, 584043, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(480, NULL, 'LGD_V_584029', 'Tokavalasa', NULL, true, 584029, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(481, NULL, 'LGD_V_583998', 'Tokavalasa', NULL, true, 583998, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(482, NULL, 'LGD_V_583987', 'Toradambuvalasa', NULL, true, 583987, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(483, NULL, 'LGD_V_583965', 'Totavalasa', NULL, true, 583965, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(484, NULL, 'LGD_V_584093', 'Totavalasa', NULL, true, 584093, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(485, NULL, 'LGD_V_583939', 'Totavalasa', NULL, true, 583939, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(486, NULL, 'LGD_V_583994', 'Totavalasa', NULL, true, 583994, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(487, NULL, 'LGD_V_583936', 'Tudumu', NULL, true, 583936, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(488, NULL, 'LGD_V_583944', 'Tungagedda', NULL, true, 583944, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(489, NULL, 'LGD_V_583980', 'Urumulu', NULL, true, 583980, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(490, NULL, 'LGD_V_583982', 'Validipanasa', NULL, true, 583982, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(491, NULL, 'LGD_V_584096', 'Vanthalaguda', NULL, true, 584096, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(492, NULL, 'LGD_V_584049', 'Vanthamuru', NULL, true, 584049, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(493, NULL, 'LGD_V_584033', 'Varra', NULL, true, 584033, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(494, NULL, 'LGD_V_584025', 'Yandapallivalasa', NULL, true, 584025, 'LGD', false, '2026-10-31 21:17:56.052256+05:30', 4, 5),
	(495, NULL, 'LGD_V_585352', 'Anjalam', NULL, true, 585352, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(496, NULL, 'LGD_V_585197', 'Annavaram', NULL, true, 585197, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(497, NULL, 'LGD_V_585251', 'Antharla', NULL, true, 585251, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(498, NULL, 'LGD_V_585329', 'Asirada', NULL, true, 585329, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(499, NULL, 'LGD_V_585322', 'Baddimetta', NULL, true, 585322, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(500, NULL, 'LGD_V_585338', 'Balabadram', NULL, true, 585338, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(501, NULL, 'LGD_V_585252', 'Balajipeta', NULL, true, 585252, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(502, NULL, 'LGD_V_585152', 'Balapam', NULL, true, 585152, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(503, NULL, 'LGD_V_585203', 'Bandabayalu', NULL, true, 585203, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(504, NULL, 'LGD_V_585271', 'Bangarugummi', NULL, true, 585271, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(505, NULL, 'LGD_V_585277', 'Barikadorapakalu @ Rajupakalu', NULL, true, 585277, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(506, NULL, 'LGD_V_585266', 'Basangi Kothuru', NULL, true, 585266, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(507, NULL, 'LGD_V_585241', 'Bayalukinchangi', NULL, true, 585241, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(508, NULL, 'LGD_V_585265', 'Bayapadu', NULL, true, 585265, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(509, NULL, 'LGD_V_585366', 'Bemudichatru', NULL, true, 585366, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(510, NULL, 'LGD_V_585220', 'Bennavaram', NULL, true, 585220, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(511, NULL, 'LGD_V_585208', 'Bennavaram', NULL, true, 585208, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(512, NULL, 'LGD_V_585328', 'Bheemanapalle', NULL, true, 585328, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(513, NULL, 'LGD_V_585166', 'Bheemanupalle', NULL, true, 585166, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(514, NULL, 'LGD_V_585223', 'Bheemasingi', NULL, true, 585223, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(515, NULL, 'LGD_V_585184', 'Boddajuvvi', NULL, true, 585184, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(516, NULL, 'LGD_V_585160', 'Boddaputtu', NULL, true, 585160, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(517, NULL, 'LGD_V_585165', 'Bokkellu', NULL, true, 585165, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(518, NULL, 'LGD_V_585303', 'Borramamidi', NULL, true, 585303, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(519, NULL, 'LGD_V_585245', 'Bourthy', NULL, true, 585245, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(520, NULL, 'LGD_V_585334', 'Bowda', NULL, true, 585334, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(521, NULL, 'LGD_V_585310', 'Boyalagudem', NULL, true, 585310, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(522, NULL, 'LGD_V_585262', 'Budidapadu', NULL, true, 585262, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(523, NULL, 'LGD_V_585134', 'Buradamamidi', NULL, true, 585134, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(524, NULL, 'LGD_V_585260', 'Burisingi', NULL, true, 585260, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(525, NULL, 'LGD_V_585138', 'Burugubailu', NULL, true, 585138, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(526, NULL, 'LGD_V_585358', 'Busibanda', NULL, true, 585358, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(527, NULL, 'LGD_V_585346', 'Busulakota', NULL, true, 585346, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(528, NULL, 'LGD_V_585244', 'Chadalapadu', NULL, true, 585244, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(529, NULL, 'LGD_V_585250', 'Chadipeta', NULL, true, 585250, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(530, NULL, 'LGD_V_585236', 'Chavatapadu', NULL, true, 585236, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(531, NULL, 'LGD_V_585361', 'Cheemalabayalu', NULL, true, 585361, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(532, NULL, 'LGD_V_585239', 'Cherapalle', NULL, true, 585239, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(533, NULL, 'LGD_V_585201', 'Cherukumpakalu', NULL, true, 585201, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(534, NULL, 'LGD_V_585132', 'Cheruvuru', NULL, true, 585132, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(535, NULL, 'LGD_V_585253', 'Chilakalamamidi', NULL, true, 585253, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(536, NULL, 'LGD_V_585231', 'Chinna Gedda', NULL, true, 585231, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(537, NULL, 'LGD_V_585272', 'Chinna Rajupakalu', NULL, true, 585272, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(538, NULL, 'LGD_V_585316', 'Chinnabarada', NULL, true, 585316, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(539, NULL, 'LGD_V_585348', 'Chinnayyapalem', NULL, true, 585348, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(540, NULL, 'LGD_V_585377', 'Chintapalle (Ct)', NULL, true, 585377, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(541, NULL, 'LGD_V_585259', 'Chinthaluru', NULL, true, 585259, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(542, NULL, 'LGD_V_585323', 'Chitrallagoppu', NULL, true, 585323, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(543, NULL, 'LGD_V_585171', 'Chittamgaruvu', NULL, true, 585171, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(544, NULL, 'LGD_V_585249', 'Chowdupalle', NULL, true, 585249, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(545, NULL, 'LGD_V_585297', 'Dasuduveedhi', NULL, true, 585297, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(546, NULL, 'LGD_V_585226', 'Debbagaruvu', NULL, true, 585226, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(547, NULL, 'LGD_V_585217', 'Degalapalem', NULL, true, 585217, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(548, NULL, 'LGD_V_585136', 'Digavalasapalle', NULL, true, 585136, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(549, NULL, 'LGD_V_585131', 'Digijanaba', NULL, true, 585131, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(550, NULL, 'LGD_V_585319', 'Diguvapakalu', NULL, true, 585319, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(551, NULL, 'LGD_V_585195', 'Domalagondhi', NULL, true, 585195, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(552, NULL, 'LGD_V_585183', 'Dongalega', NULL, true, 585183, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(553, NULL, 'LGD_V_585162', 'Donipolalu', NULL, true, 585162, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(554, NULL, 'LGD_V_585375', 'Dovarapalle', NULL, true, 585375, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(555, NULL, 'LGD_V_585130', 'Egajanaba', NULL, true, 585130, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(556, NULL, 'LGD_V_585140', 'Egavalasapalle', NULL, true, 585140, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(557, NULL, 'LGD_V_585234', 'Gadapari', NULL, true, 585234, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(558, NULL, 'LGD_V_585355', 'Gaddibanda', NULL, true, 585355, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(559, NULL, 'LGD_V_585337', 'Gangavaram', NULL, true, 585337, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(560, NULL, 'LGD_V_585254', 'Ganugulapadu', NULL, true, 585254, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(561, NULL, 'LGD_V_585330', 'Gattumpakalu', NULL, true, 585330, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(562, NULL, 'LGD_V_585256', 'Genjigedda', NULL, true, 585256, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(563, NULL, 'LGD_V_585240', 'Genjigedda', NULL, true, 585240, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(564, NULL, 'LGD_V_585235', 'Gerrilagadda', NULL, true, 585235, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(565, NULL, 'LGD_V_585191', 'Gochapalle', NULL, true, 585191, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(566, NULL, 'LGD_V_585146', 'Goddibanda', NULL, true, 585146, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(567, NULL, 'LGD_V_585193', 'Godugulametta', NULL, true, 585193, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(568, NULL, 'LGD_V_585298', 'Godugumamidi', NULL, true, 585298, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(569, NULL, 'LGD_V_585218', 'Godugumamidi', NULL, true, 585218, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(570, NULL, 'LGD_V_585215', 'Godugumamidi', NULL, true, 585215, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(571, NULL, 'LGD_V_585320', 'Gondipakalu', NULL, true, 585320, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(572, NULL, 'LGD_V_585156', 'Goppugudiselu', NULL, true, 585156, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(573, NULL, 'LGD_V_585167', 'Gorrelametta', NULL, true, 585167, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(574, NULL, 'LGD_V_585178', 'Gosaigondhi', NULL, true, 585178, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(575, NULL, 'LGD_V_585247', 'Goyyalametta', NULL, true, 585247, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(576, NULL, 'LGD_V_585343', 'Gummidipalem', NULL, true, 585343, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(577, NULL, 'LGD_V_585369', 'Gunnamamidi', NULL, true, 585369, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(578, NULL, 'LGD_V_585149', 'Itikabedda', NULL, true, 585149, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(579, NULL, 'LGD_V_585179', 'Jaduguru', NULL, true, 585179, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(580, NULL, 'LGD_V_585289', 'Jangambanda', NULL, true, 585289, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(581, NULL, 'LGD_V_585363', 'Jangambuddi', NULL, true, 585363, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(582, NULL, 'LGD_V_585194', 'Jangampakalu', NULL, true, 585194, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(583, NULL, 'LGD_V_585276', 'Jangampakalu', NULL, true, 585276, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(584, NULL, 'LGD_V_585211', 'Jeelugumetta', NULL, true, 585211, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(585, NULL, 'LGD_V_585313', 'Jerrigedda', NULL, true, 585313, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(586, NULL, 'LGD_V_585186', 'Joharu', NULL, true, 585186, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(587, NULL, 'LGD_V_585151', 'Joheru', NULL, true, 585151, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(588, NULL, 'LGD_V_585205', 'Junnulu', NULL, true, 585205, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(589, NULL, 'LGD_V_585213', 'Kadasilpa', NULL, true, 585213, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(590, NULL, 'LGD_V_585304', 'Kagulabanda', NULL, true, 585304, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(591, NULL, 'LGD_V_585232', 'Kandulagodi', NULL, true, 585232, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(592, NULL, 'LGD_V_585374', 'Kapasupadu', NULL, true, 585374, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(593, NULL, 'LGD_V_585142', 'Kappagondhi', NULL, true, 585142, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(594, NULL, 'LGD_V_585219', 'Kappalu', NULL, true, 585219, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(595, NULL, 'LGD_V_585221', 'Karakapalle', NULL, true, 585221, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(596, NULL, 'LGD_V_585155', 'Karakapalle', NULL, true, 585155, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(597, NULL, 'LGD_V_585187', 'Kattubanda', NULL, true, 585187, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(598, NULL, 'LGD_V_585284', 'Kikkisalabanda', NULL, true, 585284, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(599, NULL, 'LGD_V_585172', 'Kilimisingi Durgam', NULL, true, 585172, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(600, NULL, 'LGD_V_585227', 'Kinnerla', NULL, true, 585227, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(601, NULL, 'LGD_V_585159', 'Kitumula', NULL, true, 585159, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(602, NULL, 'LGD_V_585335', 'Kitumula', NULL, true, 585335, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(603, NULL, 'LGD_V_585196', 'Kolanubanda', NULL, true, 585196, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(604, NULL, 'LGD_V_585230', 'Kolapari', NULL, true, 585230, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(605, NULL, 'LGD_V_585286', 'Kommangi', NULL, true, 585286, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(606, NULL, 'LGD_V_585315', 'Kondavanchula', NULL, true, 585315, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(607, NULL, 'LGD_V_585292', 'Korrabanda', NULL, true, 585292, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(608, NULL, 'LGD_V_585263', 'Korukonda', NULL, true, 585263, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(609, NULL, 'LGD_V_585135', 'Korukonda', NULL, true, 585135, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(610, NULL, 'LGD_V_585147', 'Kotagunnalu', NULL, true, 585147, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(611, NULL, 'LGD_V_585216', 'Kothapalem', NULL, true, 585216, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(612, NULL, 'LGD_V_585295', 'Kothaveedhi', NULL, true, 585295, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(613, NULL, 'LGD_V_585204', 'Kothavuru', NULL, true, 585204, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(614, NULL, 'LGD_V_585279', 'Krishnapuram', NULL, true, 585279, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(615, NULL, 'LGD_V_585141', 'Kudumulu', NULL, true, 585141, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(616, NULL, 'LGD_V_585145', 'Kudumusari', NULL, true, 585145, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(617, NULL, 'LGD_V_585285', 'Kudupusingi', NULL, true, 585285, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(618, NULL, 'LGD_V_585198', 'Kummarivanchala', NULL, true, 585198, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(619, NULL, 'LGD_V_585190', 'Kuramanapakalu', NULL, true, 585190, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(620, NULL, 'LGD_V_585341', 'Kurusingi', NULL, true, 585341, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(621, NULL, 'LGD_V_585275', 'Labbangi', NULL, true, 585275, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(622, NULL, 'LGD_V_585274', 'Labbangikothaveedhi', NULL, true, 585274, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(623, NULL, 'LGD_V_585367', 'Lakkavaram', NULL, true, 585367, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(624, NULL, 'LGD_V_585176', 'Lakshmipuram', NULL, true, 585176, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(625, NULL, 'LGD_V_585267', 'Lambadampalle', NULL, true, 585267, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(626, NULL, 'LGD_V_585129', 'Lammadampalle', NULL, true, 585129, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(627, NULL, 'LGD_V_585324', 'Lammasingi', NULL, true, 585324, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(628, NULL, 'LGD_V_585202', 'Lingalagudi', NULL, true, 585202, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(629, NULL, 'LGD_V_585199', 'Lothugedda', NULL, true, 585199, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(630, NULL, 'LGD_V_585283', 'Lubbagunta', NULL, true, 585283, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(631, NULL, 'LGD_V_585169', 'Lumburu', NULL, true, 585169, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(632, NULL, 'LGD_V_585278', 'Madigunta', NULL, true, 585278, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(633, NULL, 'LGD_V_585370', 'Madimabanda', NULL, true, 585370, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(634, NULL, 'LGD_V_585233', 'Mallavaram', NULL, true, 585233, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(635, NULL, 'LGD_V_585225', 'Mamidipalle', NULL, true, 585225, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(636, NULL, 'LGD_V_585154', 'Mandipalle', NULL, true, 585154, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(637, NULL, 'LGD_V_585270', 'Marrichettu Pakalu', NULL, true, 585270, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(638, NULL, 'LGD_V_585368', 'Matchalamamidi', NULL, true, 585368, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(639, NULL, 'LGD_V_585200', 'Meduru', NULL, true, 585200, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(640, NULL, 'LGD_V_585161', 'Merakalu', NULL, true, 585161, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(641, NULL, 'LGD_V_585356', 'Mulusubanda', NULL, true, 585356, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(642, NULL, 'LGD_V_585364', 'Munthamamidi', NULL, true, 585364, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(643, NULL, 'LGD_V_585373', 'Nadimipalem', NULL, true, 585373, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(644, NULL, 'LGD_V_585365', 'Nagraharam', NULL, true, 585365, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(645, NULL, 'LGD_V_585282', 'Nagulagondi', NULL, true, 585282, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(646, NULL, 'LGD_V_585148', 'Nimmalapadu', NULL, true, 585148, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(647, NULL, 'LGD_V_585354', 'Nimmalapalem', NULL, true, 585354, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(648, NULL, 'LGD_V_585325', 'Nuthibanda', NULL, true, 585325, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(649, NULL, 'LGD_V_585326', 'Ona Chakarayabanda', NULL, true, 585326, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(650, NULL, 'LGD_V_585339', 'Pakabu', NULL, true, 585339, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(651, NULL, 'LGD_V_585333', 'Palada', NULL, true, 585333, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(652, NULL, 'LGD_V_585376', 'Palamamidi', NULL, true, 585376, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(653, NULL, 'LGD_V_585287', 'Pamulachintabanda', NULL, true, 585287, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(654, NULL, 'LGD_V_585189', 'Panasalapadu', NULL, true, 585189, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(655, NULL, 'LGD_V_585243', 'Pandlimamidi', NULL, true, 585243, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(656, NULL, 'LGD_V_585288', 'Parikalu', NULL, true, 585288, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(657, NULL, 'LGD_V_585248', 'Pasuvulabanda', NULL, true, 585248, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(658, NULL, 'LGD_V_585340', 'Pathapadu', NULL, true, 585340, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(659, NULL, 'LGD_V_585317', 'Pedabarada', NULL, true, 585317, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(660, NULL, 'LGD_V_585175', 'Pedagaruvu', NULL, true, 585175, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(661, NULL, 'LGD_V_585177', 'Pedagondhi', NULL, true, 585177, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(662, NULL, 'LGD_V_585212', 'Pedakonda', NULL, true, 585212, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(663, NULL, 'LGD_V_585224', 'Pedapakalu', NULL, true, 585224, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(664, NULL, 'LGD_V_585238', 'Pina Kothuru', NULL, true, 585238, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(665, NULL, 'LGD_V_585210', 'Pinapadu', NULL, true, 585210, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(666, NULL, 'LGD_V_585206', 'Pinapadu', NULL, true, 585206, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(667, NULL, 'LGD_V_585360', 'Polamabanda', NULL, true, 585360, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(668, NULL, 'LGD_V_585291', 'Polugonta', NULL, true, 585291, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(819, NULL, 'LGD_V_583879', 'Sarai', NULL, true, 583879, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(669, NULL, 'LGD_V_585307', 'Porlubanda', NULL, true, 585307, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(670, NULL, 'LGD_V_585207', 'Pothurajugummalu', NULL, true, 585207, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(671, NULL, 'LGD_V_585305', 'Pothurajugunnalu', NULL, true, 585305, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(672, NULL, 'LGD_V_585359', 'Puligondhi', NULL, true, 585359, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(673, NULL, 'LGD_V_585174', 'Puligondi', NULL, true, 585174, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(674, NULL, 'LGD_V_585168', 'Pullalamamidi', NULL, true, 585168, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(675, NULL, 'LGD_V_585170', 'Pusalapalem', NULL, true, 585170, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(676, NULL, 'LGD_V_585301', 'Rachapanasa', NULL, true, 585301, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(677, NULL, 'LGD_V_585332', 'Rachapanukulu', NULL, true, 585332, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(678, NULL, 'LGD_V_585269', 'Rajubanda', NULL, true, 585269, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(679, NULL, 'LGD_V_585336', 'Rakota', NULL, true, 585336, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(680, NULL, 'LGD_V_585144', 'Rallagedda', NULL, true, 585144, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(681, NULL, 'LGD_V_585143', 'Rallagedda Kothuru', NULL, true, 585143, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(682, NULL, 'LGD_V_585327', 'Ravimanupakalu', NULL, true, 585327, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(683, NULL, 'LGD_V_585371', 'Rayipalem', NULL, true, 585371, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(684, NULL, 'LGD_V_585209', 'Regallu', NULL, true, 585209, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(685, NULL, 'LGD_V_585261', 'Regubailu', NULL, true, 585261, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(686, NULL, 'LGD_V_585290', 'Relangi', NULL, true, 585290, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(687, NULL, 'LGD_V_585299', 'Rolugunta', NULL, true, 585299, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(688, NULL, 'LGD_V_585258', 'Routhupayalu', NULL, true, 585258, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(689, NULL, 'LGD_V_585321', 'Rowrimthada', NULL, true, 585321, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(690, NULL, 'LGD_V_585257', 'Sadika', NULL, true, 585257, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(691, NULL, 'LGD_V_585255', 'Sallai', NULL, true, 585255, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(692, NULL, 'LGD_V_585294', 'Samagiri', NULL, true, 585294, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(693, NULL, 'LGD_V_585164', 'Sampangiputtu', NULL, true, 585164, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(694, NULL, 'LGD_V_585347', 'Sanivaram', NULL, true, 585347, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(695, NULL, 'LGD_V_585246', 'Sathyavaram', NULL, true, 585246, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(696, NULL, 'LGD_V_585311', 'Seetharamapuram', NULL, true, 585311, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(697, NULL, 'LGD_V_585357', 'Sheekayabanda', NULL, true, 585357, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(698, NULL, 'LGD_V_585350', 'Singavaram', NULL, true, 585350, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(699, NULL, 'LGD_V_585351', 'Singavaram Kothuru', NULL, true, 585351, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(700, NULL, 'LGD_V_585318', 'Siripuram', NULL, true, 585318, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(701, NULL, 'LGD_V_585181', 'Somavaram', NULL, true, 585181, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(702, NULL, 'LGD_V_585182', 'Suddagaruvu', NULL, true, 585182, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(703, NULL, 'LGD_V_585133', 'Tadlapalle', NULL, true, 585133, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(704, NULL, 'LGD_V_585331', 'Tajangi', NULL, true, 585331, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(705, NULL, 'LGD_V_585349', 'Tamarapalle', NULL, true, 585349, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(706, NULL, 'LGD_V_585173', 'Tammingala', NULL, true, 585173, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(707, NULL, 'LGD_V_585309', 'Tappulamamidi', NULL, true, 585309, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(708, NULL, 'LGD_V_585214', 'Teegalametta', NULL, true, 585214, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(709, NULL, 'LGD_V_585280', 'Terapalle', NULL, true, 585280, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(710, NULL, 'LGD_V_585273', 'Thallakota', NULL, true, 585273, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(711, NULL, 'LGD_V_585372', 'Thatibanda', NULL, true, 585372, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(712, NULL, 'LGD_V_585300', 'Thatibanda', NULL, true, 585300, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(713, NULL, 'LGD_V_585308', 'Thatipalem', NULL, true, 585308, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(714, NULL, 'LGD_V_585153', 'Tokapadu', NULL, true, 585153, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(715, NULL, 'LGD_V_585306', 'Totamamidi', NULL, true, 585306, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(716, NULL, 'LGD_V_585137', 'Turamamidi', NULL, true, 585137, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(717, NULL, 'LGD_V_585342', 'Turebongalu', NULL, true, 585342, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(718, NULL, 'LGD_V_585158', 'Turubongulu', NULL, true, 585158, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(719, NULL, 'LGD_V_585344', 'Ubalagaruvu', NULL, true, 585344, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(720, NULL, 'LGD_V_585222', 'Umrasigondi', NULL, true, 585222, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(721, NULL, 'LGD_V_585353', 'Usuruputtu', NULL, true, 585353, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(722, NULL, 'LGD_V_585242', 'Vamigedda', NULL, true, 585242, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(723, NULL, 'LGD_V_585237', 'Vamigedda Kothuru', NULL, true, 585237, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(724, NULL, 'LGD_V_585264', 'Vanajajulu', NULL, true, 585264, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(725, NULL, 'LGD_V_585163', 'Vanchuladurgam', NULL, true, 585163, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(726, NULL, 'LGD_V_585157', 'Vandanapalle', NULL, true, 585157, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(727, NULL, 'LGD_V_585362', 'Vandlamamidi', NULL, true, 585362, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(728, NULL, 'LGD_V_585228', 'Vangasari', NULL, true, 585228, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(729, NULL, 'LGD_V_585188', 'Vanthalapadu', NULL, true, 585188, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(730, NULL, 'LGD_V_585268', 'Vanthamamidi', NULL, true, 585268, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(731, NULL, 'LGD_V_585180', 'Varathanapalle', NULL, true, 585180, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(732, NULL, 'LGD_V_585185', 'Vedurupalle', NULL, true, 585185, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(733, NULL, 'LGD_V_585139', 'Veeravaram', NULL, true, 585139, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(734, NULL, 'LGD_V_585150', 'Velamjuvvi', NULL, true, 585150, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(735, NULL, 'LGD_V_585345', 'Vookabanda', NULL, true, 585345, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(736, NULL, 'LGD_V_585192', 'Votti Busulu', NULL, true, 585192, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(737, NULL, 'LGD_V_585229', 'Vurisingi', NULL, true, 585229, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(738, NULL, 'LGD_V_585296', 'Yernabili', NULL, true, 585296, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(739, NULL, 'LGD_V_585312', 'Yerrabanda', NULL, true, 585312, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(740, NULL, 'LGD_V_585281', 'Yerrabommalu', NULL, true, 585281, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(741, NULL, 'LGD_V_585314', 'Yerranabilli', NULL, true, 585314, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(742, NULL, 'LGD_V_585293', 'Yerravaram', NULL, true, 585293, 'LGD', false, '2026-10-31 21:18:11.137099+05:30', 5, 6),
	(743, NULL, 'LGD_V_583875', 'Anjoda', NULL, true, 583875, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(744, NULL, 'LGD_V_583902', 'Antriguda', NULL, true, 583902, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(745, NULL, 'LGD_V_583876', 'Araku', NULL, true, 583876, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(746, NULL, 'LGD_V_583906', 'Arama', NULL, true, 583906, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(747, NULL, 'LGD_V_583863', 'Badiyapadu', NULL, true, 583863, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(748, NULL, 'LGD_V_583923', 'Bairaguda', NULL, true, 583923, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(749, NULL, 'LGD_V_583910', 'Billaputtu', NULL, true, 583910, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(750, NULL, 'LGD_V_583856', 'Bitragonda', NULL, true, 583856, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(751, NULL, 'LGD_V_583931', 'Boddaputtu', NULL, true, 583931, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(752, NULL, 'LGD_V_583892', 'Bodimela', NULL, true, 583892, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(753, NULL, 'LGD_V_583930', 'Borrapalem', NULL, true, 583930, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(754, NULL, 'LGD_V_583854', 'Chamadapadu', NULL, true, 583854, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(755, NULL, 'LGD_V_583916', 'Champaputtu', NULL, true, 583916, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(756, NULL, 'LGD_V_583893', 'Chelimarivalasa', NULL, true, 583893, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(757, NULL, 'LGD_V_583850', 'Chinakaguvalasa', NULL, true, 583850, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(758, NULL, 'LGD_V_583887', 'Dathuru', NULL, true, 583887, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(759, NULL, 'LGD_V_583862', 'Demuduvalasa', NULL, true, 583862, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(760, NULL, 'LGD_V_583925', 'Dondalavalasa', NULL, true, 583925, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(761, NULL, 'LGD_V_583903', 'Dumbriguda', NULL, true, 583903, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(762, NULL, 'LGD_V_583880', 'Gadabagolugu', NULL, true, 583880, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(763, NULL, 'LGD_V_583922', 'Gandha', NULL, true, 583922, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(764, NULL, 'LGD_V_583860', 'Gasaba', NULL, true, 583860, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(765, NULL, 'LGD_V_583859', 'Gatharagilleda', NULL, true, 583859, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(766, NULL, 'LGD_V_583907', 'Godasortu', NULL, true, 583907, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(767, NULL, 'LGD_V_583909', 'Gondiguda', NULL, true, 583909, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(768, NULL, 'LGD_V_583932', 'Gondivalasa', NULL, true, 583932, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(769, NULL, 'LGD_V_583852', 'Goppilivalasa', NULL, true, 583852, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(770, NULL, 'LGD_V_583873', 'Gorapur', NULL, true, 583873, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(771, NULL, 'LGD_V_583933', 'Guntagannela', NULL, true, 583933, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(772, NULL, 'LGD_V_583890', 'Guntaseema', NULL, true, 583890, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(773, NULL, 'LGD_V_583895', 'Jamguda', NULL, true, 583895, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(774, NULL, 'LGD_V_583911', 'Jurripadu', NULL, true, 583911, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(775, NULL, 'LGD_V_583869', 'Kamalabanda', NULL, true, 583869, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(776, NULL, 'LGD_V_583897', 'Kandram', NULL, true, 583897, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(777, NULL, 'LGD_V_583865', 'Karakavalasa', NULL, true, 583865, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(778, NULL, 'LGD_V_583912', 'Kinchumanda', NULL, true, 583912, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(779, NULL, 'LGD_V_583883', 'Kinjeru', NULL, true, 583883, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(780, NULL, 'LGD_V_583847', 'Kiridivalasa', NULL, true, 583847, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(781, NULL, 'LGD_V_583919', 'Kithalangi', NULL, true, 583919, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(782, NULL, 'LGD_V_583855', 'Kollaputtu', NULL, true, 583855, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(783, NULL, 'LGD_V_583871', 'Koranjiguda', NULL, true, 583871, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(784, NULL, 'LGD_V_583926', 'Korra', NULL, true, 583926, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(785, NULL, 'LGD_V_583858', 'Korrai', NULL, true, 583858, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(786, NULL, 'LGD_V_583915', 'Kosangi', NULL, true, 583915, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(787, NULL, 'LGD_V_583851', 'Kotragondi', NULL, true, 583851, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(788, NULL, 'LGD_V_583870', 'Kuda', NULL, true, 583870, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(789, NULL, 'LGD_V_583884', 'Kujabangi', NULL, true, 583884, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(790, NULL, 'LGD_V_583877', 'Kuridi', NULL, true, 583877, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(791, NULL, 'LGD_V_583913', 'Kusumavalasa', NULL, true, 583913, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(792, NULL, 'LGD_V_583886', 'Kutti', NULL, true, 583886, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(793, NULL, 'LGD_V_583891', 'Lakka', NULL, true, 583891, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(794, NULL, 'LGD_V_583904', 'Livitiputtu', NULL, true, 583904, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(795, NULL, 'LGD_V_583861', 'Logili', NULL, true, 583861, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(796, NULL, 'LGD_V_583889', 'Lyganda', NULL, true, 583889, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(797, NULL, 'LGD_V_583867', 'Malinguvalasa', NULL, true, 583867, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(798, NULL, 'LGD_V_583848', 'Mallivalasa', NULL, true, 583848, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(799, NULL, 'LGD_V_583927', 'Mamidivalasa', NULL, true, 583927, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(800, NULL, 'LGD_V_583921', 'Morriguda', NULL, true, 583921, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(801, NULL, 'LGD_V_583894', 'Musiri', NULL, true, 583894, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(802, NULL, 'LGD_V_583918', 'Nandiguda', NULL, true, 583918, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(803, NULL, 'LGD_V_929961', 'Nandivalasa', NULL, true, 929961, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(804, NULL, 'LGD_V_583878', 'Nimmagedda', NULL, true, 583878, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(805, NULL, 'LGD_V_583882', 'Ombi', NULL, true, 583882, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(806, NULL, 'LGD_V_583929', 'Padi', NULL, true, 583929, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(807, NULL, 'LGD_V_583853', 'Panasavalasa', NULL, true, 583853, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(808, NULL, 'LGD_V_583900', 'Pantalachinta', NULL, true, 583900, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(809, NULL, 'LGD_V_583898', 'Paridi', NULL, true, 583898, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(810, NULL, 'LGD_V_583928', 'Pariseela', NULL, true, 583928, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(811, NULL, 'LGD_V_583901', 'Pedapadu', NULL, true, 583901, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(812, NULL, 'LGD_V_583899', 'Pothangi', NULL, true, 583899, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(813, NULL, 'LGD_V_583885', 'Rangilisingi', NULL, true, 583885, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(814, NULL, 'LGD_V_583908', 'Ranginiguda', NULL, true, 583908, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(815, NULL, 'LGD_V_583849', 'Ranginivalasa', NULL, true, 583849, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(816, NULL, 'LGD_V_583874', 'Sagara', NULL, true, 583874, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(817, NULL, 'LGD_V_583868', 'Sagirivalasa', NULL, true, 583868, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(818, NULL, 'LGD_V_583924', 'Sangamvalasa', NULL, true, 583924, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(820, NULL, 'LGD_V_583917', 'Seelamgondi', NULL, true, 583917, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(821, NULL, 'LGD_V_583896', 'Sornayakguda @ Surusyaguda', NULL, true, 583896, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(822, NULL, 'LGD_V_583864', 'Sovva', NULL, true, 583864, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(823, NULL, 'LGD_V_583857', 'Thotavalasa', NULL, true, 583857, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(824, NULL, 'LGD_V_583888', 'Thutangi', NULL, true, 583888, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(825, NULL, 'LGD_V_583881', 'Ujjangi', NULL, true, 583881, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(826, NULL, 'LGD_V_583914', 'Uyyalaputtu', NULL, true, 583914, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(827, NULL, 'LGD_V_583866', 'Vadiyavalasa @ Vaddevalasa', NULL, true, 583866, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(828, NULL, 'LGD_V_583905', 'Vantharla', NULL, true, 583905, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(829, NULL, 'LGD_V_583872', 'Vasabanda', NULL, true, 583872, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(830, NULL, 'LGD_V_583920', 'Vayya', NULL, true, 583920, 'LGD', false, '2026-10-31 21:18:25.196201+05:30', 6, 7),
	(831, NULL, 'LGD_V_584868', 'A.Bandaveedhi', NULL, true, 584868, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(832, NULL, 'LGD_V_585042', 'Addulu', NULL, true, 585042, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(833, NULL, 'LGD_V_584901', 'Agampadu', NULL, true, 584901, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(834, NULL, 'LGD_V_585074', 'Akuthota', NULL, true, 585074, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(835, NULL, 'LGD_V_584821', 'Alagam', NULL, true, 584821, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(836, NULL, 'LGD_V_585071', 'Ambalamamidi', NULL, true, 585071, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(837, NULL, 'LGD_V_585122', 'Ambili Mamidi', NULL, true, 585122, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(838, NULL, 'LGD_V_584887', 'Anarbha', NULL, true, 584887, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(839, NULL, 'LGD_V_584979', 'Andanapalle', NULL, true, 584979, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(840, NULL, 'LGD_V_584968', 'Andangisingi', NULL, true, 584968, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(841, NULL, 'LGD_V_584864', 'Aragadapalle', NULL, true, 584864, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(842, NULL, 'LGD_V_585092', 'Bagarugudi', NULL, true, 585092, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(843, NULL, 'LGD_V_584973', 'Balamanusanka', NULL, true, 584973, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(844, NULL, 'LGD_V_584931', 'Balijipeta', NULL, true, 584931, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(845, NULL, 'LGD_V_584962', 'Bandaveedhi', NULL, true, 584962, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(846, NULL, 'LGD_V_585111', 'Bangarudoddi', NULL, true, 585111, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(847, NULL, 'LGD_V_585048', 'Bangarumamidi', NULL, true, 585048, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(848, NULL, 'LGD_V_584892', 'Baram', NULL, true, 584892, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(849, NULL, 'LGD_V_585037', 'Barisingi', NULL, true, 585037, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(850, NULL, 'LGD_V_585017', 'Barsingimetta', NULL, true, 585017, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(851, NULL, 'LGD_V_584884', 'Beeram', NULL, true, 584884, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(852, NULL, 'LGD_V_585012', 'Bheemaloya', NULL, true, 585012, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(853, NULL, 'LGD_V_584994', 'Bobbampadu', NULL, true, 584994, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(854, NULL, 'LGD_V_584986', 'Boddagondi', NULL, true, 584986, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(855, NULL, 'LGD_V_584859', 'Boddagondi', NULL, true, 584859, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(856, NULL, 'LGD_V_585073', 'Boddapadu', NULL, true, 585073, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(857, NULL, 'LGD_V_584874', 'Boddaputtu', NULL, true, 584874, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(858, NULL, 'LGD_V_584881', 'Boddaputtu', NULL, true, 584881, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(859, NULL, 'LGD_V_585085', 'Boddumamidi', NULL, true, 585085, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(860, NULL, 'LGD_V_584836', 'Boithela @ Bonkatili', NULL, true, 584836, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(861, NULL, 'LGD_V_584873', 'Bondapalle', NULL, true, 584873, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(862, NULL, 'LGD_V_585054', 'Bondulapanuku', NULL, true, 585054, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(863, NULL, 'LGD_V_584928', 'Borramamidi', NULL, true, 584928, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(864, NULL, 'LGD_V_584806', 'Buradaveedhi', NULL, true, 584806, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(865, NULL, 'LGD_V_584907', 'Buruguveedhi', NULL, true, 584907, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(866, NULL, 'LGD_V_584818', 'Busipalle', NULL, true, 584818, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(867, NULL, 'LGD_V_584929', 'Busipalle', NULL, true, 584929, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(868, NULL, 'LGD_V_584972', 'Busipalle', NULL, true, 584972, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(869, NULL, 'LGD_V_584841', 'Busulakota', NULL, true, 584841, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(870, NULL, 'LGD_V_585118', 'Buttakota', NULL, true, 585118, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(871, NULL, 'LGD_V_584837', 'Chapagedda', NULL, true, 584837, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(872, NULL, 'LGD_V_584919', 'Cheekumbanda', NULL, true, 584919, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(873, NULL, 'LGD_V_584948', 'Cheemakurapalem', NULL, true, 584948, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(874, NULL, 'LGD_V_584908', 'Chepalle', NULL, true, 584908, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(875, NULL, 'LGD_V_585117', 'Chilakala Mamidi', NULL, true, 585117, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(876, NULL, 'LGD_V_585088', 'Chilakala Mamidi', NULL, true, 585088, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(877, NULL, 'LGD_V_584819', 'Chilakalapalem', NULL, true, 584819, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(878, NULL, 'LGD_V_584801', 'Chilakapanasa', NULL, true, 584801, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(879, NULL, 'LGD_V_585002', 'China Kantavaram', NULL, true, 585002, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(880, NULL, 'LGD_V_585020', 'Chinaporlu', NULL, true, 585020, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(881, NULL, 'LGD_V_585032', 'Chinna Pinapalem', NULL, true, 585032, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(882, NULL, 'LGD_V_584985', 'Chinnakothuru', NULL, true, 584985, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(883, NULL, 'LGD_V_585008', 'Chinnalochali', NULL, true, 585008, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(884, NULL, 'LGD_V_584953', 'Chinnaurumu', NULL, true, 584953, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(885, NULL, 'LGD_V_584965', 'Chintalagondi', NULL, true, 584965, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(886, NULL, 'LGD_V_585081', 'Chintaluru', NULL, true, 585081, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(887, NULL, 'LGD_V_584992', 'Chinthakota', NULL, true, 584992, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(888, NULL, 'LGD_V_584987', 'Chittampadu', NULL, true, 584987, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(889, NULL, 'LGD_V_584876', 'Chittamputtu', NULL, true, 584876, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(890, NULL, 'LGD_V_584878', 'Chittugummi', NULL, true, 584878, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(891, NULL, 'LGD_V_585102', 'Churulapanuku', NULL, true, 585102, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(892, NULL, 'LGD_V_585065', 'Chuttukota', NULL, true, 585065, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(893, NULL, 'LGD_V_585047', 'Dabbagaruvu', NULL, true, 585047, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(894, NULL, 'LGD_V_584956', 'Darlamgondi', NULL, true, 584956, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(895, NULL, 'LGD_V_585038', 'Degalapalem', NULL, true, 585038, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(896, NULL, 'LGD_V_585000', 'Degalarai', NULL, true, 585000, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(897, NULL, 'LGD_V_584922', 'Devarapalle', NULL, true, 584922, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(898, NULL, 'LGD_V_584845', 'Digarapalle', NULL, true, 584845, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(899, NULL, 'LGD_V_584851', 'Dippalagondi', NULL, true, 584851, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(900, NULL, 'LGD_V_585124', 'Donimamidi', NULL, true, 585124, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(901, NULL, 'LGD_V_584988', 'G.Kothuru', NULL, true, 584988, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(902, NULL, 'LGD_V_584969', 'G.M.Kothuru', NULL, true, 584969, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(903, NULL, 'LGD_V_584909', 'G.Nittaputtu', NULL, true, 584909, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(904, NULL, 'LGD_V_584966', 'Gadderai', NULL, true, 584966, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(905, NULL, 'LGD_V_584849', 'Gadigunta', NULL, true, 584849, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(906, NULL, 'LGD_V_585019', 'Gadrayi', NULL, true, 585019, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(907, NULL, 'LGD_V_585022', 'Gaduthuru', NULL, true, 585022, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(908, NULL, 'LGD_V_584940', 'Galipadu', NULL, true, 584940, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(909, NULL, 'LGD_V_585033', 'Gangadevigudi', NULL, true, 585033, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(910, NULL, 'LGD_V_585050', 'Ganjigedda', NULL, true, 585050, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(911, NULL, 'LGD_V_584899', 'Gannelba', NULL, true, 584899, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(912, NULL, 'LGD_V_584964', 'Ganneruputtu', NULL, true, 584964, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(913, NULL, 'LGD_V_585052', 'Ganugurolu', NULL, true, 585052, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(914, NULL, 'LGD_V_585110', 'Ganugurolu', NULL, true, 585110, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(915, NULL, 'LGD_V_584802', 'Garisingi', NULL, true, 584802, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(916, NULL, 'LGD_V_584932', 'Gedalabanda', NULL, true, 584932, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(917, NULL, 'LGD_V_584984', 'Gemmeli', NULL, true, 584984, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(918, NULL, 'LGD_V_585072', 'Gemmelibaru', NULL, true, 585072, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(919, NULL, 'LGD_V_585024', 'Godda', NULL, true, 585024, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(920, NULL, 'LGD_V_585056', 'Goddalikarra', NULL, true, 585056, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(921, NULL, 'LGD_V_584957', 'Goddubusulu', NULL, true, 584957, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(922, NULL, 'LGD_V_585039', 'Goddukuralabanda', NULL, true, 585039, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(923, NULL, 'LGD_V_585013', 'Godugumamidi', NULL, true, 585013, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(924, NULL, 'LGD_V_584997', 'Golagonda', NULL, true, 584997, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(925, NULL, 'LGD_V_585018', 'Gompam', NULL, true, 585018, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(926, NULL, 'LGD_V_584981', 'Gondimelaka', NULL, true, 584981, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(927, NULL, 'LGD_V_585003', 'Gondipadu', NULL, true, 585003, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(928, NULL, 'LGD_V_584833', 'Gondipalle', NULL, true, 584833, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(929, NULL, 'LGD_V_585005', 'Gonduru@ Y.B.Gonduru', NULL, true, 585005, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(930, NULL, 'LGD_V_585090', 'Goradalu', NULL, true, 585090, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(931, NULL, 'LGD_V_585068', 'Gorrilaputtu', NULL, true, 585068, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(932, NULL, 'LGD_V_584930', 'Goyyigunta', NULL, true, 584930, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(933, NULL, 'LGD_V_585099', 'Gummadigondi', NULL, true, 585099, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(934, NULL, 'LGD_V_585106', 'Gummaveedhi', NULL, true, 585106, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(935, NULL, 'LGD_V_585091', 'Guntapalle', NULL, true, 585091, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(936, NULL, 'LGD_V_585126', 'Gurrala Nunni', NULL, true, 585126, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(937, NULL, 'LGD_V_585057', 'Gurralagummi', NULL, true, 585057, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(938, NULL, 'LGD_V_585006', 'Gurrayi', NULL, true, 585006, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(939, NULL, 'LGD_V_585063', 'Indugula', NULL, true, 585063, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(940, NULL, 'LGD_V_584828', 'Jamulaveedhi', NULL, true, 584828, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(941, NULL, 'LGD_V_584905', 'Jannera', NULL, true, 584905, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(942, NULL, 'LGD_V_585030', 'Jarrai', NULL, true, 585030, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(943, NULL, 'LGD_V_584829', 'Jeelugulagoyya', NULL, true, 584829, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(944, NULL, 'LGD_V_585075', 'Jerrai', NULL, true, 585075, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(945, NULL, 'LGD_V_584971', 'Jogulaputtu', NULL, true, 584971, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(946, NULL, 'LGD_V_585059', 'Jolamputtu', NULL, true, 585059, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(947, NULL, 'LGD_V_585125', 'Jurrai', NULL, true, 585125, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(948, NULL, 'LGD_V_584810', 'K.Bandaveedhi', NULL, true, 584810, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(949, NULL, 'LGD_V_584970', 'K.G.Madugula', NULL, true, 584970, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(950, NULL, 'LGD_V_584963', 'K.Kodapalle', NULL, true, 584963, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(951, NULL, 'LGD_V_585045', 'Kajjapalle', NULL, true, 585045, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(952, NULL, 'LGD_V_584867', 'Kandulagade', NULL, true, 584867, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(953, NULL, 'LGD_V_585036', 'Kangulabanda', NULL, true, 585036, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(954, NULL, 'LGD_V_584807', 'Kappalu', NULL, true, 584807, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(955, NULL, 'LGD_V_584872', 'Karakapalle', NULL, true, 584872, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(956, NULL, 'LGD_V_585098', 'Karebanda', NULL, true, 585098, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(957, NULL, 'LGD_V_584910', 'Karnikalanka', NULL, true, 584910, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(958, NULL, 'LGD_V_585120', 'Kichannoli', NULL, true, 585120, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(959, NULL, 'LGD_V_584813', 'Killamkota', NULL, true, 584813, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(960, NULL, 'LGD_V_584823', 'Killupalle', NULL, true, 584823, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(961, NULL, 'LGD_V_584949', 'Kimudupalle', NULL, true, 584949, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(962, NULL, 'LGD_V_584938', 'Kinagari', NULL, true, 584938, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(963, NULL, 'LGD_V_584889', 'Kitumulu', NULL, true, 584889, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(964, NULL, 'LGD_V_584808', 'Kodimamidi', NULL, true, 584808, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(965, NULL, 'LGD_V_585104', 'Kodimamidi', NULL, true, 585104, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(966, NULL, 'LGD_V_584918', 'Kokkirapalle', NULL, true, 584918, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(967, NULL, 'LGD_V_584991', 'Kolambora', NULL, true, 584991, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(968, NULL, 'LGD_V_585016', 'Kondabheemapalem', NULL, true, 585016, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(969, NULL, 'LGD_V_584890', 'Korapalle', NULL, true, 584890, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(970, NULL, 'LGD_V_584941', 'Korrapadu', NULL, true, 584941, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(971, NULL, 'LGD_V_585119', 'Kotha Kondalu', NULL, true, 585119, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(972, NULL, 'LGD_V_585066', 'Kothakundalu', NULL, true, 585066, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(973, NULL, 'LGD_V_585025', 'Kothapalle', NULL, true, 585025, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(974, NULL, 'LGD_V_584975', 'Kothurupadu', NULL, true, 584975, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(975, NULL, 'LGD_V_584936', 'Krishnapuram', NULL, true, 584936, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(976, NULL, 'LGD_V_585031', 'Kuddangi', NULL, true, 585031, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(977, NULL, 'LGD_V_584951', 'Kulupadu', NULL, true, 584951, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(978, NULL, 'LGD_V_585007', 'Kumbidisingi', NULL, true, 585007, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(979, NULL, 'LGD_V_584847', 'Kumburla', NULL, true, 584847, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(980, NULL, 'LGD_V_585064', 'Kummaragunta', NULL, true, 585064, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(981, NULL, 'LGD_V_584995', 'Kuneti', NULL, true, 584995, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(982, NULL, 'LGD_V_584939', 'Kuntalam', NULL, true, 584939, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(983, NULL, 'LGD_V_584983', 'Kuntipalle', NULL, true, 584983, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(984, NULL, 'LGD_V_585116', 'Kuntupalle', NULL, true, 585116, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(985, NULL, 'LGD_V_584809', 'Kuridilu', NULL, true, 584809, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(986, NULL, 'LGD_V_585078', 'Labbarla', NULL, true, 585078, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(987, NULL, 'LGD_V_585069', 'Lakkapadu', NULL, true, 585069, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(988, NULL, 'LGD_V_584917', 'Lakkulu', NULL, true, 584917, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(989, NULL, 'LGD_V_584947', 'Luvvapalle', NULL, true, 584947, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(990, NULL, 'LGD_V_584895', 'M.Nittaputtu', NULL, true, 584895, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(991, NULL, 'LGD_V_584805', 'Madathakonda', NULL, true, 584805, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(992, NULL, 'LGD_V_584840', 'Maddigaruvu', NULL, true, 584840, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(993, NULL, 'LGD_V_584858', 'Maddiveedhi', NULL, true, 584858, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(994, NULL, 'LGD_V_584952', 'Maddulabanda', NULL, true, 584952, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(995, NULL, 'LGD_V_584915', 'Madhuramamidi', NULL, true, 584915, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(996, NULL, 'LGD_V_936620', 'Mahadevapuram', NULL, true, 936620, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(997, NULL, 'LGD_V_585093', 'Mallipadu', NULL, true, 585093, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(998, NULL, 'LGD_V_584834', 'Mandibha', NULL, true, 584834, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(999, NULL, 'LGD_V_585009', 'Mandigaruvu', NULL, true, 585009, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1000, NULL, 'LGD_V_584883', 'Mandivanam', NULL, true, 584883, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1001, NULL, 'LGD_V_584817', 'Manepalle', NULL, true, 584817, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1002, NULL, 'LGD_V_585021', 'Mangathapalem', NULL, true, 585021, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1003, NULL, 'LGD_V_584924', 'Marripalem', NULL, true, 584924, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1004, NULL, 'LGD_V_584960', 'Matchyapuram', NULL, true, 584960, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1005, NULL, 'LGD_V_585067', 'Mettapadu', NULL, true, 585067, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1006, NULL, 'LGD_V_584945', 'Mittalapadu', NULL, true, 584945, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1007, NULL, 'LGD_V_585103', 'Molikalu', NULL, true, 585103, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1008, NULL, 'LGD_V_585060', 'Mondikota', NULL, true, 585060, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1009, NULL, 'LGD_V_584857', 'Mosaidipanuku Kothuru', NULL, true, 584857, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1010, NULL, 'LGD_V_584875', 'Mulagaruvu', NULL, true, 584875, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1011, NULL, 'LGD_V_584982', 'Mulagaruvu', NULL, true, 584982, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1012, NULL, 'LGD_V_584978', 'Mulakaiputtu', NULL, true, 584978, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1013, NULL, 'LGD_V_585082', 'Neyyalabanda', NULL, true, 585082, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1014, NULL, 'LGD_V_585080', 'Nittamamidi', NULL, true, 585080, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1015, NULL, 'LGD_V_584855', 'Nugumamidi', NULL, true, 584855, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1016, NULL, 'LGD_V_584856', 'Nurmathi', NULL, true, 584856, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1017, NULL, 'LGD_V_585101', 'Olimamidi', NULL, true, 585101, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1018, NULL, 'LGD_V_585100', 'Omtampadu', NULL, true, 585100, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1019, NULL, 'LGD_V_584958', 'P.G.Madugula', NULL, true, 584958, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1020, NULL, 'LGD_V_585046', 'Pacheli', NULL, true, 585046, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1021, NULL, 'LGD_V_585023', 'Pachinapalle', NULL, true, 585023, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1022, NULL, 'LGD_V_584926', 'Padmapuram', NULL, true, 584926, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1023, NULL, 'LGD_V_584896', 'Palakonda', NULL, true, 584896, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1024, NULL, 'LGD_V_585087', 'Palamamidi', NULL, true, 585087, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1025, NULL, 'LGD_V_584869', 'Palamamidi', NULL, true, 584869, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1026, NULL, 'LGD_V_585035', 'Panasalagedda', NULL, true, 585035, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1027, NULL, 'LGD_V_584843', 'Panasapalle', NULL, true, 584843, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1028, NULL, 'LGD_V_585107', 'Peda Bayalu', NULL, true, 585107, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1029, NULL, 'LGD_V_584865', 'Peda Luvvasingi', NULL, true, 584865, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1030, NULL, 'LGD_V_585083', 'Pedagedda', NULL, true, 585083, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1031, NULL, 'LGD_V_584888', 'Pedajageeru', NULL, true, 584888, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1032, NULL, 'LGD_V_585010', 'Pedakantavaram', NULL, true, 585010, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1033, NULL, 'LGD_V_584898', 'Pedakonda', NULL, true, 584898, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1034, NULL, 'LGD_V_584954', 'Pedalanka', NULL, true, 584954, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1035, NULL, 'LGD_V_584976', 'Pedapadu', NULL, true, 584976, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1036, NULL, 'LGD_V_585070', 'Pedaporlu', NULL, true, 585070, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1037, NULL, 'LGD_V_584955', 'Pedaurumu', NULL, true, 584955, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1038, NULL, 'LGD_V_585043', 'Pedavalasa', NULL, true, 585043, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1039, NULL, 'LGD_V_585112', 'Pedavalasa', NULL, true, 585112, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1040, NULL, 'LGD_V_584942', 'Pedda Kiltaru', NULL, true, 584942, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1041, NULL, 'LGD_V_585058', 'Peddabayalu', NULL, true, 585058, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1042, NULL, 'LGD_V_584838', 'Peddagaruvu', NULL, true, 584838, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1043, NULL, 'LGD_V_585026', 'Peddalochale', NULL, true, 585026, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1044, NULL, 'LGD_V_585051', 'Peddapinapalem', NULL, true, 585051, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1045, NULL, 'LGD_V_585121', 'Peddapolam', NULL, true, 585121, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1046, NULL, 'LGD_V_584934', 'Pina Kiltharu', NULL, true, 584934, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1047, NULL, 'LGD_V_584846', 'Pinajageeru', NULL, true, 584846, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1048, NULL, 'LGD_V_930998', 'Pinalochali', 'పినలోచలి', true, 930998, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1049, NULL, 'LGD_V_584862', 'Pinaluvvasingi', NULL, true, 584862, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1050, NULL, 'LGD_V_585115', 'Pinnapolam', NULL, true, 585115, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1051, NULL, 'LGD_V_585044', 'Pisumamidi', NULL, true, 585044, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1052, NULL, 'LGD_V_585079', 'Pittagullu @ Pittagudlu', NULL, true, 585079, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1053, NULL, 'LGD_V_585094', 'Polamanugedda', NULL, true, 585094, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1054, NULL, 'LGD_V_585062', 'Porlu', NULL, true, 585062, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1055, NULL, 'LGD_V_584944', 'Porlubanda', NULL, true, 584944, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1056, NULL, 'LGD_V_584825', 'Porlugunta', NULL, true, 584825, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1057, NULL, 'LGD_V_584897', 'Pulagondi', NULL, true, 584897, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1058, NULL, 'LGD_V_584844', 'Pulusumamidi', NULL, true, 584844, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1059, NULL, 'LGD_V_584831', 'Putikametta', NULL, true, 584831, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1060, NULL, 'LGD_V_585128', 'Rachakanuku', NULL, true, 585128, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1061, NULL, 'LGD_V_584912', 'Rachapalle', NULL, true, 584912, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1062, NULL, 'LGD_V_585027', 'Rachapanuku', NULL, true, 585027, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1063, NULL, 'LGD_V_584832', 'Rachaveedhi', NULL, true, 584832, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1064, NULL, 'LGD_V_585015', 'Rallaputtu', NULL, true, 585015, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1065, NULL, 'LGD_V_584990', 'Ramachandrapalem', NULL, true, 584990, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1066, NULL, 'LGD_V_584914', 'Reemali', NULL, true, 584914, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1067, NULL, 'LGD_V_584877', 'Regadi', NULL, true, 584877, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1068, NULL, 'LGD_V_584804', 'Reyyalagedda', NULL, true, 584804, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1069, NULL, 'LGD_V_584894', 'Rolangiputtu', NULL, true, 584894, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1070, NULL, 'LGD_V_584959', 'Rolangiputtu', NULL, true, 584959, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1071, NULL, 'LGD_V_585076', 'Rolugunta', NULL, true, 585076, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1072, NULL, 'LGD_V_585089', 'Roppulu', NULL, true, 585089, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1073, NULL, 'LGD_V_584891', 'Rudibayalu', NULL, true, 584891, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1074, NULL, 'LGD_V_585014', 'S.Kothuru', NULL, true, 585014, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1075, NULL, 'LGD_V_585077', 'Sadangi', NULL, true, 585077, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1076, NULL, 'LGD_V_584893', 'Sadeku', NULL, true, 584893, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1077, NULL, 'LGD_V_584885', 'Salimerangi', NULL, true, 584885, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1078, NULL, 'LGD_V_584993', 'Sampangi Puttu', NULL, true, 584993, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1079, NULL, 'LGD_V_584961', 'Sangam', NULL, true, 584961, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1080, NULL, 'LGD_V_584937', 'Sangambanda', NULL, true, 584937, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1081, NULL, 'LGD_V_584863', 'Sanguloya', NULL, true, 584863, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1082, NULL, 'LGD_V_584811', 'Sankulamaddi', NULL, true, 584811, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1083, NULL, 'LGD_V_584927', 'Sariya', NULL, true, 584927, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1084, NULL, 'LGD_V_584814', 'Sariyapalle', NULL, true, 584814, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1085, NULL, 'LGD_V_585055', 'Seetabanda', NULL, true, 585055, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1086, NULL, 'LGD_V_584839', 'Singam Valasa', NULL, true, 584839, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1087, NULL, 'LGD_V_584999', 'Singarajupeta', NULL, true, 584999, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1088, NULL, 'LGD_V_584830', 'Singarbagondi', NULL, true, 584830, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1089, NULL, 'LGD_V_584911', 'Singarbha', NULL, true, 584911, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1090, NULL, 'LGD_V_584827', 'Sirasapalle', NULL, true, 584827, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1091, NULL, 'LGD_V_584870', 'Sirlabanda', NULL, true, 584870, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1092, NULL, 'LGD_V_585011', 'Solabham', NULL, true, 585011, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1093, NULL, 'LGD_V_584826', 'Sopalu', NULL, true, 584826, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1094, NULL, 'LGD_V_584835', 'Subbulu', NULL, true, 584835, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1095, NULL, 'LGD_V_584820', 'Surimetta', NULL, true, 584820, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1096, NULL, 'LGD_V_584880', 'Surtipalle', NULL, true, 584880, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1097, NULL, 'LGD_V_584803', 'Surtipalle', NULL, true, 584803, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1098, NULL, 'LGD_V_584935', 'Suvvapadu', NULL, true, 584935, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1099, NULL, 'LGD_V_585109', 'Talabarsingi', NULL, true, 585109, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1100, NULL, 'LGD_V_585084', 'Talabarusingi', NULL, true, 585084, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1101, NULL, 'LGD_V_584866', 'Tarabusingi', NULL, true, 584866, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1102, NULL, 'LGD_V_584824', 'Tartalu', NULL, true, 584824, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1103, NULL, 'LGD_V_585096', 'Tene Bandalu', NULL, true, 585096, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1104, NULL, 'LGD_V_584950', 'Terlamamidi', NULL, true, 584950, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1105, NULL, 'LGD_V_584886', 'Thadiveedhi', NULL, true, 584886, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1106, NULL, 'LGD_V_584882', 'Thaggimetta', NULL, true, 584882, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1107, NULL, 'LGD_V_585086', 'Thallimamidi', NULL, true, 585086, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1108, NULL, 'LGD_V_584946', 'Thatipalem', NULL, true, 584946, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1109, NULL, 'LGD_V_584860', 'Thiyyagundam', NULL, true, 584860, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1110, NULL, 'LGD_V_585097', 'Thoka Chilaka', NULL, true, 585097, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1111, NULL, 'LGD_V_584925', 'Thoka Rai', NULL, true, 584925, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1112, NULL, 'LGD_V_585001', 'Thotalagondi', NULL, true, 585001, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1113, NULL, 'LGD_V_584904', 'Thummedala Neredu', NULL, true, 584904, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1114, NULL, 'LGD_V_585114', 'Tiyyamamidi', NULL, true, 585114, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1115, NULL, 'LGD_V_585029', 'Tiyyamamidi', NULL, true, 585029, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1116, NULL, 'LGD_V_585108', 'Totamamidi', NULL, true, 585108, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1117, NULL, 'LGD_V_584903', 'Ubalagaruvu', NULL, true, 584903, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1118, NULL, 'LGD_V_584977', 'Udapalam', NULL, true, 584977, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1119, NULL, 'LGD_V_584980', 'Ullikallalabanda', NULL, true, 584980, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1120, NULL, 'LGD_V_584933', 'Ullivarapadu', NULL, true, 584933, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1121, NULL, 'LGD_V_584967', 'Urlumetta', NULL, true, 584967, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1122, NULL, 'LGD_V_584850', 'Vakapalle', NULL, true, 584850, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1123, NULL, 'LGD_V_585113', 'Valam Mamidi', NULL, true, 585113, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1124, NULL, 'LGD_V_584879', 'Valasamamidi', NULL, true, 584879, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1125, NULL, 'LGD_V_585061', 'Valasapadu', NULL, true, 585061, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1126, NULL, 'LGD_V_584815', 'Valasapanasa', NULL, true, 584815, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1127, NULL, 'LGD_V_585123', 'Vallaamamidi', NULL, true, 585123, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1128, NULL, 'LGD_V_584916', 'Vallangula', NULL, true, 584916, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1129, NULL, 'LGD_V_584920', 'Vanabhampadu', NULL, true, 584920, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1130, NULL, 'LGD_V_585049', 'Vanabharangipadu', NULL, true, 585049, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1131, NULL, 'LGD_V_584871', 'Vanchebu', NULL, true, 584871, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1132, NULL, 'LGD_V_584816', 'Vandrangipadu', NULL, true, 584816, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1133, NULL, 'LGD_V_584848', 'Vandrangula', NULL, true, 584848, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1134, NULL, 'LGD_V_585004', 'Vanjangipadu', NULL, true, 585004, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1135, NULL, 'LGD_V_584943', 'Vanjari', NULL, true, 584943, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1136, NULL, 'LGD_V_584900', 'Vannelabha', NULL, true, 584900, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1137, NULL, 'LGD_V_584852', 'Vantalamamidi', NULL, true, 584852, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1138, NULL, 'LGD_V_585040', 'Vantalamamidi', NULL, true, 585040, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1139, NULL, 'LGD_V_585028', 'Vanthala', NULL, true, 585028, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1140, NULL, 'LGD_V_584812', 'Vanukuru', NULL, true, 584812, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1141, NULL, 'LGD_V_584853', 'Varadamamidi', NULL, true, 584853, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1142, NULL, 'LGD_V_584974', 'Varigelapalem', NULL, true, 584974, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1143, NULL, 'LGD_V_584989', 'Varlamamidi', NULL, true, 584989, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1144, NULL, 'LGD_V_585053', 'Vasamamidi', NULL, true, 585053, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1145, NULL, 'LGD_V_585105', 'Vasulapanasa', NULL, true, 585105, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1146, NULL, 'LGD_V_584996', 'Vattivagisa', NULL, true, 584996, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1147, NULL, 'LGD_V_584861', 'Vayyampalle', NULL, true, 584861, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1148, NULL, 'LGD_V_585034', 'Vedurupalle', NULL, true, 585034, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1149, NULL, 'LGD_V_584902', 'Vemarajukodapalle', NULL, true, 584902, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1150, NULL, 'LGD_V_584906', 'Vennela', NULL, true, 584906, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1151, NULL, 'LGD_V_584921', 'Vennelakota', NULL, true, 584921, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1152, NULL, 'LGD_V_584923', 'Yeduchavallu', NULL, true, 584923, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1153, NULL, 'LGD_V_585127', 'Yedulagaravu', NULL, true, 585127, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1154, NULL, 'LGD_V_584842', 'Yegarapalle', NULL, true, 584842, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1155, NULL, 'LGD_V_584913', 'Yegaratchapalle', NULL, true, 584913, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1156, NULL, 'LGD_V_584998', 'Yenugugondi', NULL, true, 584998, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1157, NULL, 'LGD_V_584854', 'Yerragoppu', NULL, true, 584854, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1158, NULL, 'LGD_V_584822', 'Yesthala', NULL, true, 584822, 'LGD', false, '2026-10-31 21:18:39.883073+05:30', 7, 2),
	(1160, NULL, 'LGD_V_585390', 'Agraharam', NULL, true, 585390, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1161, NULL, 'LGD_V_585479', 'Agraharam', NULL, true, 585479, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1162, NULL, 'LGD_V_585414', 'Ammavaridharakonda', NULL, true, 585414, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1163, NULL, 'LGD_V_585550', 'Annavaram', NULL, true, 585550, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1164, NULL, 'LGD_V_585433', 'Annavaram', NULL, true, 585433, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1165, NULL, 'LGD_V_585525', 'Asurodda', NULL, true, 585525, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1166, NULL, 'LGD_V_585495', 'Badasallu', NULL, true, 585495, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1167, NULL, 'LGD_V_585439', 'Bathunuru', NULL, true, 585439, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1168, NULL, 'LGD_V_585401', 'Boddalalagondi', NULL, true, 585401, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1169, NULL, 'LGD_V_585481', 'Boddamamidi', NULL, true, 585481, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1170, NULL, 'LGD_V_585477', 'Boddamanupakalu', NULL, true, 585477, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1171, NULL, 'LGD_V_585476', 'Boddamanupakalu', NULL, true, 585476, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1172, NULL, 'LGD_V_585531', 'Bonampalle', NULL, true, 585531, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1173, NULL, 'LGD_V_585503', 'Boyalapalem', NULL, true, 585503, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1174, NULL, 'LGD_V_585456', 'Burugupakalu', NULL, true, 585456, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1175, NULL, 'LGD_V_585379', 'Busikonda', NULL, true, 585379, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1176, NULL, 'LGD_V_585489', 'Busulu', NULL, true, 585489, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1177, NULL, 'LGD_V_585384', 'Challanisilpa', NULL, true, 585384, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1178, NULL, 'LGD_V_585412', 'Chamagedda', NULL, true, 585412, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1179, NULL, 'LGD_V_585536', 'Chapagedda', NULL, true, 585536, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1180, NULL, 'LGD_V_585499', 'Chaparathipalem', NULL, true, 585499, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1181, NULL, 'LGD_V_585427', 'Cheedigunta', NULL, true, 585427, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1182, NULL, 'LGD_V_585419', 'Chekkalamaddi', NULL, true, 585419, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1183, NULL, 'LGD_V_585415', 'Chelakaveedhi', NULL, true, 585415, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1184, NULL, 'LGD_V_585473', 'Cherapalle', NULL, true, 585473, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1185, NULL, 'LGD_V_585510', 'Chinnajadumuru', NULL, true, 585510, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1186, NULL, 'LGD_V_585430', 'Chintagoppu', NULL, true, 585430, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1187, NULL, 'LGD_V_585465', 'Chintalapadu', NULL, true, 585465, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1188, NULL, 'LGD_V_585397', 'Chintalawada', NULL, true, 585397, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1189, NULL, 'LGD_V_585509', 'Chittamamidi', NULL, true, 585509, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1190, NULL, 'LGD_V_585428', 'Chodirai', NULL, true, 585428, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1191, NULL, 'LGD_V_585424', 'Dabbagedda', NULL, true, 585424, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1192, NULL, 'LGD_V_585406', 'Dabbagondi', NULL, true, 585406, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1193, NULL, 'LGD_V_585547', 'Damanapalle', NULL, true, 585547, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1194, NULL, 'LGD_V_585420', 'Darakonda', NULL, true, 585420, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1195, NULL, 'LGD_V_585511', 'Dengurai', NULL, true, 585511, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1196, NULL, 'LGD_V_585518', 'Devarapalle', NULL, true, 585518, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1197, NULL, 'LGD_V_585543', 'Doddikonda', NULL, true, 585543, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1198, NULL, 'LGD_V_585496', 'Dokuluru', NULL, true, 585496, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1199, NULL, 'LGD_V_585527', 'Ducharapalem', NULL, true, 585527, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1200, NULL, 'LGD_V_585386', 'Duppalawada', NULL, true, 585386, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1201, NULL, 'LGD_V_585410', 'Durgam', NULL, true, 585410, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1202, NULL, 'LGD_V_585488', 'Etarobbulu', NULL, true, 585488, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1203, NULL, 'LGD_V_585460', 'Gaigampalle', NULL, true, 585460, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1204, NULL, 'LGD_V_585440', 'Galikonda', NULL, true, 585440, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1205, NULL, 'LGD_V_585512', 'Gandepalle', NULL, true, 585512, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1206, NULL, 'LGD_V_585392', 'Gangavaram', NULL, true, 585392, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1207, NULL, 'LGD_V_585504', 'Garikibanda', NULL, true, 585504, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1208, NULL, 'LGD_V_585403', 'Gilligondi', NULL, true, 585403, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1209, NULL, 'LGD_V_585458', 'Ginjangi', NULL, true, 585458, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1210, NULL, 'LGD_V_585411', 'Godichinta', NULL, true, 585411, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1211, NULL, 'LGD_V_585396', 'Gollapalle', NULL, true, 585396, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1212, NULL, 'LGD_V_585507', 'Gomuvada', NULL, true, 585507, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1213, NULL, 'LGD_V_585474', 'Gondipalle', NULL, true, 585474, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1214, NULL, 'LGD_V_585426', 'Gorrelova', NULL, true, 585426, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1215, NULL, 'LGD_V_585532', 'Gudem Colony', NULL, true, 585532, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1216, NULL, 'LGD_V_585486', 'Gudem Kotha Veedhi', NULL, true, 585486, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1217, NULL, 'LGD_V_585478', 'Gudem Patha Veedhi', NULL, true, 585478, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1218, NULL, 'LGD_V_585402', 'Gudimamidi', NULL, true, 585402, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1219, NULL, 'LGD_V_585453', 'Gudiwada', NULL, true, 585453, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1220, NULL, 'LGD_V_585483', 'Gummalagondi', NULL, true, 585483, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1221, NULL, 'LGD_V_585436', 'Gummirevulu', NULL, true, 585436, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1222, NULL, 'LGD_V_585520', 'Gunalanka', NULL, true, 585520, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1223, NULL, 'LGD_V_585405', 'Gunkurolu', NULL, true, 585405, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1224, NULL, 'LGD_V_585506', 'Jadumuru', NULL, true, 585506, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1225, NULL, 'LGD_V_585416', 'Jajipakalu', NULL, true, 585416, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1226, NULL, 'LGD_V_585442', 'Jampalova', NULL, true, 585442, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1227, NULL, 'LGD_V_585519', 'Jangampadu', NULL, true, 585519, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1228, NULL, 'LGD_V_585452', 'Jerrila', NULL, true, 585452, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1229, NULL, 'LGD_V_585451', 'Jerrilakothuru', NULL, true, 585451, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1230, NULL, 'LGD_V_585383', 'Jonnamamidi', NULL, true, 585383, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1231, NULL, 'LGD_V_585537', 'Kadugulu', NULL, true, 585537, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1232, NULL, 'LGD_V_585435', 'Kakanuru', NULL, true, 585435, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1233, NULL, 'LGD_V_585418', 'Kakulagedda', NULL, true, 585418, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1234, NULL, 'LGD_V_585487', 'Kampamanupakalu', NULL, true, 585487, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1235, NULL, 'LGD_V_585381', 'Katragedda', NULL, true, 585381, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1236, NULL, 'LGD_V_585544', 'Kattupalle', NULL, true, 585544, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1237, NULL, 'LGD_V_585540', 'Kimulabanda', NULL, true, 585540, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1238, NULL, 'LGD_V_585516', 'Kodisingi', NULL, true, 585516, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1239, NULL, 'LGD_V_585542', 'Kodisingi', NULL, true, 585542, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1240, NULL, 'LGD_V_585497', 'Kokkitapadu', NULL, true, 585497, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1241, NULL, 'LGD_V_585425', 'Kommalawada', NULL, true, 585425, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1242, NULL, 'LGD_V_585387', 'Kommarapalle', NULL, true, 585387, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1243, NULL, 'LGD_V_585438', 'Kondajartha', NULL, true, 585438, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1244, NULL, 'LGD_V_585461', 'Kondakichangi', NULL, true, 585461, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1245, NULL, 'LGD_V_585470', 'Kondawada', NULL, true, 585470, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1246, NULL, 'LGD_V_585400', 'Kondrupalle', NULL, true, 585400, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1247, NULL, 'LGD_V_585423', 'Kongapakalu', NULL, true, 585423, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1248, NULL, 'LGD_V_585471', 'Korapalle', NULL, true, 585471, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1249, NULL, 'LGD_V_585533', 'Kothagudem', NULL, true, 585533, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1250, NULL, 'LGD_V_585468', 'Kothapalem', NULL, true, 585468, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1251, NULL, 'LGD_V_585475', 'Kothapalle', NULL, true, 585475, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1252, NULL, 'LGD_V_585457', 'Kothawada', NULL, true, 585457, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1253, NULL, 'LGD_V_585432', 'Kothurukota', NULL, true, 585432, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1254, NULL, 'LGD_V_585523', 'Kotnabilli', NULL, true, 585523, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1255, NULL, 'LGD_V_585421', 'Kotturu', NULL, true, 585421, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1256, NULL, 'LGD_V_585482', 'Kunkkumpudi', NULL, true, 585482, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1257, NULL, 'LGD_V_585492', 'Lakkavaram', NULL, true, 585492, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1258, NULL, 'LGD_V_585502', 'Lakkavarapupeta', NULL, true, 585502, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1259, NULL, 'LGD_V_585445', 'Lankapakalu', NULL, true, 585445, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1260, NULL, 'LGD_V_585545', 'Lingavaram', NULL, true, 585545, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1261, NULL, 'LGD_V_585462', 'Lubbagunta', NULL, true, 585462, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1262, NULL, 'LGD_V_585546', 'Madem', NULL, true, 585546, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1263, NULL, 'LGD_V_585431', 'Madimalla', NULL, true, 585431, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1264, NULL, 'LGD_V_585517', 'Mangalapalem', NULL, true, 585517, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1265, NULL, 'LGD_V_585447', 'Marripalem', NULL, true, 585447, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1266, NULL, 'LGD_V_585454', 'Mondigedda', NULL, true, 585454, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1267, NULL, 'LGD_V_585441', 'Muddula Busikonda', NULL, true, 585441, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1268, NULL, 'LGD_V_585448', 'Munagarapalle', NULL, true, 585448, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1269, NULL, 'LGD_V_585407', 'Nadimiveedhi', NULL, true, 585407, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1270, NULL, 'LGD_V_585393', 'Naramamidi Gondi', NULL, true, 585393, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1271, NULL, 'LGD_V_585530', 'Neelavaram', NULL, true, 585530, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1272, NULL, 'LGD_V_585434', 'Nelajaratha', NULL, true, 585434, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1273, NULL, 'LGD_V_585455', 'Nemmathotapalem', NULL, true, 585455, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1274, NULL, 'LGD_V_585388', 'Neredupalle', NULL, true, 585388, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1275, NULL, 'LGD_V_585501', 'Nerudubanda', NULL, true, 585501, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1276, NULL, 'LGD_V_585394', 'Nimmachettu', NULL, true, 585394, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1277, NULL, 'LGD_V_585514', 'Nimmalapalem', NULL, true, 585514, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1278, NULL, 'LGD_V_585464', 'Nittamamidi Palem', NULL, true, 585464, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1279, NULL, 'LGD_V_585472', 'Panasalapadu', NULL, true, 585472, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1280, NULL, 'LGD_V_585463', 'Panasapalle', NULL, true, 585463, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1281, NULL, 'LGD_V_585446', 'Panasapalle', NULL, true, 585446, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1282, NULL, 'LGD_V_585437', 'Paramasingavaram', NULL, true, 585437, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1283, NULL, 'LGD_V_585538', 'Parikala', NULL, true, 585538, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1284, NULL, 'LGD_V_585493', 'Patha Yerragedda', NULL, true, 585493, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1285, NULL, 'LGD_V_585408', 'Pebbampalle', NULL, true, 585408, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1286, NULL, 'LGD_V_585541', 'Pedakothuru', NULL, true, 585541, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1287, NULL, 'LGD_V_585490', 'Pedapadu', NULL, true, 585490, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1288, NULL, 'LGD_V_585398', 'Peddammagondi', NULL, true, 585398, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1289, NULL, 'LGD_V_585505', 'Peddavalasa', NULL, true, 585505, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1290, NULL, 'LGD_V_585391', 'Petrai', NULL, true, 585391, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1291, NULL, 'LGD_V_585380', 'Pilligedda', NULL, true, 585380, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1292, NULL, 'LGD_V_585395', 'Pilligondi', NULL, true, 585395, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1293, NULL, 'LGD_V_585548', 'Pippaladoddi', NULL, true, 585548, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1294, NULL, 'LGD_V_585485', 'Pujaripakalu', NULL, true, 585485, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1295, NULL, 'LGD_V_585534', 'R.V.Nagar', NULL, true, 585534, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1296, NULL, 'LGD_V_585539', 'Rajumanupakalu', NULL, true, 585539, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1297, NULL, 'LGD_V_585389', 'Rallagedda', NULL, true, 585389, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1298, NULL, 'LGD_V_585399', 'Rallagedda', NULL, true, 585399, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1299, NULL, 'LGD_V_585529', 'Ramagedda', NULL, true, 585529, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1300, NULL, 'LGD_V_585498', 'Rampulu', NULL, true, 585498, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1301, NULL, 'LGD_V_585413', 'Reyyalagedda', NULL, true, 585413, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1302, NULL, 'LGD_V_585526', 'Rinthada', NULL, true, 585526, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1303, NULL, 'LGD_V_585385', 'Rosaiguda', NULL, true, 585385, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1304, NULL, 'LGD_V_585443', 'S.Kothuru', NULL, true, 585443, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1305, NULL, 'LGD_V_585491', 'Sagulu', NULL, true, 585491, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1306, NULL, 'LGD_V_585524', 'Sankada', NULL, true, 585524, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1307, NULL, 'LGD_V_585513', 'Sankadakothuru', NULL, true, 585513, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1308, NULL, 'LGD_V_585382', 'Santha Neredupalle', NULL, true, 585382, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1309, NULL, 'LGD_V_585444', 'Saprla', NULL, true, 585444, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1310, NULL, 'LGD_V_585549', 'Signapalle', NULL, true, 585549, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1311, NULL, 'LGD_V_585449', 'Siribala', NULL, true, 585449, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1312, NULL, 'LGD_V_585515', 'Suravaram', NULL, true, 585515, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1313, NULL, 'LGD_V_585409', 'Tadakapalle', NULL, true, 585409, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1314, NULL, 'LGD_V_585484', 'Teemulabanda', NULL, true, 585484, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1315, NULL, 'LGD_V_585500', 'Thurumamidi', NULL, true, 585500, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1316, NULL, 'LGD_V_585429', 'Tokarai', NULL, true, 585429, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1317, NULL, 'LGD_V_585551', 'Upper Sileru Project Site Camp (Ct)', NULL, true, 585551, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1318, NULL, 'LGD_V_585480', 'Vadamamidi', NULL, true, 585480, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1319, NULL, 'LGD_V_585378', 'Valasagedda', NULL, true, 585378, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1320, NULL, 'LGD_V_585459', 'Vanabalingam', NULL, true, 585459, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1321, NULL, 'LGD_V_585469', 'Vanchula', NULL, true, 585469, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1322, NULL, 'LGD_V_585466', 'Vanthadapalle', NULL, true, 585466, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1323, NULL, 'LGD_V_585508', 'Vasuwada', NULL, true, 585508, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1324, NULL, 'LGD_V_585467', 'Veeravaram', NULL, true, 585467, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1325, NULL, 'LGD_V_585521', 'Vusurugudem', NULL, true, 585521, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1326, NULL, 'LGD_V_585528', 'Yebulum', NULL, true, 585528, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1327, NULL, 'LGD_V_585422', 'Yenugubayalu', NULL, true, 585422, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1328, NULL, 'LGD_V_585417', 'Yenugugondi', NULL, true, 585417, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1329, NULL, 'LGD_V_585522', 'Yernabilli', NULL, true, 585522, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1330, NULL, 'LGD_V_585494', 'Yerracheruvulu', NULL, true, 585494, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1331, NULL, 'LGD_V_585535', 'Yerravaram', NULL, true, 585535, 'LGD', false, '2026-10-31 21:18:54.033504+05:30', 8, 8),
	(1332, NULL, 'LGD_V_584533', 'Addumanda', NULL, true, 584533, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1333, NULL, 'LGD_V_584549', 'Allamputtu', NULL, true, 584549, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1334, NULL, 'LGD_V_584434', 'Allangiputtu', NULL, true, 584434, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1335, NULL, 'LGD_V_584439', 'Amuru', NULL, true, 584439, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1336, NULL, 'LGD_V_584566', 'Andiba', NULL, true, 584566, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1337, NULL, 'LGD_V_584444', 'Arlada', NULL, true, 584444, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1338, NULL, 'LGD_V_584507', 'Bairodivalasa @ Uppa', NULL, true, 584507, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1339, NULL, 'LGD_V_584562', 'Bakuru', NULL, true, 584562, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1340, NULL, 'LGD_V_584426', 'Baluroda', NULL, true, 584426, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1341, NULL, 'LGD_V_584582', 'Bangarubuddi', NULL, true, 584582, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1342, NULL, 'LGD_V_584552', 'Bangarugaruvu', NULL, true, 584552, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1343, NULL, 'LGD_V_584530', 'Barapalle', NULL, true, 584530, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1344, NULL, 'LGD_V_584463', 'Beeram', NULL, true, 584463, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1345, NULL, 'LGD_V_584425', 'Besaiputtu', NULL, true, 584425, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1346, NULL, 'LGD_V_584564', 'Bheemavaram', NULL, true, 584564, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1347, NULL, 'LGD_V_584436', 'Bijjapalle', NULL, true, 584436, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1348, NULL, 'LGD_V_584524', 'Bilaiputtu', NULL, true, 584524, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1349, NULL, 'LGD_V_584501', 'Billaputtu', NULL, true, 584501, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1350, NULL, 'LGD_V_584528', 'Birisingi', NULL, true, 584528, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1351, NULL, 'LGD_V_929955', 'Boddapattu (Pathakota)', 'బొడ్డాపుట్టు', true, 929955, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1352, NULL, 'LGD_V_584478', 'Boddaputtu', NULL, true, 584478, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1353, NULL, 'LGD_V_584559', 'Boddaputtu', NULL, true, 584559, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1354, NULL, 'LGD_V_584526', 'Boddaputtu', NULL, true, 584526, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1355, NULL, 'LGD_V_584493', 'Boorja', NULL, true, 584493, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1356, NULL, 'LGD_V_584544', 'Buradagummi', NULL, true, 584544, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1357, NULL, 'LGD_V_584458', 'Burmanguda', NULL, true, 584458, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1358, NULL, 'LGD_V_584467', 'Chatraiputtu', NULL, true, 584467, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1359, NULL, 'LGD_V_584586', 'Cheedigaruvu', NULL, true, 584586, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1360, NULL, 'LGD_V_584423', 'Cheediputtu', NULL, true, 584423, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1361, NULL, 'LGD_V_584487', 'Cheekatiputtu', NULL, true, 584487, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1362, NULL, 'LGD_V_584571', 'Cheekumaddula', NULL, true, 584571, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1363, NULL, 'LGD_V_584445', 'Chilakalaputtu', NULL, true, 584445, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1364, NULL, 'LGD_V_584523', 'Chinaburuguputtu', NULL, true, 584523, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1365, NULL, 'LGD_V_584475', 'Chintalaveedhi', NULL, true, 584475, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1366, NULL, 'LGD_V_584563', 'Chittampadu', NULL, true, 584563, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1367, NULL, 'LGD_V_584432', 'D.Chintalaveedhi', NULL, true, 584432, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1368, NULL, 'LGD_V_584558', 'Dabbagaruvu', NULL, true, 584558, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1369, NULL, 'LGD_V_584484', 'Dalamputtu', NULL, true, 584484, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1370, NULL, 'LGD_V_584535', 'Dalemputtu', NULL, true, 584535, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1371, NULL, 'LGD_V_584517', 'Dalemputtu', NULL, true, 584517, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1372, NULL, 'LGD_V_584554', 'Daragedda', NULL, true, 584554, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1373, NULL, 'LGD_V_584497', 'Degasalthangi', NULL, true, 584497, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1374, NULL, 'LGD_V_584583', 'Dirrapalle', NULL, true, 584583, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1375, NULL, 'LGD_V_584569', 'Donkinavalasa', NULL, true, 584569, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1376, NULL, 'LGD_V_584422', 'Duggam', NULL, true, 584422, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1377, NULL, 'LGD_V_584499', 'Dumbriguda', NULL, true, 584499, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1378, NULL, 'LGD_V_584551', 'Durgam', NULL, true, 584551, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1379, NULL, 'LGD_V_584443', 'Edulagondi', NULL, true, 584443, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1380, NULL, 'LGD_V_584498', 'Egasalthangi', NULL, true, 584498, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1381, NULL, 'LGD_V_584531', 'Gadikinchumanda', NULL, true, 584531, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1382, NULL, 'LGD_V_584468', 'Gadugupalle', NULL, true, 584468, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1383, NULL, 'LGD_V_584540', 'Gangarajuputtu', NULL, true, 584540, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1384, NULL, 'LGD_V_584567', 'Gangudi', NULL, true, 584567, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1385, NULL, 'LGD_V_584584', 'Ganika', NULL, true, 584584, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1386, NULL, 'LGD_V_584419', 'Garudapalle', NULL, true, 584419, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1387, NULL, 'LGD_V_584574', 'Gasarapalle', NULL, true, 584574, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1388, NULL, 'LGD_V_584489', 'Gatham', NULL, true, 584489, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1389, NULL, 'LGD_V_584577', 'Gedelapadu', NULL, true, 584577, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1390, NULL, 'LGD_V_584570', 'Gillibaddu', NULL, true, 584570, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1391, NULL, 'LGD_V_584521', 'Gondipeta', NULL, true, 584521, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1392, NULL, 'LGD_V_584520', 'Gondirapa', NULL, true, 584520, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1393, NULL, 'LGD_V_584572', 'Goppulapalem', NULL, true, 584572, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1394, NULL, 'LGD_V_584453', 'Gotchari', NULL, true, 584453, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1395, NULL, 'LGD_V_584539', 'Gummadiganduva', NULL, true, 584539, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1396, NULL, 'LGD_V_584568', 'Gummadigunta', NULL, true, 584568, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1397, NULL, 'LGD_V_584466', 'Hukumpeta', NULL, true, 584466, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1398, NULL, 'LGD_V_584482', 'Irukurai', NULL, true, 584482, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1399, NULL, 'LGD_V_584512', 'Jakaramputtu', NULL, true, 584512, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1400, NULL, 'LGD_V_584488', 'Jangamputtu', NULL, true, 584488, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1401, NULL, 'LGD_V_584580', 'Jarrakonda', NULL, true, 584580, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1402, NULL, 'LGD_V_584485', 'Jeelugulaputtu', NULL, true, 584485, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1403, NULL, 'LGD_V_584455', 'Jogulaputtu', NULL, true, 584455, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1404, NULL, 'LGD_V_584437', 'Kamayyapeta', NULL, true, 584437, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1405, NULL, 'LGD_V_584456', 'Kangaruputtu', NULL, true, 584456, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1406, NULL, 'LGD_V_584513', 'Kanguputtu', NULL, true, 584513, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1407, NULL, 'LGD_V_584555', 'Kethampalem', NULL, true, 584555, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1408, NULL, 'LGD_V_584490', 'Kimiduputtu', NULL, true, 584490, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1409, NULL, 'LGD_V_584452', 'Kodeli', NULL, true, 584452, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1410, NULL, 'LGD_V_584503', 'Koditala', NULL, true, 584503, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1411, NULL, 'LGD_V_584480', 'Kokkisa', NULL, true, 584480, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1412, NULL, 'LGD_V_584495', 'Kondayyapadu', NULL, true, 584495, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1413, NULL, 'LGD_V_584470', 'Kontapalle', NULL, true, 584470, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1414, NULL, 'LGD_V_584465', 'Konthili', NULL, true, 584465, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1415, NULL, 'LGD_V_584561', 'Kotagummam', NULL, true, 584561, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1416, NULL, 'LGD_V_584585', 'Kothavuru', NULL, true, 584585, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1417, NULL, 'LGD_V_584459', 'Kulapadu', NULL, true, 584459, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1418, NULL, 'LGD_V_584442', 'Kunturla', NULL, true, 584442, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1419, NULL, 'LGD_V_584542', 'Kutangi Tadiputtu', NULL, true, 584542, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1420, NULL, 'LGD_V_584543', 'Kuthangi', NULL, true, 584543, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1421, NULL, 'LGD_V_584461', 'Lakeyaputtu', NULL, true, 584461, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1422, NULL, 'LGD_V_584481', 'Liviti', NULL, true, 584481, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1423, NULL, 'LGD_V_584541', 'Locheliputtu', NULL, true, 584541, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1424, NULL, 'LGD_V_584451', 'M.Boddaputtu', NULL, true, 584451, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1425, NULL, 'LGD_V_584449', 'M.Kothavuru', NULL, true, 584449, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1426, NULL, 'LGD_V_584565', 'Maddiputtu', NULL, true, 584565, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1427, NULL, 'LGD_V_584502', 'Maddiputtu', NULL, true, 584502, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1428, NULL, 'LGD_V_584500', 'Majjivalasa', NULL, true, 584500, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1429, NULL, 'LGD_V_584462', 'Malaguda', NULL, true, 584462, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1430, NULL, 'LGD_V_584486', 'Mandiputtu', NULL, true, 584486, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1431, NULL, 'LGD_V_584479', 'Mangalamamidi', NULL, true, 584479, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1432, NULL, 'LGD_V_584472', 'Marela', NULL, true, 584472, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1433, NULL, 'LGD_V_584474', 'Marripalem', NULL, true, 584474, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1434, NULL, 'LGD_V_584454', 'Marriputtu', NULL, true, 584454, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1435, NULL, 'LGD_V_584536', 'Marrivalasa', NULL, true, 584536, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1436, NULL, 'LGD_V_584429', 'Masada', NULL, true, 584429, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1437, NULL, 'LGD_V_584430', 'Matchyapuram', NULL, true, 584430, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1438, NULL, 'LGD_V_584450', 'Matham', NULL, true, 584450, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1439, NULL, 'LGD_V_584560', 'Mebha', NULL, true, 584560, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1440, NULL, 'LGD_V_584573', 'Merakachinta', NULL, true, 584573, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1441, NULL, 'LGD_V_584557', 'Mulakayiputtu', NULL, true, 584557, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1442, NULL, 'LGD_V_584464', 'Muliaputtu', NULL, true, 584464, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1443, NULL, 'LGD_V_584537', 'Mulusobha', NULL, true, 584537, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1444, NULL, 'LGD_V_584440', 'Nakkalaputtu', NULL, true, 584440, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1445, NULL, 'LGD_V_584534', 'Neelamputtu', NULL, true, 584534, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1446, NULL, 'LGD_V_584525', 'Nimmalapadu', NULL, true, 584525, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1447, NULL, 'LGD_V_584506', 'Nimmalapadu', NULL, true, 584506, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1448, NULL, 'LGD_V_584511', 'Nittaputtu', NULL, true, 584511, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1449, NULL, 'LGD_V_584556', 'Nurupanuku', NULL, true, 584556, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1450, NULL, 'LGD_V_584510', 'Olda', NULL, true, 584510, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1451, NULL, 'LGD_V_584427', 'Ontipaka', NULL, true, 584427, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1452, NULL, 'LGD_V_584575', 'Palamamidi', NULL, true, 584575, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1453, NULL, 'LGD_V_584438', 'Pamurai', NULL, true, 584438, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1454, NULL, 'LGD_V_584504', 'Panasaputtu', NULL, true, 584504, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1455, NULL, 'LGD_V_584424', 'Pandimetta', NULL, true, 584424, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1456, NULL, 'LGD_V_584496', 'Patakadavada', NULL, true, 584496, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1457, NULL, 'LGD_V_584477', 'Pathakota', NULL, true, 584477, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1458, NULL, 'LGD_V_584576', 'Patiguruvu', NULL, true, 584576, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1459, NULL, 'LGD_V_584457', 'Patimamidi', NULL, true, 584457, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1460, NULL, 'LGD_V_584473', 'Patrimetta', NULL, true, 584473, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1461, NULL, 'LGD_V_584505', 'Pattam', NULL, true, 584505, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1462, NULL, 'LGD_V_584581', 'Peda Nandiputtu', NULL, true, 584581, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1463, NULL, 'LGD_V_584471', 'Pedagaruvu', NULL, true, 584471, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1464, NULL, 'LGD_V_584515', 'Peddapadu', NULL, true, 584515, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1465, NULL, 'LGD_V_584508', 'Pedirai', NULL, true, 584508, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1466, NULL, 'LGD_V_584579', 'Peesumamidi', NULL, true, 584579, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1467, NULL, 'LGD_V_584514', 'Pusalagaruvu', NULL, true, 584514, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1468, NULL, 'LGD_V_584538', 'Ramachandrapuram', NULL, true, 584538, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1469, NULL, 'LGD_V_584553', 'Ranamkota', NULL, true, 584553, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1470, NULL, 'LGD_V_584441', 'Rangapalle', NULL, true, 584441, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1471, NULL, 'LGD_V_584428', 'Rangaseela', NULL, true, 584428, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1472, NULL, 'LGD_V_584518', 'Rapa', NULL, true, 584518, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1473, NULL, 'LGD_V_584420', 'Rathulaputtu', NULL, true, 584420, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1474, NULL, 'LGD_V_584519', 'Reedabanda', NULL, true, 584519, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1475, NULL, 'LGD_V_584476', 'Rudi @ Degarudi', NULL, true, 584476, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1476, NULL, 'LGD_V_584446', 'Sampangiputtu', NULL, true, 584446, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1477, NULL, 'LGD_V_584550', 'Sampangiputtu', NULL, true, 584550, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1478, NULL, 'LGD_V_584522', 'Santhari', NULL, true, 584522, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1479, NULL, 'LGD_V_584532', 'Sanyasammapalem', NULL, true, 584532, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1480, NULL, 'LGD_V_584548', 'Sarasapadu', NULL, true, 584548, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1481, NULL, 'LGD_V_584483', 'Sariyapolam', NULL, true, 584483, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1482, NULL, 'LGD_V_584547', 'Sembi', NULL, true, 584547, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1483, NULL, 'LGD_V_584578', 'Sesaipanuku', NULL, true, 584578, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1484, NULL, 'LGD_V_584447', 'Sobakota', NULL, true, 584447, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1485, NULL, 'LGD_V_584529', 'Sukuru', NULL, true, 584529, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1486, NULL, 'LGD_V_584492', 'Sullipakoni', NULL, true, 584492, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1487, NULL, 'LGD_V_584448', 'Sundruputtu', NULL, true, 584448, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1488, NULL, 'LGD_V_584431', 'Tadigiri', NULL, true, 584431, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1489, NULL, 'LGD_V_584435', 'Teegalavalasa', NULL, true, 584435, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1490, NULL, 'LGD_V_584494', 'Thumbaguda', NULL, true, 584494, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1491, NULL, 'LGD_V_584527', 'Tiyyaniputtu', NULL, true, 584527, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1492, NULL, 'LGD_V_584421', 'Tokaduggam', NULL, true, 584421, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1493, NULL, 'LGD_V_584509', 'Totakurapadu', NULL, true, 584509, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1494, NULL, 'LGD_V_584516', 'Turakalametta', NULL, true, 584516, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1495, NULL, 'LGD_V_584469', 'Urrada', NULL, true, 584469, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1496, NULL, 'LGD_V_584491', 'Vachanarangini', NULL, true, 584491, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1497, NULL, 'LGD_V_584545', 'Vakapalle', NULL, true, 584545, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1498, NULL, 'LGD_V_584460', 'Vallangiputtu', NULL, true, 584460, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1499, NULL, 'LGD_V_584546', 'Veerendla', NULL, true, 584546, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3),
	(1500, NULL, 'LGD_V_584433', 'Vukkurba', NULL, true, 584433, 'LGD', false, '2026-10-31 21:19:08.700231+05:30', 9, 3);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1501, NULL, 'LGD_V_585688', 'Adakula', NULL, true, 585688, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1502, NULL, 'LGD_V_585632', 'Agraharam', NULL, true, 585632, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1503, NULL, 'LGD_V_912637', 'Ankampalem', NULL, true, 912637, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1504, NULL, 'LGD_V_585571', 'Annavaram', NULL, true, 585571, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1505, NULL, 'LGD_V_912629', 'Anthada', NULL, true, 912629, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1506, NULL, 'LGD_V_585678', 'Anthada', NULL, true, 585678, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1507, NULL, 'LGD_V_585584', 'Balabadrapadu', NULL, true, 585584, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1508, NULL, 'LGD_V_585690', 'Balaram', NULL, true, 585690, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1509, NULL, 'LGD_V_585589', 'Balarevulu', NULL, true, 585589, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1510, NULL, 'LGD_V_585677', 'Balusukura Pakalu', NULL, true, 585677, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1511, NULL, 'LGD_V_585666', 'Bandivalasa', NULL, true, 585666, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1512, NULL, 'LGD_V_585680', 'Bangarammapeta', NULL, true, 585680, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1513, NULL, 'LGD_V_585630', 'Bangarayyapadu', NULL, true, 585630, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1514, NULL, 'LGD_V_585627', 'Bangarupalem', NULL, true, 585627, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1515, NULL, 'LGD_V_585641', 'Battapanukulu', NULL, true, 585641, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1516, NULL, 'LGD_V_585639', 'Battumetta', NULL, true, 585639, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1517, NULL, 'LGD_V_585629', 'Bennavaram', NULL, true, 585629, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1518, NULL, 'LGD_V_585674', 'Bheemavaram', NULL, true, 585674, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1519, NULL, 'LGD_V_585699', 'Bointi', NULL, true, 585699, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1520, NULL, 'LGD_V_585654', 'Bonkulapalem', NULL, true, 585654, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1521, NULL, 'LGD_V_585697', 'Bouthuvalasa', NULL, true, 585697, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1522, NULL, 'LGD_V_585576', 'Budaralla', NULL, true, 585576, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1523, NULL, 'LGD_V_585577', 'Budaralla Kothuru', NULL, true, 585577, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1524, NULL, 'LGD_V_585696', 'Chappidi Mamidi', NULL, true, 585696, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1525, NULL, 'LGD_V_585713', 'Chatarai', NULL, true, 585713, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1526, NULL, 'LGD_V_585556', 'Cheedikota', NULL, true, 585556, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1527, NULL, 'LGD_V_585608', 'Cheedipalem', NULL, true, 585608, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1528, NULL, 'LGD_V_585614', 'Chintalapudi', NULL, true, 585614, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1529, NULL, 'LGD_V_585598', 'Chintuvanipalem', NULL, true, 585598, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1530, NULL, 'LGD_V_585663', 'Chittempadu', NULL, true, 585663, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1531, NULL, 'LGD_V_585575', 'Chowdipalle', NULL, true, 585575, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1532, NULL, 'LGD_V_585710', 'Daddugula', NULL, true, 585710, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1533, NULL, 'LGD_V_585700', 'Daragedda', NULL, true, 585700, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1534, NULL, 'LGD_V_585659', 'Dharmavaram', NULL, true, 585659, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1535, NULL, 'LGD_V_585706', 'Dhonipalem', NULL, true, 585706, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1536, NULL, 'LGD_V_585599', 'Dibbalapalem', NULL, true, 585599, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1537, NULL, 'LGD_V_585594', 'Doddavaram', NULL, true, 585594, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1538, NULL, 'LGD_V_585620', 'Domalagondi', NULL, true, 585620, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1539, NULL, 'LGD_V_585647', 'Downuru', NULL, true, 585647, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1540, NULL, 'LGD_V_585662', 'Gadabapalem', NULL, true, 585662, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1541, NULL, 'LGD_V_585624', 'Gamakonda', NULL, true, 585624, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1542, NULL, 'LGD_V_585623', 'Ganerlapalem', NULL, true, 585623, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1543, NULL, 'LGD_V_585600', 'Gangavaram', NULL, true, 585600, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1544, NULL, 'LGD_V_585695', 'Gantavari Kothagudem', NULL, true, 585695, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1545, NULL, 'LGD_V_585669', 'Ganugula', NULL, true, 585669, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1546, NULL, 'LGD_V_585572', 'Garimanda', NULL, true, 585572, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1547, NULL, 'LGD_V_585613', 'Ginjarthi', NULL, true, 585613, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1548, NULL, 'LGD_V_585698', 'Godugula Manubanda', NULL, true, 585698, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1549, NULL, 'LGD_V_585591', 'Gollivalasa', NULL, true, 585591, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1550, NULL, 'LGD_V_585667', 'Gopavaram', NULL, true, 585667, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1551, NULL, 'LGD_V_585578', 'Gudapalle', NULL, true, 585578, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1552, NULL, 'LGD_V_585649', 'Gummadimanupalem', NULL, true, 585649, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1553, NULL, 'LGD_V_585679', 'Gummalapalem', NULL, true, 585679, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1554, NULL, 'LGD_V_585665', 'Jammavaram', NULL, true, 585665, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1555, NULL, 'LGD_V_585560', 'Jerrigondi', NULL, true, 585560, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1556, NULL, 'LGD_V_585580', 'Jogampeta', NULL, true, 585580, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1557, NULL, 'LGD_V_585705', 'Jonnamamidi', NULL, true, 585705, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1558, NULL, 'LGD_V_585625', 'Kamparegulu', NULL, true, 585625, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1559, NULL, 'LGD_V_585569', 'Kannavaram', NULL, true, 585569, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1560, NULL, 'LGD_V_585689', 'Kantharam', NULL, true, 585689, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1561, NULL, 'LGD_V_585643', 'Kathiralloddi', NULL, true, 585643, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1562, NULL, 'LGD_V_585622', 'Katragedda', NULL, true, 585622, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1563, NULL, 'LGD_V_585673', 'Kinaparthi', NULL, true, 585673, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1564, NULL, 'LGD_V_585596', 'Kinchavanipalem', NULL, true, 585596, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1565, NULL, 'LGD_V_585574', 'Kindangi', NULL, true, 585574, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1566, NULL, 'LGD_V_585686', 'Kithalova', NULL, true, 585686, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1567, NULL, 'LGD_V_585555', 'Kommanuru', NULL, true, 585555, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1568, NULL, 'LGD_V_585687', 'Kommika', NULL, true, 585687, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1569, NULL, 'LGD_V_585693', 'Kondagokira', NULL, true, 585693, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1570, NULL, 'LGD_V_585650', 'Kondasantha', NULL, true, 585650, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1571, NULL, 'LGD_V_585683', 'Koppukonda', NULL, true, 585683, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1572, NULL, 'LGD_V_585651', 'Kothagadabapalem', NULL, true, 585651, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1573, NULL, 'LGD_V_585634', 'Kothapalem', NULL, true, 585634, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1574, NULL, 'LGD_V_585619', 'Kothapalle', NULL, true, 585619, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1575, NULL, 'LGD_V_585661', 'Kothuru', NULL, true, 585661, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1576, NULL, 'LGD_V_585605', 'Koyyuru', NULL, true, 585605, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1577, NULL, 'LGD_V_585597', 'Koyyuru Pathapadu', NULL, true, 585597, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1578, NULL, 'LGD_V_585702', 'Kumbarlubanda', NULL, true, 585702, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1579, NULL, 'LGD_V_585712', 'Lankaveedhi', NULL, true, 585712, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1580, NULL, 'LGD_V_585668', 'Lingapuram', NULL, true, 585668, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1581, NULL, 'LGD_V_585615', 'Lubbarthi', NULL, true, 585615, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1582, NULL, 'LGD_V_585590', 'Lusam', NULL, true, 585590, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1583, NULL, 'LGD_V_585660', 'Mallavaram', NULL, true, 585660, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1584, NULL, 'LGD_V_585601', 'Mampa', NULL, true, 585601, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1585, NULL, 'LGD_V_585559', 'Mandipalle', NULL, true, 585559, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1586, NULL, 'LGD_V_585561', 'Marripakalu', NULL, true, 585561, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1587, NULL, 'LGD_V_585655', 'Marripalem', NULL, true, 585655, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1588, NULL, 'LGD_V_585582', 'Marriwada', NULL, true, 585582, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1589, NULL, 'LGD_V_585553', 'Mattam Bhimavaram', NULL, true, 585553, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1590, NULL, 'LGD_V_585628', 'Mogalidoddi', NULL, true, 585628, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1591, NULL, 'LGD_V_585573', 'Mukudupalle', NULL, true, 585573, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1592, NULL, 'LGD_V_585675', 'Mulagalametta', NULL, true, 585675, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1593, NULL, 'LGD_V_585653', 'Mulapeta', NULL, true, 585653, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1594, NULL, 'LGD_V_585642', 'Nadimpalem', NULL, true, 585642, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1595, NULL, 'LGD_V_585612', 'Nadimpalem', NULL, true, 585612, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1596, NULL, 'LGD_V_912630', 'Nadimpalem', NULL, true, 912630, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1597, NULL, 'LGD_V_585593', 'Nakkalapadu', NULL, true, 585593, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1598, NULL, 'LGD_V_585570', 'Nallabilli', NULL, true, 585570, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1599, NULL, 'LGD_V_585616', 'Nallagonda', NULL, true, 585616, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1600, NULL, 'LGD_V_585645', 'Nallagonda', NULL, true, 585645, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1601, NULL, 'LGD_V_585631', 'Nimmagedda', NULL, true, 585631, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1602, NULL, 'LGD_V_585617', 'Nimmalagondi', NULL, true, 585617, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1603, NULL, 'LGD_V_585603', 'Nimmalapalem', NULL, true, 585603, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1604, NULL, 'LGD_V_585691', 'Padi', NULL, true, 585691, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1605, NULL, 'LGD_V_585563', 'Pakalajeedi', NULL, true, 585563, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1606, NULL, 'LGD_V_585611', 'Panasalapadu', NULL, true, 585611, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1607, NULL, 'LGD_V_585681', 'Paradesipakalu', NULL, true, 585681, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1608, NULL, 'LGD_V_585704', 'Parlubanda', NULL, true, 585704, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1609, NULL, 'LGD_V_585558', 'Pedalanka Kothuru', NULL, true, 585558, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1610, NULL, 'LGD_V_585670', 'Pedamakavaram', NULL, true, 585670, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1611, NULL, 'LGD_V_585583', 'Peddinipalem', NULL, true, 585583, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1612, NULL, 'LGD_V_585579', 'Pidathamamidi', NULL, true, 585579, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1613, NULL, 'LGD_V_585588', 'Pidugurai', NULL, true, 585588, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1614, NULL, 'LGD_V_585587', 'Pittalapadu', NULL, true, 585587, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1615, NULL, 'LGD_V_585567', 'Pokalapalem', NULL, true, 585567, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1616, NULL, 'LGD_V_585610', 'Pothavaram', NULL, true, 585610, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1617, NULL, 'LGD_V_585568', 'Punukuru', NULL, true, 585568, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1618, NULL, 'LGD_V_585557', 'Puttakota', NULL, true, 585557, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1619, NULL, 'LGD_V_585703', 'Puturugedda', NULL, true, 585703, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1620, NULL, 'LGD_V_585658', 'Rabbasingi', NULL, true, 585658, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1621, NULL, 'LGD_V_585607', 'Rajendrapalem', NULL, true, 585607, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1622, NULL, 'LGD_V_585676', 'Rajupeta', NULL, true, 585676, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1623, NULL, 'LGD_V_585656', 'Ramannapalem', NULL, true, 585656, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1624, NULL, 'LGD_V_585664', 'Ramannapalem', NULL, true, 585664, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1625, NULL, 'LGD_V_585652', 'Ramapuram', NULL, true, 585652, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1626, NULL, 'LGD_V_585671', 'Ramarajupalem', NULL, true, 585671, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1627, NULL, 'LGD_V_585692', 'Ratnampeta', NULL, true, 585692, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1628, NULL, 'LGD_V_585685', 'Ravanapalle', NULL, true, 585685, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1629, NULL, 'LGD_V_585684', 'Ravimanupakalu', NULL, true, 585684, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1630, NULL, 'LGD_V_585637', 'Ravimanupalem', NULL, true, 585637, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1631, NULL, 'LGD_V_585562', 'Ravulakota', NULL, true, 585562, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1632, NULL, 'LGD_V_585657', 'Rellalapalem', NULL, true, 585657, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1633, NULL, 'LGD_V_585602', 'Revallu', NULL, true, 585602, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1634, NULL, 'LGD_V_585711', 'Rolangi', NULL, true, 585711, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1635, NULL, 'LGD_V_585585', 'Sakulapalem', NULL, true, 585585, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1636, NULL, 'LGD_V_585606', 'Sanivarappadu', NULL, true, 585606, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1637, NULL, 'LGD_V_585604', 'Santha Kirlampadu', NULL, true, 585604, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1638, NULL, 'LGD_V_585638', 'Sarabhanna Palem', NULL, true, 585638, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1639, NULL, 'LGD_V_585636', 'Seekayipalem', NULL, true, 585636, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1640, NULL, 'LGD_V_585609', 'Singavaram', NULL, true, 585609, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1641, NULL, 'LGD_V_585708', 'Sitharampadu', NULL, true, 585708, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1642, NULL, 'LGD_V_585581', 'Solabu', NULL, true, 585581, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1643, NULL, 'LGD_V_585648', 'Suddalapalem', NULL, true, 585648, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1644, NULL, 'LGD_V_585626', 'Suramanda', NULL, true, 585626, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1645, NULL, 'LGD_V_585595', 'Surendrapalem', NULL, true, 585595, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1646, NULL, 'LGD_V_585707', 'Tapplimamidi', NULL, true, 585707, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1647, NULL, 'LGD_V_585640', 'Teegalametta', NULL, true, 585640, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1648, NULL, 'LGD_V_585618', 'Tenkala Panukulu', NULL, true, 585618, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1649, NULL, 'LGD_V_585635', 'Thadichetlapalem', NULL, true, 585635, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1650, NULL, 'LGD_V_585592', 'Thallapalem', NULL, true, 585592, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1651, NULL, 'LGD_V_585701', 'Thatimanubanda', NULL, true, 585701, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1652, NULL, 'LGD_V_585644', 'Thotaluru', NULL, true, 585644, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1653, NULL, 'LGD_V_585646', 'Tulabada', NULL, true, 585646, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1654, NULL, 'LGD_V_585566', 'U.Cheedipalem', NULL, true, 585566, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1655, NULL, 'LGD_V_585565', 'Ulligunta', NULL, true, 585565, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1656, NULL, 'LGD_V_585672', 'Valasampeta', NULL, true, 585672, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1657, NULL, 'LGD_V_585694', 'Valasarajupadu', NULL, true, 585694, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1658, NULL, 'LGD_V_585552', 'Valugudem', NULL, true, 585552, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1659, NULL, 'LGD_V_585586', 'Vanthamarri', NULL, true, 585586, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1660, NULL, 'LGD_V_585633', 'Velagalapalem', NULL, true, 585633, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1661, NULL, 'LGD_V_585554', 'Vudutha', NULL, true, 585554, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1662, NULL, 'LGD_V_585621', 'Yeddumamidi Singhadara', NULL, true, 585621, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1663, NULL, 'LGD_V_585709', 'Yerrabilli', NULL, true, 585709, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1664, NULL, 'LGD_V_585564', 'Yerragonda', NULL, true, 585564, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1665, NULL, 'LGD_V_585682', 'Yerrinaidu Pakalu', NULL, true, 585682, 'LGD', false, '2026-10-31 21:19:21.563802+05:30', 10, 9),
	(1666, NULL, 'LGD_V_583553', 'A.Kotturu', NULL, true, 583553, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1667, NULL, 'LGD_V_583375', 'Adalaputtu', NULL, true, 583375, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1668, NULL, 'LGD_V_583330', 'Adarladi @ Mukki Puttu', NULL, true, 583330, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1669, NULL, 'LGD_V_583299', 'Alabeeru', NULL, true, 583299, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1670, NULL, 'LGD_V_583271', 'Allangipada', NULL, true, 583271, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1671, NULL, 'LGD_V_583396', 'Amalaguda', NULL, true, 583396, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1672, NULL, 'LGD_V_583398', 'Ambapada', NULL, true, 583398, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1673, NULL, 'LGD_V_583361', 'Antabongu', NULL, true, 583361, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1674, NULL, 'LGD_V_583389', 'Antlavada', NULL, true, 583389, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1675, NULL, 'LGD_V_583286', 'Arabeeru', NULL, true, 583286, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1676, NULL, 'LGD_V_583317', 'Arloiputtu', NULL, true, 583317, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1677, NULL, 'LGD_V_583256', 'Asurada', NULL, true, 583256, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1678, NULL, 'LGD_V_583323', 'Attikalu', NULL, true, 583323, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1679, NULL, 'LGD_V_583447', 'Babusala', NULL, true, 583447, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1680, NULL, 'LGD_V_583562', 'Badiputtu', NULL, true, 583562, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1681, NULL, 'LGD_V_583542', 'Bakubeda', NULL, true, 583542, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1682, NULL, 'LGD_V_583393', 'Balada', NULL, true, 583393, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1683, NULL, 'LGD_V_583324', 'Balajulla', NULL, true, 583324, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1684, NULL, 'LGD_V_583312', 'Baliyaguda', NULL, true, 583312, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1685, NULL, 'LGD_V_583561', 'Bangaru Puttu', NULL, true, 583561, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1686, NULL, 'LGD_V_583559', 'Bangarumetta', NULL, true, 583559, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1687, NULL, 'LGD_V_583390', 'Bangurupalle', NULL, true, 583390, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1688, NULL, 'LGD_V_583405', 'Bapanaputtu', NULL, true, 583405, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1689, NULL, 'LGD_V_583326', 'Barada', NULL, true, 583326, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1690, NULL, 'LGD_V_583388', 'Barlada', NULL, true, 583388, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1691, NULL, 'LGD_V_583303', 'Beeduchampa', NULL, true, 583303, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1692, NULL, 'LGD_V_583416', 'Beeta', NULL, true, 583416, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1693, NULL, 'LGD_V_583449', 'Bhalluguda', NULL, true, 583449, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1694, NULL, 'LGD_V_583339', 'Bhimidi', NULL, true, 583339, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1695, NULL, 'LGD_V_583321', 'Birriguda', NULL, true, 583321, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1696, NULL, 'LGD_V_583458', 'Boddagondi', NULL, true, 583458, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1697, NULL, 'LGD_V_583428', 'Boddapadu', NULL, true, 583428, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1698, NULL, 'LGD_V_583451', 'Boddaputtu', NULL, true, 583451, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1699, NULL, 'LGD_V_583434', 'Bodiliguda', NULL, true, 583434, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1700, NULL, 'LGD_V_583415', 'Bodiputtu', NULL, true, 583415, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1701, NULL, 'LGD_V_583448', 'Bokkeraputtu', NULL, true, 583448, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1702, NULL, 'LGD_V_583492', 'Bonangiputtu', NULL, true, 583492, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1703, NULL, 'LGD_V_583534', 'Bondaputtu', NULL, true, 583534, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1704, NULL, 'LGD_V_583456', 'Bondaputtu', NULL, true, 583456, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1705, NULL, 'LGD_V_583305', 'Bondruguda', NULL, true, 583305, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1706, NULL, 'LGD_V_583503', 'Boosiputtu', NULL, true, 583503, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1707, NULL, 'LGD_V_583517', 'Boosiputtu', NULL, true, 583517, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1708, NULL, 'LGD_V_583485', 'Boragam', NULL, true, 583485, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1709, NULL, 'LGD_V_583356', 'Borramamidi', NULL, true, 583356, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1710, NULL, 'LGD_V_583288', 'Buddapanasa', NULL, true, 583288, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1711, NULL, 'LGD_V_583355', 'Bungaputtu', NULL, true, 583355, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1712, NULL, 'LGD_V_583435', 'Buradagunta', NULL, true, 583435, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1713, NULL, 'LGD_V_583514', 'Burrangula', NULL, true, 583514, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1714, NULL, 'LGD_V_583509', 'Burugumetta', NULL, true, 583509, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(2461, NULL, 'LGD_V_583783', 'Tulam', NULL, true, 583783, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(1715, NULL, 'LGD_V_583360', 'Burusindhiputtu', NULL, true, 583360, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1716, NULL, 'LGD_V_583291', 'Champaputtu', NULL, true, 583291, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1717, NULL, 'LGD_V_583429', 'Cheediputtu', NULL, true, 583429, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1718, NULL, 'LGD_V_583441', 'Cheepurugondi', NULL, true, 583441, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1719, NULL, 'LGD_V_583420', 'Chekuchinta', NULL, true, 583420, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1720, NULL, 'LGD_V_583548', 'Cheruvu Pakala', NULL, true, 583548, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1721, NULL, 'LGD_V_583459', 'Cheruvu Veedhi', NULL, true, 583459, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1722, NULL, 'LGD_V_583368', 'Chilliputtu', NULL, true, 583368, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1723, NULL, 'LGD_V_583535', 'Chinamukkiputtu', NULL, true, 583535, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1724, NULL, 'LGD_V_583439', 'Chinasariyapalle', NULL, true, 583439, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1725, NULL, 'LGD_V_583258', 'Chinasindhiputtu', NULL, true, 583258, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1726, NULL, 'LGD_V_583384', 'Chintammingula', NULL, true, 583384, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1727, NULL, 'LGD_V_583524', 'Chippaputtu', NULL, true, 583524, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1728, NULL, 'LGD_V_583349', 'Chuttugondi', NULL, true, 583349, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1729, NULL, 'LGD_V_583274', 'Dabuguda', NULL, true, 583274, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1730, NULL, 'LGD_V_583345', 'Dabuguda', NULL, true, 583345, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1731, NULL, 'LGD_V_583270', 'Dadiputtu', NULL, true, 583270, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1732, NULL, 'LGD_V_583262', 'Danabandu', NULL, true, 583262, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1733, NULL, 'LGD_V_583572', 'Dareli', NULL, true, 583572, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1734, NULL, 'LGD_V_583521', 'Dasariputtu', NULL, true, 583521, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1735, NULL, 'LGD_V_583432', 'Dasariputtu', NULL, true, 583432, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1736, NULL, 'LGD_V_583568', 'Deembuguda', NULL, true, 583568, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1737, NULL, 'LGD_V_583406', 'Degalaputtu', NULL, true, 583406, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1738, NULL, 'LGD_V_583296', 'Dengam', NULL, true, 583296, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1739, NULL, 'LGD_V_583383', 'Dharapalle', NULL, true, 583383, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1740, NULL, 'LGD_V_583513', 'Digakumada', NULL, true, 583513, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1741, NULL, 'LGD_V_583376', 'Digidaputtu', NULL, true, 583376, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1742, NULL, 'LGD_V_583290', 'Dimisamilli', NULL, true, 583290, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1743, NULL, 'LGD_V_583575', 'Dokiriputtu', NULL, true, 583575, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1744, NULL, 'LGD_V_583482', 'Dolliputtu', NULL, true, 583482, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1745, NULL, 'LGD_V_583261', 'Domaliputtu', NULL, true, 583261, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1746, NULL, 'LGD_V_583404', 'Doniputtu', NULL, true, 583404, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1747, NULL, 'LGD_V_583255', 'Doraguda', NULL, true, 583255, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1748, NULL, 'LGD_V_583468', 'Doraguda', NULL, true, 583468, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1749, NULL, 'LGD_V_583502', 'Doraguda', NULL, true, 583502, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1750, NULL, 'LGD_V_583366', 'Duliputtu', NULL, true, 583366, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1751, NULL, 'LGD_V_583315', 'Dumuduguda', NULL, true, 583315, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1752, NULL, 'LGD_V_583399', 'Dumukuladi', NULL, true, 583399, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1753, NULL, 'LGD_V_583346', 'Gaddibanda', NULL, true, 583346, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1754, NULL, 'LGD_V_583475', 'Gadela Burugu', NULL, true, 583475, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1755, NULL, 'LGD_V_583438', 'Gadelaputtu', NULL, true, 583438, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1756, NULL, 'LGD_V_583392', 'Gajjalabanda', NULL, true, 583392, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1757, NULL, 'LGD_V_583419', 'Galaganda', NULL, true, 583419, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1758, NULL, 'LGD_V_583571', 'Ganneda', NULL, true, 583571, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1759, NULL, 'LGD_V_583556', 'Gannelaputtu', NULL, true, 583556, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1760, NULL, 'LGD_V_583351', 'Garram', NULL, true, 583351, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1761, NULL, 'LGD_V_583440', 'Garrivada', NULL, true, 583440, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1762, NULL, 'LGD_V_583470', 'Gattumalada', NULL, true, 583470, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1763, NULL, 'LGD_V_583259', 'Gatturamanda', NULL, true, 583259, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1764, NULL, 'LGD_V_583484', 'Gedelabanda', NULL, true, 583484, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1765, NULL, 'LGD_V_583538', 'Giddala Puttu', NULL, true, 583538, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1766, NULL, 'LGD_V_583518', 'Giddalamamidi', NULL, true, 583518, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1767, NULL, 'LGD_V_583411', 'Giddulaputtu', NULL, true, 583411, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1768, NULL, 'LGD_V_583297', 'Gobburupadu', NULL, true, 583297, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1769, NULL, 'LGD_V_583412', 'Goddiputtu', NULL, true, 583412, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1770, NULL, 'LGD_V_583418', 'Goddiputtu', NULL, true, 583418, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1771, NULL, 'LGD_V_583421', 'Godugulaputtu', NULL, true, 583421, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1772, NULL, 'LGD_V_583340', 'Golliputtu', NULL, true, 583340, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1773, NULL, 'LGD_V_583480', 'Gorrelametta', NULL, true, 583480, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1774, NULL, 'LGD_V_583422', 'Gudamaliputtu', NULL, true, 583422, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1775, NULL, 'LGD_V_583293', 'Gumma @ Digagumma', NULL, true, 583293, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1776, NULL, 'LGD_V_583381', 'Gummasiragamputtu', NULL, true, 583381, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1777, NULL, 'LGD_V_583446', 'Gunnachelama', NULL, true, 583446, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1778, NULL, 'LGD_V_583486', 'Gunnalamamidi', NULL, true, 583486, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1779, NULL, 'LGD_V_583342', 'Hamsabanda', NULL, true, 583342, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1780, NULL, 'LGD_V_583382', 'Illoyipolam', NULL, true, 583382, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1781, NULL, 'LGD_V_583314', 'Jabada', NULL, true, 583314, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1782, NULL, 'LGD_V_583442', 'Jadiguda', NULL, true, 583442, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1783, NULL, 'LGD_V_583378', 'Jadiputtu', NULL, true, 583378, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1784, NULL, 'LGD_V_583292', 'Jalaripodaru', NULL, true, 583292, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1785, NULL, 'LGD_V_583284', 'Jamiriguda', NULL, true, 583284, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1786, NULL, 'LGD_V_583540', 'Jangam Puttu', NULL, true, 583540, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1787, NULL, 'LGD_V_583370', 'Jangamsariya', NULL, true, 583370, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1788, NULL, 'LGD_V_583304', 'Japparu', NULL, true, 583304, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1789, NULL, 'LGD_V_583401', 'Jarjula', NULL, true, 583401, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1790, NULL, 'LGD_V_583471', 'Jarripada', NULL, true, 583471, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1791, NULL, 'LGD_V_583483', 'Jarripada', NULL, true, 583483, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1792, NULL, 'LGD_V_583311', 'Jodiguda', NULL, true, 583311, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1793, NULL, 'LGD_V_583306', 'Jolaputtu', NULL, true, 583306, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1794, NULL, 'LGD_V_583526', 'K.Kotturu', NULL, true, 583526, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1795, NULL, 'LGD_V_583310', 'Kadamjola', NULL, true, 583310, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1796, NULL, 'LGD_V_583386', 'Kadeembeeru', NULL, true, 583386, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1797, NULL, 'LGD_V_583338', 'Kadutula', NULL, true, 583338, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1798, NULL, 'LGD_V_583505', 'Kammarigoyyi', NULL, true, 583505, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1799, NULL, 'LGD_V_583327', 'Kammariguda', NULL, true, 583327, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1800, NULL, 'LGD_V_583308', 'Kammarigunta', NULL, true, 583308, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1801, NULL, 'LGD_V_583460', 'Kangu Veedhi', NULL, true, 583460, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1802, NULL, 'LGD_V_583410', 'Kanguputtu', NULL, true, 583410, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1803, NULL, 'LGD_V_583495', 'Kantavaram', NULL, true, 583495, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1804, NULL, 'LGD_V_583424', 'Kanusulaputtu', NULL, true, 583424, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1805, NULL, 'LGD_V_583329', 'Karabayalu', NULL, true, 583329, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1806, NULL, 'LGD_V_583454', 'Karimikiputtu', NULL, true, 583454, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1807, NULL, 'LGD_V_583316', 'Karlapodaru', NULL, true, 583316, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1808, NULL, 'LGD_V_583489', 'Kenduguda', NULL, true, 583489, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1809, NULL, 'LGD_V_583282', 'Kenduputtu', NULL, true, 583282, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1810, NULL, 'LGD_V_583529', 'Kilagada', NULL, true, 583529, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1811, NULL, 'LGD_V_583437', 'Kilumangi', NULL, true, 583437, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1812, NULL, 'LGD_V_583478', 'Kimmalamamidi', NULL, true, 583478, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1813, NULL, 'LGD_V_583487', 'Kimuduputtu', NULL, true, 583487, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1814, NULL, 'LGD_V_583550', 'Kinchai Puttu', NULL, true, 583550, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1815, NULL, 'LGD_V_583377', 'Kinchaiputtu', NULL, true, 583377, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1816, NULL, 'LGD_V_583551', 'Kincholda', NULL, true, 583551, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1817, NULL, 'LGD_V_583277', 'Kirrambo', NULL, true, 583277, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1818, NULL, 'LGD_V_583334', 'Kodamputtu', NULL, true, 583334, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1819, NULL, 'LGD_V_583318', 'Kodaputtu', NULL, true, 583318, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1820, NULL, 'LGD_V_583266', 'Kodaputtu', NULL, true, 583266, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1821, NULL, 'LGD_V_583499', 'Kommalakonda', NULL, true, 583499, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1822, NULL, 'LGD_V_583357', 'Kondagabulu', NULL, true, 583357, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1823, NULL, 'LGD_V_583463', 'Kondapada', NULL, true, 583463, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1824, NULL, 'LGD_V_583445', 'Kondrangivalasa', NULL, true, 583445, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1825, NULL, 'LGD_V_583367', 'Kooraiputtu', NULL, true, 583367, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1826, NULL, 'LGD_V_583341', 'Kosamputtu', NULL, true, 583341, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1827, NULL, 'LGD_V_583527', 'Kottalabayalu', NULL, true, 583527, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1828, NULL, 'LGD_V_583443', 'Kottaputtu', NULL, true, 583443, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1829, NULL, 'LGD_V_583402', 'Kotturu', NULL, true, 583402, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1830, NULL, 'LGD_V_583474', 'Kotturu', NULL, true, 583474, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1831, NULL, 'LGD_V_583565', 'Kujabhangi', NULL, true, 583565, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1832, NULL, 'LGD_V_583395', 'Kulabeeru', NULL, true, 583395, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1833, NULL, 'LGD_V_583287', 'Kulabeeru', NULL, true, 583287, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1834, NULL, 'LGD_V_583512', 'Kumada', NULL, true, 583512, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1835, NULL, 'LGD_V_583539', 'Kumbi Guda', NULL, true, 583539, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1836, NULL, 'LGD_V_583273', 'Kumbri Pada', NULL, true, 583273, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1837, NULL, 'LGD_V_583560', 'Kummari Puttu', NULL, true, 583560, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1838, NULL, 'LGD_V_583546', 'Kummari Puttu', NULL, true, 583546, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1839, NULL, 'LGD_V_583427', 'Kummariputtu', NULL, true, 583427, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1840, NULL, 'LGD_V_583331', 'Kuntuda', NULL, true, 583331, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1841, NULL, 'LGD_V_583280', 'Kusumaguda', NULL, true, 583280, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1842, NULL, 'LGD_V_583353', 'Kusumaputtu', NULL, true, 583353, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1843, NULL, 'LGD_V_583336', 'Kuyilongi', NULL, true, 583336, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1844, NULL, 'LGD_V_583300', 'Labadaputtu', NULL, true, 583300, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1845, NULL, 'LGD_V_583285', 'Labburu', NULL, true, 583285, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1846, NULL, 'LGD_V_583307', 'Labburukonda Puttu', NULL, true, 583307, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1847, NULL, 'LGD_V_583372', 'Lakaiputtu', NULL, true, 583372, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1848, NULL, 'LGD_V_583313', 'Langbapodaru', NULL, true, 583313, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1849, NULL, 'LGD_V_583344', 'Laxmipuram', NULL, true, 583344, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1850, NULL, 'LGD_V_583301', 'Lingaputtu', NULL, true, 583301, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1851, NULL, 'LGD_V_583363', 'Lukkuru', NULL, true, 583363, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1852, NULL, 'LGD_V_583525', 'Lungaputtu', NULL, true, 583525, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1853, NULL, 'LGD_V_912635', 'Lungaputtu', NULL, true, 912635, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1854, NULL, 'LGD_V_583508', 'Maddulabanda', NULL, true, 583508, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1855, NULL, 'LGD_V_583545', 'Majjiguda', NULL, true, 583545, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1856, NULL, 'LGD_V_583302', 'Makavaram', NULL, true, 583302, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1857, NULL, 'LGD_V_583558', 'Malagummi', NULL, true, 583558, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1858, NULL, 'LGD_V_583531', 'Malakariputtu', NULL, true, 583531, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1859, NULL, 'LGD_V_583359', 'Mallimunda', NULL, true, 583359, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1860, NULL, 'LGD_V_583295', 'Mallipodaru', NULL, true, 583295, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1861, NULL, 'LGD_V_583426', 'Malluduputtu', NULL, true, 583426, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1862, NULL, 'LGD_V_583391', 'Malugurai', NULL, true, 583391, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1863, NULL, 'LGD_V_583431', 'Manchamrai', NULL, true, 583431, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1864, NULL, 'LGD_V_583461', 'Mandibha', NULL, true, 583461, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1865, NULL, 'LGD_V_583430', 'Mangaliputtu', NULL, true, 583430, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1866, NULL, 'LGD_V_583275', 'Marriputtu', NULL, true, 583275, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1867, NULL, 'LGD_V_583423', 'Marriputtu', NULL, true, 583423, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1868, NULL, 'LGD_V_583453', 'Marrivalasa', NULL, true, 583453, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1869, NULL, 'LGD_V_583436', 'Matchayapuram', NULL, true, 583436, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1870, NULL, 'LGD_V_583298', 'Mattamputtu', NULL, true, 583298, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1871, NULL, 'LGD_V_583279', 'Mattiguda', NULL, true, 583279, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1872, NULL, 'LGD_V_583272', 'Mehba', NULL, true, 583272, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1873, NULL, 'LGD_V_583450', 'Merakachinta', NULL, true, 583450, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1874, NULL, 'LGD_V_583347', 'Mettaguda', NULL, true, 583347, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1875, NULL, 'LGD_V_583373', 'Minumulaputtu', NULL, true, 583373, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1876, NULL, 'LGD_V_583452', 'Mokkaputtu', NULL, true, 583452, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1877, NULL, 'LGD_V_583283', 'Mokkaputtu', NULL, true, 583283, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1878, NULL, 'LGD_V_583252', 'Mokkaputtu', NULL, true, 583252, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1879, NULL, 'LGD_V_583433', 'Mondigumma', NULL, true, 583433, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1880, NULL, 'LGD_V_583337', 'Monjaputtu', NULL, true, 583337, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1881, NULL, 'LGD_V_583320', 'Monjuguda', NULL, true, 583320, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1882, NULL, 'LGD_V_583488', 'Mukkiputtu', NULL, true, 583488, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1883, NULL, 'LGD_V_583374', 'Mukkiputtu', NULL, true, 583374, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1884, NULL, 'LGD_V_583490', 'Mulaputtu', NULL, true, 583490, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1885, NULL, 'LGD_V_583407', 'Munchingiputtu', NULL, true, 583407, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1886, NULL, 'LGD_V_583544', 'Muraliputtu', NULL, true, 583544, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1887, NULL, 'LGD_V_583537', 'Murugu Cheruvu', NULL, true, 583537, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1888, NULL, 'LGD_V_583497', 'Nadimiveedhi', NULL, true, 583497, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1889, NULL, 'LGD_V_583481', 'Nandimetta', NULL, true, 583481, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1890, NULL, 'LGD_V_583267', 'Nandula Konda', NULL, true, 583267, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1891, NULL, 'LGD_V_583414', 'Narsiputtu', NULL, true, 583414, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1892, NULL, 'LGD_V_583476', 'Nitta Puttu', NULL, true, 583476, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1893, NULL, 'LGD_V_583409', 'Ontiputtu', NULL, true, 583409, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1894, NULL, 'LGD_V_583523', 'Padalaputtu', NULL, true, 583523, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1895, NULL, 'LGD_V_583294', 'Padalaputtu', NULL, true, 583294, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1896, NULL, 'LGD_V_583257', 'Panasa', NULL, true, 583257, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1897, NULL, 'LGD_V_583469', 'Panasa', NULL, true, 583469, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1898, NULL, 'LGD_V_583365', 'Panasaputtu', NULL, true, 583365, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1899, NULL, 'LGD_V_583464', 'Parathaputtu', NULL, true, 583464, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(1900, NULL, 'LGD_V_583473', 'Patha Pedaguda', NULL, true, 583473, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1901, NULL, 'LGD_V_583472', 'Patruniputtu', NULL, true, 583472, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1902, NULL, 'LGD_V_583467', 'Peda Guda', NULL, true, 583467, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1903, NULL, 'LGD_V_583567', 'Pedapadu', NULL, true, 583567, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1904, NULL, 'LGD_V_583260', 'Pedasindhiputtu', NULL, true, 583260, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1905, NULL, 'LGD_V_583397', 'Pedatamminagula', NULL, true, 583397, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1906, NULL, 'LGD_V_583574', 'Peddapetu', NULL, true, 583574, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1907, NULL, 'LGD_V_583547', 'Peddaputtu', NULL, true, 583547, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1908, NULL, 'LGD_V_583403', 'Peddaputtu', NULL, true, 583403, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1909, NULL, 'LGD_V_583543', 'Petumaliputtu', NULL, true, 583543, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1910, NULL, 'LGD_V_583254', 'Pilliganduva', NULL, true, 583254, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1911, NULL, 'LGD_V_583496', 'Pittagedda', NULL, true, 583496, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1912, NULL, 'LGD_V_583504', 'Pittagruddlu', NULL, true, 583504, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1913, NULL, 'LGD_V_583569', 'Podaputtu', NULL, true, 583569, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1914, NULL, 'LGD_V_583333', 'Poliputtu', NULL, true, 583333, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1915, NULL, 'LGD_V_583507', 'Poolabanda', NULL, true, 583507, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1916, NULL, 'LGD_V_583408', 'Poturajuputtu', NULL, true, 583408, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1917, NULL, 'LGD_V_583348', 'Pulijalama', NULL, true, 583348, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1918, NULL, 'LGD_V_583265', 'Putcheli', NULL, true, 583265, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1919, NULL, 'LGD_V_583530', 'Raipalli', NULL, true, 583530, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1920, NULL, 'LGD_V_583520', 'Rakasirai', NULL, true, 583520, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1921, NULL, 'LGD_V_583379', 'Ramulu', NULL, true, 583379, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1922, NULL, 'LGD_V_583289', 'Rangabayalu', NULL, true, 583289, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1923, NULL, 'LGD_V_583573', 'Rangilisingi', NULL, true, 583573, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1924, NULL, 'LGD_V_583549', 'Rangini Konda', NULL, true, 583549, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1925, NULL, 'LGD_V_583354', 'Ranginiguda', NULL, true, 583354, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1926, NULL, 'LGD_V_583536', 'Ratulaputtu', NULL, true, 583536, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1927, NULL, 'LGD_V_936621', 'Ravidiputtu', NULL, true, 936621, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1928, NULL, 'LGD_V_583343', 'Ravilabeda', NULL, true, 583343, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1929, NULL, 'LGD_V_583328', 'Saggulu', NULL, true, 583328, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1930, NULL, 'LGD_V_583506', 'Saginiputtu', NULL, true, 583506, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1931, NULL, 'LGD_V_583462', 'Sailamputtu', NULL, true, 583462, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1932, NULL, 'LGD_V_583253', 'Sangada', NULL, true, 583253, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1933, NULL, 'LGD_V_583319', 'Sangamvalasa', NULL, true, 583319, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1934, NULL, 'LGD_V_583369', 'Sankidigondi', NULL, true, 583369, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1935, NULL, 'LGD_V_583387', 'Santaveedhi', NULL, true, 583387, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1936, NULL, 'LGD_V_583501', 'Santaveedhi', NULL, true, 583501, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1937, NULL, 'LGD_V_583555', 'Sarabha Puttu', NULL, true, 583555, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1938, NULL, 'LGD_V_583466', 'Saradhi', NULL, true, 583466, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1939, NULL, 'LGD_V_583519', 'Sarasangi', NULL, true, 583519, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1940, NULL, 'LGD_V_583557', 'Sariyapalle', NULL, true, 583557, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1941, NULL, 'LGD_V_583362', 'Sariyaputtu', NULL, true, 583362, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1942, NULL, 'LGD_V_583281', 'Sebuguda', NULL, true, 583281, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1943, NULL, 'LGD_V_583465', 'Sellum', NULL, true, 583465, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1944, NULL, 'LGD_V_583400', 'Sindhiputtu', NULL, true, 583400, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1945, NULL, 'LGD_V_583350', 'Siragamputtu', NULL, true, 583350, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1946, NULL, 'LGD_V_583493', 'Siragamputtu', NULL, true, 583493, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1947, NULL, 'LGD_V_583335', 'Siragamputtu', NULL, true, 583335, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1948, NULL, 'LGD_V_583511', 'Sirlimetta', NULL, true, 583511, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1949, NULL, 'LGD_V_583352', 'Sojjavada', NULL, true, 583352, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1950, NULL, 'LGD_V_583554', 'Solagam Puttu', NULL, true, 583554, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1951, NULL, 'LGD_V_583325', 'Solagamputtu', NULL, true, 583325, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1952, NULL, 'LGD_V_583413', 'Sujanakota', NULL, true, 583413, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1953, NULL, 'LGD_V_583371', 'Sujanakotapeta', NULL, true, 583371, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1954, NULL, 'LGD_V_583479', 'Sunnapu Kota', NULL, true, 583479, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1955, NULL, 'LGD_V_583500', 'Surtaniputtu', NULL, true, 583500, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1956, NULL, 'LGD_V_583322', 'Suttiguda', NULL, true, 583322, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1957, NULL, 'LGD_V_583566', 'Taddapalli', NULL, true, 583566, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1958, NULL, 'LGD_V_583510', 'Tadiputtu', NULL, true, 583510, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1959, NULL, 'LGD_V_583269', 'Talabirada', NULL, true, 583269, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1960, NULL, 'LGD_V_583522', 'Talabirada', NULL, true, 583522, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1961, NULL, 'LGD_V_583417', 'Talabutota', NULL, true, 583417, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1962, NULL, 'LGD_V_583570', 'Talimba', NULL, true, 583570, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1963, NULL, 'LGD_V_583491', 'Tamarapalle', NULL, true, 583491, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1964, NULL, 'LGD_V_583516', 'Tangula', NULL, true, 583516, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1965, NULL, 'LGD_V_583394', 'Tankaputtu', NULL, true, 583394, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1966, NULL, 'LGD_V_583532', 'Tarigeda', NULL, true, 583532, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1967, NULL, 'LGD_V_583263', 'Tarlaguda', NULL, true, 583263, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1968, NULL, 'LGD_V_583380', 'Tenelamamidi', NULL, true, 583380, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1969, NULL, 'LGD_V_583364', 'Tikkarapada', NULL, true, 583364, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1970, NULL, 'LGD_V_583278', 'Tillaypada', NULL, true, 583278, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1971, NULL, 'LGD_V_583425', 'Tontaputtu', NULL, true, 583425, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1972, NULL, 'LGD_V_583332', 'Totagondiputtu', NULL, true, 583332, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1973, NULL, 'LGD_V_583498', 'Tudumurai', NULL, true, 583498, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1974, NULL, 'LGD_V_936622', 'Tumidiputtu', NULL, true, 936622, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1975, NULL, 'LGD_V_583455', 'Tumulapanasa', NULL, true, 583455, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1976, NULL, 'LGD_V_583552', 'Tungi Kota', NULL, true, 583552, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1977, NULL, 'LGD_V_583563', 'Tussapalli', NULL, true, 583563, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1978, NULL, 'LGD_V_583444', 'Vaddiputtu', NULL, true, 583444, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1979, NULL, 'LGD_V_583564', 'Vadlamputtu', NULL, true, 583564, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1980, NULL, 'LGD_V_583264', 'Valajangi', NULL, true, 583264, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1981, NULL, 'LGD_V_583251', 'Vallayibeeru', NULL, true, 583251, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1982, NULL, 'LGD_V_583528', 'Vanabhasingi', NULL, true, 583528, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1983, NULL, 'LGD_V_583276', 'Vanagumma Kusumaputtu', NULL, true, 583276, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1984, NULL, 'LGD_V_930871', 'Vandanapalli', 'వందనపల్లి', true, 930871, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1985, NULL, 'LGD_V_583457', 'Vandlamputtu', NULL, true, 583457, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1986, NULL, 'LGD_V_583309', 'Vandrangula', NULL, true, 583309, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1987, NULL, 'LGD_V_583268', 'Vanugumma', NULL, true, 583268, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1988, NULL, 'LGD_V_583533', 'Vanuguputtu', NULL, true, 583533, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1989, NULL, 'LGD_V_583515', 'Vetchangi', NULL, true, 583515, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1990, NULL, 'LGD_V_583541', 'Vetchangi Puttu', NULL, true, 583541, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1991, NULL, 'LGD_V_583494', 'Vuppacheruvu', NULL, true, 583494, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1992, NULL, 'LGD_V_583358', 'Vurikigummi', NULL, true, 583358, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1993, NULL, 'LGD_V_583385', 'Yedukondalabanda', NULL, true, 583385, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1994, NULL, 'LGD_V_583477', 'Yenugurai', NULL, true, 583477, 'LGD', false, '2026-10-31 21:19:48.053627+05:30', 11, 10),
	(1995, NULL, 'LGD_V_584792', '14 Mile Stone', NULL, true, 584792, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(1996, NULL, 'LGD_V_584685', 'Allivara', NULL, true, 584685, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(1997, NULL, 'LGD_V_584768', 'Aluguru', NULL, true, 584768, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(1998, NULL, 'LGD_V_584635', 'Ampuru', NULL, true, 584635, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(1999, NULL, 'LGD_V_584779', 'Antilova', NULL, true, 584779, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(2000, NULL, 'LGD_V_584733', 'Arjapuram', NULL, true, 584733, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2001, NULL, 'LGD_V_584738', 'Arlada', NULL, true, 584738, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2002, NULL, 'LGD_V_584762', 'Ayinada', NULL, true, 584762, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2003, NULL, 'LGD_V_584727', 'Baddigummi', NULL, true, 584727, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2004, NULL, 'LGD_V_584618', 'Badimela', NULL, true, 584618, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2005, NULL, 'LGD_V_584748', 'Balamalu', NULL, true, 584748, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2006, NULL, 'LGD_V_584786', 'Bandalu', NULL, true, 584786, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2007, NULL, 'LGD_V_584688', 'Bandapolam', NULL, true, 584688, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2008, NULL, 'LGD_V_584672', 'Bangarumetta', NULL, true, 584672, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2009, NULL, 'LGD_V_584588', 'Bantrothuputtu', NULL, true, 584588, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2010, NULL, 'LGD_V_584592', 'Baridiputtu', NULL, true, 584592, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2011, NULL, 'LGD_V_584645', 'Barisingi', NULL, true, 584645, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2012, NULL, 'LGD_V_584589', 'Barluputtu', NULL, true, 584589, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2013, NULL, 'LGD_V_584747', 'Bidarigaruvu', NULL, true, 584747, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2014, NULL, 'LGD_V_584692', 'Birimisala', NULL, true, 584692, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2015, NULL, 'LGD_V_584650', 'Boddaputtu', NULL, true, 584650, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2016, NULL, 'LGD_V_584591', 'Boddaputtu', NULL, true, 584591, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2017, NULL, 'LGD_V_584628', 'Boddimamidi', NULL, true, 584628, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2018, NULL, 'LGD_V_584742', 'Bodichettu', NULL, true, 584742, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2019, NULL, 'LGD_V_584629', 'Bokkellu', NULL, true, 584629, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2020, NULL, 'LGD_V_584593', 'Bonjangi', NULL, true, 584593, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2021, NULL, 'LGD_V_584718', 'Buradapadu', NULL, true, 584718, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2022, NULL, 'LGD_V_584717', 'Burugu Chetru', NULL, true, 584717, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2023, NULL, 'LGD_V_584624', 'Chakirevu', NULL, true, 584624, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2024, NULL, 'LGD_V_584793', 'Chantada', NULL, true, 584793, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2025, NULL, 'LGD_V_584673', 'Cheedikudda', NULL, true, 584673, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2026, NULL, 'LGD_V_584598', 'Cheedimetta', NULL, true, 584598, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2027, NULL, 'LGD_V_584638', 'Cheedimetta', NULL, true, 584638, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2028, NULL, 'LGD_V_931002', 'Cheekupanasa', NULL, true, 931002, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2029, NULL, 'LGD_V_584752', 'Cheemalapalle', NULL, true, 584752, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2030, NULL, 'LGD_V_584730', 'Chilakalagondi', NULL, true, 584730, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2031, NULL, 'LGD_V_584706', 'Chintada', NULL, true, 584706, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2032, NULL, 'LGD_V_584612', 'Chintagondi', NULL, true, 584612, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2033, NULL, 'LGD_V_584657', 'Chintala Veedhi', NULL, true, 584657, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2034, NULL, 'LGD_V_584700', 'Chodepalle', NULL, true, 584700, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2035, NULL, 'LGD_V_584764', 'Dabbagaruvu', NULL, true, 584764, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2036, NULL, 'LGD_V_584782', 'Dabbapadu', NULL, true, 584782, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2037, NULL, 'LGD_V_584609', 'Dabbaputtu', NULL, true, 584609, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2038, NULL, 'LGD_V_584640', 'Dalimputtu', NULL, true, 584640, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2039, NULL, 'LGD_V_584714', 'Dallapalle', NULL, true, 584714, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2040, NULL, 'LGD_V_584716', 'Darapalle', NULL, true, 584716, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2041, NULL, 'LGD_V_584633', 'Degalaveedhi', NULL, true, 584633, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2042, NULL, 'LGD_V_584771', 'Devapuram', NULL, true, 584771, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2043, NULL, 'LGD_V_584643', 'Devarapalle', NULL, true, 584643, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2044, NULL, 'LGD_V_584651', 'Digasampalu', NULL, true, 584651, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2045, NULL, 'LGD_V_584681', 'Digumodaputtu', NULL, true, 584681, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2046, NULL, 'LGD_V_584626', 'Doddipalle', NULL, true, 584626, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2047, NULL, 'LGD_V_584631', 'Dokuluru', NULL, true, 584631, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2048, NULL, 'LGD_V_584590', 'Donela', NULL, true, 584590, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2049, NULL, 'LGD_V_584611', 'Dummaputtu', NULL, true, 584611, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2050, NULL, 'LGD_V_584725', 'Edulapalem', NULL, true, 584725, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2051, NULL, 'LGD_V_584669', 'Eegasampalu', NULL, true, 584669, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2052, NULL, 'LGD_V_584639', 'Gabbangi', NULL, true, 584639, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2053, NULL, 'LGD_V_584756', 'Gadabavalasa @ Y.Kusarlapalem', NULL, true, 584756, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2054, NULL, 'LGD_V_584750', 'Gaddibanda', NULL, true, 584750, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2055, NULL, 'LGD_V_584702', 'Gaddibandalu', NULL, true, 584702, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2056, NULL, 'LGD_V_584634', 'Gadivalasa', NULL, true, 584634, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2057, NULL, 'LGD_V_584689', 'Galipadu', NULL, true, 584689, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2058, NULL, 'LGD_V_584794', 'Ganjigedda', NULL, true, 584794, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2059, NULL, 'LGD_V_584763', 'Gathapanuku', NULL, true, 584763, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2060, NULL, 'LGD_V_584596', 'Goddalipadu', NULL, true, 584596, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2061, NULL, 'LGD_V_584788', 'Godugula', NULL, true, 584788, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2062, NULL, 'LGD_V_584600', 'Gondeli', NULL, true, 584600, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2063, NULL, 'LGD_V_584653', 'Gonduru', NULL, true, 584653, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2064, NULL, 'LGD_V_584746', 'Goonagummi', NULL, true, 584746, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2065, NULL, 'LGD_V_584800', 'Gudivada (Ct)', NULL, true, 584800, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2066, NULL, 'LGD_V_584723', 'Gulimiddhachatru', NULL, true, 584723, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2067, NULL, 'LGD_V_584736', 'Gulli', NULL, true, 584736, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2068, NULL, 'LGD_V_584751', 'Gullipalle', NULL, true, 584751, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2069, NULL, 'LGD_V_584697', 'Gunjigedda', NULL, true, 584697, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2070, NULL, 'LGD_V_584709', 'Gurragaruvu', NULL, true, 584709, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2071, NULL, 'LGD_V_584646', 'Gurrampanuku', NULL, true, 584646, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2072, NULL, 'LGD_V_584665', 'Gurupalle', NULL, true, 584665, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2073, NULL, 'LGD_V_584637', 'Guttulaputtu', NULL, true, 584637, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2074, NULL, 'LGD_V_584775', 'Hanumanthapuram', NULL, true, 584775, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2075, NULL, 'LGD_V_584630', 'Iradapalle', NULL, true, 584630, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2076, NULL, 'LGD_V_584705', 'Isakagaruvu', NULL, true, 584705, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2077, NULL, 'LGD_V_584619', 'Isakagaruvu', NULL, true, 584619, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2078, NULL, 'LGD_V_584680', 'Iskali', NULL, true, 584680, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2079, NULL, 'LGD_V_584605', 'Jallipalle', NULL, true, 584605, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2080, NULL, 'LGD_V_584743', 'Jangadapalle', NULL, true, 584743, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2081, NULL, 'LGD_V_584783', 'Jarragaruvu', NULL, true, 584783, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2082, NULL, 'LGD_V_584671', 'Jeedipagada', NULL, true, 584671, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2083, NULL, 'LGD_V_584781', 'Jeelugupadu', NULL, true, 584781, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2084, NULL, 'LGD_V_584754', 'Jodimamidi', NULL, true, 584754, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2085, NULL, 'LGD_V_584698', 'Joduru', NULL, true, 584698, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2086, NULL, 'LGD_V_584663', 'Kadeli', NULL, true, 584663, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2087, NULL, 'LGD_V_584729', 'Kakki', NULL, true, 584729, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2088, NULL, 'LGD_V_584649', 'Kallalabayalu', NULL, true, 584649, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2089, NULL, 'LGD_V_584683', 'Kandrangipadu', NULL, true, 584683, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2090, NULL, 'LGD_V_584734', 'Kandulapalem', NULL, true, 584734, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2091, NULL, 'LGD_V_584777', 'Kangedda', NULL, true, 584777, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2092, NULL, 'LGD_V_584728', 'Kappalagondi', NULL, true, 584728, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2093, NULL, 'LGD_V_584726', 'Kapparamajji', NULL, true, 584726, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2094, NULL, 'LGD_V_584666', 'Karakaputtu', NULL, true, 584666, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2095, NULL, 'LGD_V_584670', 'Karakaputtu', NULL, true, 584670, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2096, NULL, 'LGD_V_584690', 'Karibanda', NULL, true, 584690, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2097, NULL, 'LGD_V_584787', 'Karya Bandu', NULL, true, 584787, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2098, NULL, 'LGD_V_584610', 'Kavirai', NULL, true, 584610, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2099, NULL, 'LGD_V_584594', 'Kinchuru', NULL, true, 584594, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(2100, NULL, 'LGD_V_584661', 'Kindangi', NULL, true, 584661, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2101, NULL, 'LGD_V_584740', 'Kodulolangipadu', NULL, true, 584740, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2102, NULL, 'LGD_V_584615', 'Kollambo', NULL, true, 584615, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2103, NULL, 'LGD_V_584757', 'Kondajeelugu', NULL, true, 584757, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2104, NULL, 'LGD_V_584675', 'Kondamamidi', NULL, true, 584675, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2105, NULL, 'LGD_V_584778', 'Kotha Valasapadu', NULL, true, 584778, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2106, NULL, 'LGD_V_584644', 'Kothabu', NULL, true, 584644, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2107, NULL, 'LGD_V_584607', 'Kothapalle', NULL, true, 584607, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2108, NULL, 'LGD_V_584701', 'Kothapolam', NULL, true, 584701, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2109, NULL, 'LGD_V_584668', 'Kothavalasa', NULL, true, 584668, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2110, NULL, 'LGD_V_584772', 'Kothavooru', NULL, true, 584772, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2111, NULL, 'LGD_V_584621', 'Kothuru', NULL, true, 584621, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2112, NULL, 'LGD_V_584679', 'Kujjali', NULL, true, 584679, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2113, NULL, 'LGD_V_584785', 'Kummaripalem', NULL, true, 584785, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2114, NULL, 'LGD_V_584659', 'Kummariputtu', NULL, true, 584659, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2115, NULL, 'LGD_V_584721', 'Kummarithumu', NULL, true, 584721, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2116, NULL, 'LGD_V_584761', 'Kusarlapalem', NULL, true, 584761, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2117, NULL, 'LGD_V_584627', 'Ladaputtu', NULL, true, 584627, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2118, NULL, 'LGD_V_584664', 'Lagisapalle', NULL, true, 584664, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2119, NULL, 'LGD_V_584599', 'Lampeli', NULL, true, 584599, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2120, NULL, 'LGD_V_584616', 'Lingaputtu', NULL, true, 584616, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2121, NULL, 'LGD_V_584719', 'Lolangipadu', NULL, true, 584719, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2122, NULL, 'LGD_V_584694', 'Madigabanda', NULL, true, 584694, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2123, NULL, 'LGD_V_584707', 'Malakapolam', NULL, true, 584707, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2124, NULL, 'LGD_V_584744', 'Malapadu', NULL, true, 584744, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2125, NULL, 'LGD_V_584632', 'Mandiputtu', NULL, true, 584632, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2126, NULL, 'LGD_V_584676', 'Minumuluru', NULL, true, 584676, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2127, NULL, 'LGD_V_930999', 'Mittalapadu', NULL, true, 930999, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2128, NULL, 'LGD_V_584708', 'Modapalle', NULL, true, 584708, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2129, NULL, 'LGD_V_584774', 'Mulagalapalem', NULL, true, 584774, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2130, NULL, 'LGD_V_584606', 'Munchingi Puttu', NULL, true, 584606, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2131, NULL, 'LGD_V_584722', 'Nandigaruvu', NULL, true, 584722, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2132, NULL, 'LGD_V_584642', 'Nereduvalasa', NULL, true, 584642, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2133, NULL, 'LGD_V_584604', 'Nereduvalasa', NULL, true, 584604, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2134, NULL, 'LGD_V_584732', 'Obarthi', NULL, true, 584732, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2135, NULL, 'LGD_V_584699', 'Ontipaka', NULL, true, 584699, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2136, NULL, 'LGD_V_584595', 'Ontiveedhulu', NULL, true, 584595, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2137, NULL, 'LGD_V_584703', 'Onuru', NULL, true, 584703, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2138, NULL, 'LGD_V_584647', 'Palamanichilaka', NULL, true, 584647, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2139, NULL, 'LGD_V_584636', 'Pamurelli', NULL, true, 584636, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2140, NULL, 'LGD_V_584641', 'Panasapalle', NULL, true, 584641, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2141, NULL, 'LGD_V_584766', 'Panasaputtu', NULL, true, 584766, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2142, NULL, 'LGD_V_584784', 'Pandigunta', NULL, true, 584784, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2143, NULL, 'LGD_V_584655', 'Pathapaderu', NULL, true, 584655, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2144, NULL, 'LGD_V_584749', 'Pedapolam', NULL, true, 584749, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2145, NULL, 'LGD_V_584735', 'Pidugumamidi', NULL, true, 584735, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2146, NULL, 'LGD_V_584724', 'Piduguputtu', NULL, true, 584724, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2147, NULL, 'LGD_V_584602', 'Pilliputtu', NULL, true, 584602, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2148, NULL, 'LGD_V_584720', 'Poolabanda', NULL, true, 584720, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2149, NULL, 'LGD_V_584755', 'Pothampalem', NULL, true, 584755, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2150, NULL, 'LGD_V_584648', 'Pothurajumetta', NULL, true, 584648, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2151, NULL, 'LGD_V_584770', 'Pulusumamidi', NULL, true, 584770, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2152, NULL, 'LGD_V_584739', 'Putikagaruvu', NULL, true, 584739, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2153, NULL, 'LGD_V_584789', 'Puttarajupadu', NULL, true, 584789, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2154, NULL, 'LGD_V_584613', 'Raigedda', NULL, true, 584613, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2155, NULL, 'LGD_V_584758', 'Raipalem', NULL, true, 584758, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2156, NULL, 'LGD_V_584737', 'Rakota', NULL, true, 584737, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2157, NULL, 'LGD_V_584712', 'Ranambadi', NULL, true, 584712, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2158, NULL, 'LGD_V_584745', 'Rangasingipadu', NULL, true, 584745, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2159, NULL, 'LGD_V_584760', 'Rellabanda', NULL, true, 584760, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2160, NULL, 'LGD_V_584614', 'Sakiputtu', NULL, true, 584614, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2161, NULL, 'LGD_V_584710', 'Saldigedda', NULL, true, 584710, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2162, NULL, 'LGD_V_584765', 'Salugu', NULL, true, 584765, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2163, NULL, 'LGD_V_584686', 'Sangodi', NULL, true, 584686, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2164, NULL, 'LGD_V_584620', 'Santhaganduva', NULL, true, 584620, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2165, NULL, 'LGD_V_584713', 'Sappiputtu', NULL, true, 584713, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2166, NULL, 'LGD_V_584625', 'Sariapalle', NULL, true, 584625, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2167, NULL, 'LGD_V_584759', 'Seekaipadu', NULL, true, 584759, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2168, NULL, 'LGD_V_584780', 'Seekupanasa', NULL, true, 584780, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2169, NULL, 'LGD_V_584677', 'Seribayalu', NULL, true, 584677, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2170, NULL, 'LGD_V_584623', 'Sindugula', NULL, true, 584623, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2171, NULL, 'LGD_V_584622', 'Solamulu', NULL, true, 584622, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2172, NULL, 'LGD_V_584654', 'Sukuruputtu', NULL, true, 584654, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2173, NULL, 'LGD_V_584660', 'Sundruputtu', NULL, true, 584660, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2174, NULL, 'LGD_V_584753', 'Tagavulamamidi Garuvu', NULL, true, 584753, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2175, NULL, 'LGD_V_584656', 'Talarisingi', NULL, true, 584656, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2176, NULL, 'LGD_V_584687', 'Tamarapalle', NULL, true, 584687, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2177, NULL, 'LGD_V_584769', 'Taragam', NULL, true, 584769, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2178, NULL, 'LGD_V_584667', 'Thotagunnalu', NULL, true, 584667, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2179, NULL, 'LGD_V_584597', 'Thotalagondi', NULL, true, 584597, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2180, NULL, 'LGD_V_584678', 'Thumpada', NULL, true, 584678, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2181, NULL, 'LGD_V_584691', 'Tiyyagedda', NULL, true, 584691, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2182, NULL, 'LGD_V_584795', 'Tiyyagedda', NULL, true, 584795, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2183, NULL, 'LGD_V_584773', 'Tummalapalem', NULL, true, 584773, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2184, NULL, 'LGD_V_584741', 'Turumamidi', NULL, true, 584741, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2185, NULL, 'LGD_V_584658', 'Ubbediputtu', NULL, true, 584658, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2186, NULL, 'LGD_V_584776', 'Valasamamidi', NULL, true, 584776, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2187, NULL, 'LGD_V_584617', 'Vallai', NULL, true, 584617, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2188, NULL, 'LGD_V_584603', 'Vallapuram', NULL, true, 584603, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2189, NULL, 'LGD_V_584711', 'Vanagarai', NULL, true, 584711, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2190, NULL, 'LGD_V_584601', 'Vanchadagondi', NULL, true, 584601, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2191, NULL, 'LGD_V_584652', 'Vanjangi', NULL, true, 584652, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2192, NULL, 'LGD_V_584704', 'Vanjaparthi', NULL, true, 584704, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2193, NULL, 'LGD_V_584791', 'Vanji Bathi', NULL, true, 584791, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2194, NULL, 'LGD_V_584790', 'Vankachinta', NULL, true, 584790, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2195, NULL, 'LGD_V_584715', 'Vankachinta', NULL, true, 584715, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2196, NULL, 'LGD_V_584684', 'Vanthadapalle', NULL, true, 584684, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2197, NULL, 'LGD_V_584608', 'Vanthalagummi', NULL, true, 584608, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2198, NULL, 'LGD_V_584731', 'Vanthalamamidi', NULL, true, 584731, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2199, NULL, 'LGD_V_584767', 'Vanthalamamidi @ Gadilametta', NULL, true, 584767, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(2200, NULL, 'LGD_V_584799', 'Vantipaka', NULL, true, 584799, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2201, NULL, 'LGD_V_584674', 'Vanugupalle', NULL, true, 584674, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2202, NULL, 'LGD_V_584662', 'Varthanapalle', NULL, true, 584662, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2203, NULL, 'LGD_V_584797', 'Varukaru', NULL, true, 584797, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2204, NULL, 'LGD_V_584587', 'Vurugonda', NULL, true, 584587, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2205, NULL, 'LGD_V_584682', 'Yegumodaputtu', NULL, true, 584682, 'LGD', false, '2026-10-31 21:20:01.549276+05:30', 12, 1),
	(2206, NULL, 'LGD_V_583632', 'A.Kummariputtu', NULL, true, 583632, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2207, NULL, 'LGD_V_583631', 'Adugulaputtu', NULL, true, 583631, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2208, NULL, 'LGD_V_583793', 'Agaruveedhi', NULL, true, 583793, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2209, NULL, 'LGD_V_583628', 'Alamagundam', NULL, true, 583628, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2210, NULL, 'LGD_V_583688', 'Allamputtu', NULL, true, 583688, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2211, NULL, 'LGD_V_583756', 'Allangiputtu', NULL, true, 583756, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2212, NULL, 'LGD_V_583605', 'Ambapada', NULL, true, 583605, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2213, NULL, 'LGD_V_583768', 'Ambeerupadu', NULL, true, 583768, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2214, NULL, 'LGD_V_583787', 'Amedelu', NULL, true, 583787, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2215, NULL, 'LGD_V_583844', 'Andravara', NULL, true, 583844, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2216, NULL, 'LGD_V_583697', 'Arada Kota', NULL, true, 583697, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2217, NULL, 'LGD_V_583822', 'Aradagudem', NULL, true, 583822, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2218, NULL, 'LGD_V_583648', 'Arimera', NULL, true, 583648, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2219, NULL, 'LGD_V_583620', 'Arlabu', NULL, true, 583620, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2220, NULL, 'LGD_V_583694', 'Badama', NULL, true, 583694, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2221, NULL, 'LGD_V_583583', 'Badambeeru', NULL, true, 583583, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2222, NULL, 'LGD_V_583815', 'Baithinilanka', NULL, true, 583815, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2223, NULL, 'LGD_V_583689', 'Ballapurai', NULL, true, 583689, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2224, NULL, 'LGD_V_583820', 'Bandamamidi', NULL, true, 583820, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2225, NULL, 'LGD_V_583805', 'Bangarumamidi', NULL, true, 583805, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2226, NULL, 'LGD_V_583626', 'Bangarumetta', NULL, true, 583626, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2227, NULL, 'LGD_V_583587', 'Bangarumetta', NULL, true, 583587, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2228, NULL, 'LGD_V_583839', 'Bangaruputtu', NULL, true, 583839, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2229, NULL, 'LGD_V_583838', 'Barrangibanda', NULL, true, 583838, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2230, NULL, 'LGD_V_583721', 'Basula', NULL, true, 583721, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2231, NULL, 'LGD_V_583719', 'Boddagondi', NULL, true, 583719, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2232, NULL, 'LGD_V_583771', 'Boddangipadu', NULL, true, 583771, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2233, NULL, 'LGD_V_583809', 'Boddaputtu', NULL, true, 583809, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2234, NULL, 'LGD_V_583643', 'Boddaputtu', NULL, true, 583643, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2235, NULL, 'LGD_V_583830', 'Bondaputtu', NULL, true, 583830, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2236, NULL, 'LGD_V_583693', 'Bongadari', NULL, true, 583693, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2237, NULL, 'LGD_V_583766', 'Bongaram', NULL, true, 583766, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2238, NULL, 'LGD_V_583755', 'Bongithali', NULL, true, 583755, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2239, NULL, 'LGD_V_583722', 'Bongujangi', NULL, true, 583722, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2240, NULL, 'LGD_V_583582', 'Borlada @ Badama', NULL, true, 583582, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2241, NULL, 'LGD_V_583814', 'Borramamidi', NULL, true, 583814, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2242, NULL, 'LGD_V_583795', 'Borraneredu', NULL, true, 583795, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2243, NULL, 'LGD_V_583590', 'Buradagunta', NULL, true, 583590, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2244, NULL, 'LGD_V_583846', 'Buradamamidi', NULL, true, 583846, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2245, NULL, 'LGD_V_912634', 'Burugu Veedhi', NULL, true, 912634, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2246, NULL, 'LGD_V_583706', 'Buruguputtu', NULL, true, 583706, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2247, NULL, 'LGD_V_583683', 'Buruguveedhi', NULL, true, 583683, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2248, NULL, 'LGD_V_583794', 'Buruguveedhi', NULL, true, 583794, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2249, NULL, 'LGD_V_583662', 'Buruguveedhi', NULL, true, 583662, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2250, NULL, 'LGD_V_583607', 'Busiputtu', NULL, true, 583607, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2251, NULL, 'LGD_V_583726', 'Chamagedda', NULL, true, 583726, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2252, NULL, 'LGD_V_583828', 'Chandiputtu', NULL, true, 583828, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2253, NULL, 'LGD_V_583754', 'Cheediputtu', NULL, true, 583754, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2254, NULL, 'LGD_V_583769', 'Cheekupanasa', NULL, true, 583769, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2255, NULL, 'LGD_V_583825', 'Cheepurugondi', NULL, true, 583825, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2256, NULL, 'LGD_V_583798', 'Chilakalaputtu', NULL, true, 583798, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2257, NULL, 'LGD_V_583585', 'China Mukhi Puttu', NULL, true, 583585, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2258, NULL, 'LGD_V_583717', 'Chinagullelu', NULL, true, 583717, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2259, NULL, 'LGD_V_583714', 'Chinavancharangi', NULL, true, 583714, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2260, NULL, 'LGD_V_583678', 'Chintagaruvu', NULL, true, 583678, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2261, NULL, 'LGD_V_583588', 'Chintalapadu', NULL, true, 583588, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2262, NULL, 'LGD_V_583645', 'Chitraiputtu', NULL, true, 583645, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2263, NULL, 'LGD_V_583764', 'Chitrakayaputtu', NULL, true, 583764, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2264, NULL, 'LGD_V_583639', 'Chittamrai', NULL, true, 583639, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2265, NULL, 'LGD_V_583647', 'Chuttumetta', NULL, true, 583647, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2266, NULL, 'LGD_V_583576', 'Dabbaputtu', NULL, true, 583576, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2267, NULL, 'LGD_V_583623', 'Deguvabondapalle', NULL, true, 583623, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2268, NULL, 'LGD_V_583790', 'Devarajumerakalu', NULL, true, 583790, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2269, NULL, 'LGD_V_583746', 'Dondaraiputtu', NULL, true, 583746, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2270, NULL, 'LGD_V_583788', 'Dosalabanda', NULL, true, 583788, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2271, NULL, 'LGD_V_583779', 'Duddupalle', NULL, true, 583779, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2272, NULL, 'LGD_V_583773', 'Gabuduputtu', NULL, true, 583773, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2273, NULL, 'LGD_V_583682', 'Gaburumamidi', NULL, true, 583682, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2274, NULL, 'LGD_V_583686', 'Gadepalle', NULL, true, 583686, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2275, NULL, 'LGD_V_583710', 'Gadugupalle', NULL, true, 583710, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2276, NULL, 'LGD_V_583597', 'Gadulaputtu', NULL, true, 583597, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2277, NULL, 'LGD_V_583611', 'Gajjangiveedhi', NULL, true, 583611, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2278, NULL, 'LGD_V_583784', 'Gajjedi', NULL, true, 583784, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2279, NULL, 'LGD_V_583748', 'Galagonda', NULL, true, 583748, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2280, NULL, 'LGD_V_583744', 'Gallelu', NULL, true, 583744, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2281, NULL, 'LGD_V_583753', 'Gamparai', NULL, true, 583753, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2282, NULL, 'LGD_V_583770', 'Gandalam', NULL, true, 583770, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2283, NULL, 'LGD_V_583751', 'Gasabu', NULL, true, 583751, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2284, NULL, 'LGD_V_583728', 'Gindali', NULL, true, 583728, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2285, NULL, 'LGD_V_583730', 'Ginnegaruvu', NULL, true, 583730, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2286, NULL, 'LGD_V_583681', 'Ginnelakota', NULL, true, 583681, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2287, NULL, 'LGD_V_583736', 'Gocheri', NULL, true, 583736, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2288, NULL, 'LGD_V_583685', 'Goddiputtu', NULL, true, 583685, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2289, NULL, 'LGD_V_583761', 'Gomangi', NULL, true, 583761, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2290, NULL, 'LGD_V_583642', 'Gondikodaputtu', NULL, true, 583642, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2291, NULL, 'LGD_V_583842', 'Gorcheri', NULL, true, 583842, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2292, NULL, 'LGD_V_583665', 'Gulleluputtu', NULL, true, 583665, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2293, NULL, 'LGD_V_583668', 'Gunjuvada', NULL, true, 583668, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2294, NULL, 'LGD_V_583610', 'Gurralabailu', NULL, true, 583610, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2295, NULL, 'LGD_V_583677', 'Injari', NULL, true, 583677, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2296, NULL, 'LGD_V_583724', 'Inupatigalu', NULL, true, 583724, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2297, NULL, 'LGD_V_583671', 'Jadiguda', NULL, true, 583671, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2298, NULL, 'LGD_V_583702', 'Jadiguda', NULL, true, 583702, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2299, NULL, 'LGD_V_583774', 'Jakkum', NULL, true, 583774, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(2300, NULL, 'LGD_V_583782', 'Jalampalle', NULL, true, 583782, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2301, NULL, 'LGD_V_583808', 'Jamadalu', NULL, true, 583808, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2302, NULL, 'LGD_V_583617', 'Jamiguda', NULL, true, 583617, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2303, NULL, 'LGD_V_583757', 'Jamiguda', NULL, true, 583757, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2304, NULL, 'LGD_V_583712', 'Jangamputtu', NULL, true, 583712, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2305, NULL, 'LGD_V_583658', 'Jangamputtu', NULL, true, 583658, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2306, NULL, 'LGD_V_583664', 'Jarsingi', NULL, true, 583664, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2307, NULL, 'LGD_V_583713', 'Jarupulapedabayalu', NULL, true, 583713, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2308, NULL, 'LGD_V_583833', 'Jayantikota', NULL, true, 583833, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2309, NULL, 'LGD_V_583580', 'Jeeluguluputtu', NULL, true, 583580, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2310, NULL, 'LGD_V_930996', 'Kagula', 'కాగుల', true, 930996, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2311, NULL, 'LGD_V_583698', 'Kaguvalasa', NULL, true, 583698, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2312, NULL, 'LGD_V_583604', 'Kallabu', NULL, true, 583604, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2313, NULL, 'LGD_V_583827', 'Kambalabayalu', NULL, true, 583827, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2314, NULL, 'LGD_V_583812', 'Kandulagunta', NULL, true, 583812, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2315, NULL, 'LGD_V_583747', 'Kangulu', NULL, true, 583747, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2316, NULL, 'LGD_V_583655', 'Kappada', NULL, true, 583655, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2317, NULL, 'LGD_V_583618', 'Karjuraguda', NULL, true, 583618, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2318, NULL, 'LGD_V_583711', 'Karugonda', NULL, true, 583711, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2319, NULL, 'LGD_V_583695', 'Kavurupalle', NULL, true, 583695, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2320, NULL, 'LGD_V_583670', 'Kenduguda', NULL, true, 583670, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2321, NULL, 'LGD_V_583650', 'Kilumulu', NULL, true, 583650, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2322, NULL, 'LGD_V_583824', 'Kimudupalle', NULL, true, 583824, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2323, NULL, 'LGD_V_583741', 'Kinchuru', NULL, true, 583741, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2324, NULL, 'LGD_V_583810', 'Kindalam', NULL, true, 583810, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2325, NULL, 'LGD_V_583811', 'Kintharelu', NULL, true, 583811, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2326, NULL, 'LGD_V_583636', 'Kittukonda', NULL, true, 583636, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2327, NULL, 'LGD_V_583843', 'Kodaputtu', NULL, true, 583843, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2328, NULL, 'LGD_V_583651', 'Koduvalasa', NULL, true, 583651, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2329, NULL, 'LGD_V_583612', 'Konaputtu', NULL, true, 583612, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2330, NULL, 'LGD_V_583796', 'Kondemulu', NULL, true, 583796, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2331, NULL, 'LGD_V_583675', 'Kondru', NULL, true, 583675, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2332, NULL, 'LGD_V_583615', 'Kothuru', NULL, true, 583615, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2333, NULL, 'LGD_V_583738', 'Kothuru', NULL, true, 583738, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2334, NULL, 'LGD_V_583780', 'Kotipalle', NULL, true, 583780, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2335, NULL, 'LGD_V_583579', 'Krishnapuram', NULL, true, 583579, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2336, NULL, 'LGD_V_583708', 'Kudasingi', NULL, true, 583708, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2337, NULL, 'LGD_V_583758', 'Kulluba', NULL, true, 583758, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2338, NULL, 'LGD_V_583777', 'Kummarigunta', NULL, true, 583777, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2339, NULL, 'LGD_V_583584', 'Kummariveedhi', NULL, true, 583584, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2340, NULL, 'LGD_V_583734', 'Kuncharai', NULL, true, 583734, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2341, NULL, 'LGD_V_583813', 'Kunthurla', NULL, true, 583813, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2342, NULL, 'LGD_V_583760', 'Kunthuruputtu', NULL, true, 583760, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2343, NULL, 'LGD_V_583785', 'Kuntumamidi', NULL, true, 583785, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2344, NULL, 'LGD_V_583727', 'Kurajangi', NULL, true, 583727, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2345, NULL, 'LGD_V_583602', 'Kurtada', NULL, true, 583602, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2346, NULL, 'LGD_V_583749', 'Kuthamputtu', NULL, true, 583749, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2347, NULL, 'LGD_V_583663', 'Kuyyaba', NULL, true, 583663, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2348, NULL, 'LGD_V_583634', 'Labjari', NULL, true, 583634, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2349, NULL, 'LGD_V_583625', 'Lagabusi', NULL, true, 583625, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2350, NULL, 'LGD_V_583826', 'Lagasariputtu', NULL, true, 583826, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2351, NULL, 'LGD_V_583627', 'Lakyaputtu', NULL, true, 583627, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2352, NULL, 'LGD_V_583656', 'Lakyuputtu', NULL, true, 583656, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2353, NULL, 'LGD_V_583735', 'Landulu', NULL, true, 583735, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2354, NULL, 'LGD_V_583659', 'Laxmipeta', NULL, true, 583659, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2355, NULL, 'LGD_V_583603', 'Laxmipuram', NULL, true, 583603, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2356, NULL, 'LGD_V_583775', 'Lichabu', NULL, true, 583775, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2357, NULL, 'LGD_V_583614', 'Limmagaruvu', NULL, true, 583614, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2358, NULL, 'LGD_V_583703', 'Limmagunta', NULL, true, 583703, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2359, NULL, 'LGD_V_583801', 'Lingeruputtu', NULL, true, 583801, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2360, NULL, 'LGD_V_583799', 'Lingeti', NULL, true, 583799, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2361, NULL, 'LGD_V_583778', 'Luvvapalle', NULL, true, 583778, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2362, NULL, 'LGD_V_583652', 'Luvvasingi', NULL, true, 583652, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2363, NULL, 'LGD_V_583797', 'Maggamveedhi', NULL, true, 583797, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2364, NULL, 'LGD_V_583831', 'Malakariputtu', NULL, true, 583831, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2365, NULL, 'LGD_V_583729', 'Malaseethakota', NULL, true, 583729, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2366, NULL, 'LGD_V_583733', 'Malliputtu', NULL, true, 583733, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2367, NULL, 'LGD_V_583654', 'Mandiba', NULL, true, 583654, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2368, NULL, 'LGD_V_583646', 'Mangabanda', NULL, true, 583646, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2369, NULL, 'LGD_V_583806', 'Maredupalle', NULL, true, 583806, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2370, NULL, 'LGD_V_583819', 'Marridatu', NULL, true, 583819, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2371, NULL, 'LGD_V_583743', 'Marriputtu', NULL, true, 583743, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2372, NULL, 'LGD_V_583821', 'Matchepalle', NULL, true, 583821, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2373, NULL, 'LGD_V_583836', 'Merakachinta', NULL, true, 583836, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2374, NULL, 'LGD_V_583723', 'Mettaguda', NULL, true, 583723, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2375, NULL, 'LGD_V_583786', 'Mettalagummi', NULL, true, 583786, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2376, NULL, 'LGD_V_583709', 'Mondikota', NULL, true, 583709, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2377, NULL, 'LGD_V_583740', 'Moyyalagummi', NULL, true, 583740, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2378, NULL, 'LGD_V_583802', 'Mulagaruvu', NULL, true, 583802, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2379, NULL, 'LGD_V_583613', 'Mulakoravangi @ Chinakoravangi', NULL, true, 583613, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2380, NULL, 'LGD_V_583732', 'Mulalova', NULL, true, 583732, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2381, NULL, 'LGD_V_583599', 'Murajaribanda', NULL, true, 583599, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2382, NULL, 'LGD_V_583640', 'Musidiputtu', NULL, true, 583640, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2383, NULL, 'LGD_V_583731', 'Nadimivada', NULL, true, 583731, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2384, NULL, 'LGD_V_583601', 'Nandimetta', NULL, true, 583601, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2385, NULL, 'LGD_V_583673', 'Nanubaru', NULL, true, 583673, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2386, NULL, 'LGD_V_583792', 'Nittaputtu', NULL, true, 583792, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2387, NULL, 'LGD_V_583699', 'Palavalasa', NULL, true, 583699, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2388, NULL, 'LGD_V_583701', 'Pandigunta', NULL, true, 583701, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2389, NULL, 'LGD_V_583638', 'Panneda', NULL, true, 583638, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2390, NULL, 'LGD_V_583578', 'Parreda', NULL, true, 583578, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2391, NULL, 'LGD_V_583591', 'Pathruda', NULL, true, 583591, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2392, NULL, 'LGD_V_583589', 'Peda Koravangi', NULL, true, 583589, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2393, NULL, 'LGD_V_583742', 'Peda Vancharangi', NULL, true, 583742, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2394, NULL, 'LGD_V_583641', 'Pedabayalu', NULL, true, 583641, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2395, NULL, 'LGD_V_583841', 'Pedagondi', NULL, true, 583841, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2396, NULL, 'LGD_V_583716', 'Pedagullelu', NULL, true, 583716, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2397, NULL, 'LGD_V_583586', 'Pedakonda', NULL, true, 583586, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2398, NULL, 'LGD_V_583840', 'Pedakondapalle', NULL, true, 583840, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2399, NULL, 'LGD_V_583594', 'Pedalova', NULL, true, 583594, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11);
INSERT INTO public.mst_villages (id, gram_panchayat_id, code, name_en, name_te, is_active, lgd_code, data_source, is_verified, lgd_synced_at, import_batch_id, mandal_id) OVERRIDING SYSTEM VALUE VALUES
	(2400, NULL, 'LGD_V_583679', 'Pedapadu', NULL, true, 583679, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2401, NULL, 'LGD_V_583687', 'Pedapalle', NULL, true, 583687, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2402, NULL, 'LGD_V_583581', 'Pedasariyapalle', NULL, true, 583581, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2403, NULL, 'LGD_V_583600', 'Peddaputtu', NULL, true, 583600, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2404, NULL, 'LGD_V_583767', 'Peparuvalasa @ Kumborla', NULL, true, 583767, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2405, NULL, 'LGD_V_583762', 'Pilliputtu', NULL, true, 583762, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2406, NULL, 'LGD_V_583669', 'Pinaravalli', NULL, true, 583669, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2407, NULL, 'LGD_V_583718', 'Pittalaborra', NULL, true, 583718, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2408, NULL, 'LGD_V_583835', 'Poi Palle', NULL, true, 583835, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2409, NULL, 'LGD_V_583619', 'Poipalle', NULL, true, 583619, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2410, NULL, 'LGD_V_583789', 'Pothulagaruvu', NULL, true, 583789, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2411, NULL, 'LGD_V_583823', 'Puligondi', NULL, true, 583823, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2412, NULL, 'LGD_V_583691', 'Pulusumamidi', NULL, true, 583691, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2413, NULL, 'LGD_V_583696', 'Puruguduputtu @ Vanuguputtu', NULL, true, 583696, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2414, NULL, 'LGD_V_583720', 'Puttakota', NULL, true, 583720, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2415, NULL, 'LGD_V_583653', 'Puturu', NULL, true, 583653, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2416, NULL, 'LGD_V_583759', 'Rai Mamidi', NULL, true, 583759, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2417, NULL, 'LGD_V_583765', 'Rallagongu', NULL, true, 583765, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2418, NULL, 'LGD_V_583621', 'Rangaloya', NULL, true, 583621, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2419, NULL, 'LGD_V_583684', 'Ranjalamamidi', NULL, true, 583684, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2420, NULL, 'LGD_V_583817', 'Rasiguppa', NULL, true, 583817, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2421, NULL, 'LGD_V_583637', 'Rogulu', NULL, true, 583637, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2422, NULL, 'LGD_V_583596', 'Rudagomangi', NULL, true, 583596, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2423, NULL, 'LGD_V_583577', 'Rudakota', NULL, true, 583577, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2424, NULL, 'LGD_V_583595', 'Rundalamputtu', NULL, true, 583595, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2425, NULL, 'LGD_V_583791', 'Sadaru Mamidi', NULL, true, 583791, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2426, NULL, 'LGD_V_583666', 'Sailamkota', NULL, true, 583666, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2427, NULL, 'LGD_V_583674', 'Sakirevu', NULL, true, 583674, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2428, NULL, 'LGD_V_583772', 'Salebulu', NULL, true, 583772, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2429, NULL, 'LGD_V_583818', 'Sampangidatu', NULL, true, 583818, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2430, NULL, 'LGD_V_583816', 'Sampangiputtu', NULL, true, 583816, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2431, NULL, 'LGD_V_583635', 'Sampangiputtu', NULL, true, 583635, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2432, NULL, 'LGD_V_583616', 'Sapparlamamidi', NULL, true, 583616, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2433, NULL, 'LGD_V_583667', 'Sarigaguda', NULL, true, 583667, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2434, NULL, 'LGD_V_583781', 'Sariyapalle', NULL, true, 583781, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2435, NULL, 'LGD_V_583649', 'Sariyapalle', NULL, true, 583649, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2436, NULL, 'LGD_V_583804', 'Savidimamidi', NULL, true, 583804, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2437, NULL, 'LGD_V_583690', 'Seekari', NULL, true, 583690, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2438, NULL, 'LGD_V_583629', 'Seekariputtu', NULL, true, 583629, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2439, NULL, 'LGD_V_583763', 'Seemakonda', NULL, true, 583763, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2440, NULL, 'LGD_V_583644', 'Seethagunta', NULL, true, 583644, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2441, NULL, 'LGD_V_583624', 'Sindhiputtu', NULL, true, 583624, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2442, NULL, 'LGD_V_583752', 'Sirasapalle', NULL, true, 583752, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2443, NULL, 'LGD_V_583776', 'Sujjari', NULL, true, 583776, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2444, NULL, 'LGD_V_583672', 'Taggupadu', NULL, true, 583672, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2445, NULL, 'LGD_V_583803', 'Talabirada', NULL, true, 583803, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2446, NULL, 'LGD_V_583676', 'Tallabu', NULL, true, 583676, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2447, NULL, 'LGD_V_583725', 'Tamalabu', NULL, true, 583725, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2448, NULL, 'LGD_V_583660', 'Tamaraveedhi', NULL, true, 583660, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2449, NULL, 'LGD_V_583680', 'Tarabu', NULL, true, 583680, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2450, NULL, 'LGD_V_583739', 'Tarla Singi', NULL, true, 583739, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2451, NULL, 'LGD_V_583704', 'Thadivalasa', NULL, true, 583704, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2452, NULL, 'LGD_V_583633', 'Thamarada', NULL, true, 583633, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2453, NULL, 'LGD_V_583592', 'Thangulaputtu', NULL, true, 583592, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2454, NULL, 'LGD_V_583598', 'Thirangi', NULL, true, 583598, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2455, NULL, 'LGD_V_583609', 'Thogiriputtu @ Gadalaputtu', NULL, true, 583609, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2456, NULL, 'LGD_V_583630', 'Thorangulu', NULL, true, 583630, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2457, NULL, 'LGD_V_583661', 'Thotadaputtu', NULL, true, 583661, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2458, NULL, 'LGD_V_583700', 'Thotalagondi', NULL, true, 583700, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2459, NULL, 'LGD_V_583750', 'Thurakalavalasa', NULL, true, 583750, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2460, NULL, 'LGD_V_583834', 'Tulabharangi', NULL, true, 583834, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2462, NULL, 'LGD_V_583705', 'Ukkurba', NULL, true, 583705, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2463, NULL, 'LGD_V_583657', 'Vaddeputtu', NULL, true, 583657, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2464, NULL, 'LGD_V_583837', 'Vakapalle', NULL, true, 583837, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2465, NULL, 'LGD_V_583593', 'Vallangiputtu', NULL, true, 583593, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2466, NULL, 'LGD_V_583845', 'Valugupalle', NULL, true, 583845, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2467, NULL, 'LGD_V_583707', 'Vanabangi', NULL, true, 583707, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2468, NULL, 'LGD_V_583807', 'Vanabarangi', NULL, true, 583807, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2469, NULL, 'LGD_V_583800', 'Vanakothuru', NULL, true, 583800, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2470, NULL, 'LGD_V_583829', 'Vancharba', NULL, true, 583829, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2471, NULL, 'LGD_V_583715', 'Vancharba', NULL, true, 583715, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2472, NULL, 'LGD_V_583606', 'Vanchediputtu', NULL, true, 583606, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2473, NULL, 'LGD_V_583737', 'Vangarai', NULL, true, 583737, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2474, NULL, 'LGD_V_583745', 'Vannadi', NULL, true, 583745, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2475, NULL, 'LGD_V_583608', 'Varidaguda', NULL, true, 583608, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2476, NULL, 'LGD_V_583692', 'Vellapalem', NULL, true, 583692, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2477, NULL, 'LGD_V_583832', 'Vurada', NULL, true, 583832, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2478, NULL, 'LGD_V_930994', 'Vurraguruvu', 'ఉర్రగరువు', true, 930994, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2479, NULL, 'LGD_V_583622', 'Yeguvabondapalle', NULL, true, 583622, 'LGD', false, '2026-10-31 21:20:14.880761+05:30', 13, 11),
	(2480, NULL, 'LGD_V_585799', 'Amalapuram', NULL, true, 585799, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2481, NULL, 'LGD_V_585795', 'Balighattam', NULL, true, 585795, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2482, NULL, 'LGD_V_585793', 'Chettupalle', NULL, true, 585793, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2483, NULL, 'LGD_V_585796', 'Dharmasagaram', NULL, true, 585796, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2484, NULL, 'LGD_V_585797', 'Duggada', NULL, true, 585797, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2485, NULL, 'LGD_V_585791', 'Gabbada', NULL, true, 585791, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2486, NULL, 'LGD_V_585792', 'Guramdorapalem', NULL, true, 585792, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2487, NULL, 'LGD_V_585801', 'Narsipatnam (Ct)', NULL, true, 585801, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2488, NULL, 'LGD_V_585790', 'Neelampeta', NULL, true, 585790, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2489, NULL, 'LGD_V_585794', 'Ordinary Laxmipuram', NULL, true, 585794, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2490, NULL, 'LGD_V_585802', 'Peda Boddepalle (Ct)', NULL, true, 585802, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2491, NULL, 'LGD_V_585789', 'Veerabhupala Patnam', NULL, true, 585789, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2492, NULL, 'LGD_V_585798', 'Vemulapudi', NULL, true, 585798, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26),
	(2493, NULL, 'LGD_V_585800', 'Yerakannapalem', NULL, true, 585800, 'LGD', false, '2026-11-12 16:34:00.347983+05:30', 16, 26);


--
-- Data for Name: mst_facilities; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_facilities (id, district_id, facility_type, phc_id, hospital_id, code, name_en, name_te, is_active, category, mandal_id, village_id, address, pin_code, contact_phone, email, incharge_name, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES
	(2, 1, 'HOSPITAL', NULL, 1, 'FAC_AH_PADERU_DEMO', 'Area Hospital Paderu (demo)', NULL, true, 'AREA_HOSPITAL', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-31 21:58:31.084132+05:30', '2026-10-31 21:58:31.084132+05:30'),
	(3, 1, 'HOSPITAL', NULL, 2, 'FAC_RCC_DEMO', 'Regional Cancer Centre (demo)', NULL, true, 'MEDICAL_COLLEGE', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-31 21:58:31.084132+05:30', '2026-10-31 21:58:31.084132+05:30'),
	(4, 1, 'DISTRICT_OFFICE', NULL, NULL, 'FAC_DISTRICT_OFFICE', 'District office (demo)', NULL, true, 'DISTRICT_OFFICE', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-31 21:58:31.084132+05:30', '2026-10-31 21:58:31.084132+05:30'),
	(1, 1, 'PHC', 1, NULL, 'FAC_PHC_GM', 'PHC G. Madugula (demo)', NULL, true, 'PHC', 2, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-31 21:58:31.084132+05:30', '2026-10-31 21:58:31.084132+05:30'),
	(6, 1, 'PHC', 2, NULL, 'MC-ASR-02', 'medical centre', NULL, true, 'PHC', 1, 1996, NULL, NULL, NULL, NULL, NULL, '2026-11-12 16:40:53.460111+05:30', '2026-11-12 16:40:53.460111+05:30'),
	(7, 1, 'HOSPITAL', NULL, 3, 'CHC-ASR-03', 'CHC', NULL, true, 'CHC', 1, 1996, NULL, NULL, NULL, NULL, NULL, '2026-11-12 16:41:47.165054+05:30', '2026-11-12 16:41:47.165054+05:30'),
	(8, 1, 'PHC', 3, NULL, 'PHC-DG-1', 'PHC', 'TEJASWANI DHANASANI', true, 'PHC', 7, 761, 'dumbriguga', '531151', '8897744858', 'tejaswanidhanasani@gmail.com', 'Gowtham', '2026-11-13 12:08:02.895408+05:30', '2026-11-13 12:08:02.895408+05:30'),
	(9, 1, 'PHC', 4, NULL, 'PHC-PBL-', 'PHC', NULL, true, 'PHC', 11, 2262, NULL, '531040', '99477885871', 'gowtham@gmail.com', 'Jaya Vardhan', '2026-11-13 12:24:00.252733+05:30', '2026-11-13 12:24:00.252733+05:30'),
	(10, 1, 'HOSPITAL', NULL, 4, NULL, 'Clinic', NULL, true, 'AREA_HOSPITAL', 5, 354, NULL, NULL, NULL, NULL, NULL, '2026-11-13 15:57:12.355123+05:30', '2026-11-13 15:57:12.355123+05:30'),
	(11, 1, 'SUB_CENTRE', NULL, NULL, NULL, 'Clinic', NULL, true, 'SUB_CENTRE', 5, 328, NULL, NULL, NULL, NULL, NULL, '2026-11-13 15:57:56.205394+05:30', '2026-11-13 15:57:56.205394+05:30'),
	(12, 1, 'HOSPITAL', NULL, 5, NULL, 'Hospital', NULL, true, 'CHC', 5, 327, NULL, NULL, NULL, NULL, NULL, '2026-11-13 16:00:51.573372+05:30', '2026-11-13 16:00:51.573372+05:30'),
	(13, 1, 'HOSPITAL', NULL, 6, NULL, 'Area hospital', NULL, true, 'AREA_HOSPITAL', 5, 324, NULL, NULL, NULL, NULL, NULL, '2026-11-13 16:01:21.072182+05:30', '2026-11-13 16:01:21.072182+05:30');


--
-- Data for Name: mst_followup_statuses; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_followup_statuses (id, code, name_en, name_te, is_terminal, sort_order) OVERRIDING SYSTEM VALUE VALUES
	(1, 'OPEN', 'Open', 'తెరిచి ఉంది', false, 1),
	(2, 'IN_PROGRESS', 'In progress', 'పురోగతిలో ఉంది', false, 2),
	(3, 'ESCALATED', 'Escalated', 'ఉన్నత స్థాయికి పంపబడింది', false, 3),
	(4, 'CLOSED', 'Closed', 'ముగించబడింది', true, 4);


--
-- Data for Name: mst_investigation_statuses; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_investigation_statuses (id, code, name_en, name_te, is_terminal, sort_order) OVERRIDING SYSTEM VALUE VALUES
	(1, 'ADVISED', 'Advised', 'సూచించబడింది', false, 1),
	(2, 'SCHEDULED', 'Scheduled', 'షెడ్యూల్ చేయబడింది', false, 2),
	(3, 'SAMPLE_COLLECTED', 'Performed / sample collected', 'నమూనా సేకరించబడింది', false, 3),
	(4, 'REPORT_PENDING', 'Report pending', 'నివేదిక పెండింగ్‌లో ఉంది', false, 4),
	(5, 'REPORT_RECEIVED', 'Report received', 'నివేదిక అందింది', false, 5),
	(6, 'CLINICIAN_REVIEWED', 'Clinician reviewed', 'వైద్యుడు సమీక్షించారు', true, 6),
	(7, 'CANCELLED', 'Cancelled', 'రద్దు చేయబడింది', true, 7);


--
-- Data for Name: mst_languages; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_languages (id, code, name_en, native_name, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'en', 'English', 'English', true),
	(2, 'te', 'Telugu', 'తెలుగు', true);


--
-- Data for Name: mst_missed_reasons; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_missed_reasons (id, code, name_en, name_te, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'TRANSPORT', 'No transport / distance', 'రవాణా సమస్య', true),
	(2, 'TRAVEL_COST', 'Cost of travel', 'ప్రయాణ ఖర్చు', true),
	(3, 'WORK_FARMING', 'Work / farming', 'పని / వ్యవసాయ పనులు', true),
	(4, 'FORGOT', 'Forgot', 'మర్చిపోయారు', true),
	(5, 'FEAR', 'Fear / anxiety', 'భయం / ఆందోళన', true),
	(6, 'FAMILY', 'Family reason', 'కుటుంబ కారణాలు', true),
	(7, 'ROAD_WEATHER', 'Road / weather problem', 'రోడ్డు / వాతావరణ సమస్య', true),
	(8, 'HOSPITAL_RESCHEDULED', 'Hospital rescheduled', 'ఆసుపత్రి తేదీ మార్చింది', true),
	(9, 'UNREACHABLE', 'Could not be contacted', 'సంప్రదించలేకపోయాం', true),
	(10, 'OTHER', 'Other', 'ఇతర', true);


--
-- Data for Name: mst_notification_templates; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_notification_templates (id, code, language_id, channel, subject, body, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'MISSED_VISIT', 1, 'IN_APP', 'Missed visit', 'We missed you at your appointment. Please contact us to choose a new date.', true),
	(2, 'FOLLOWUP_REMINDER', 1, 'IN_APP', 'Follow-up reminder', 'Your follow-up visit is pending. Please contact your health worker.', true),
	(3, 'APPT_REMINDER', 1, 'IN_APP', 'Appointment reminder', 'Reminder: you have an upcoming appointment. Please contact your health worker for details.', true),
	(4, 'MISSED_VISIT', 2, 'IN_APP', 'హాజరు కాలేదు', 'మీరు అపాయింట్‌మెంట్‌కు రాలేకపోయారు. కొత్త తేదీ కోసం దయచేసి సంప్రదించండి.', true),
	(5, 'FOLLOWUP_REMINDER', 2, 'IN_APP', 'ఫాలో-అప్ రిమైండర్', 'మీ ఫాలో-అప్ సందర్శన పెండింగ్‌లో ఉంది. దయచేసి మీ ఆరోగ్య కార్యకర్తను సంప్రదించండి.', true),
	(6, 'APPT_REMINDER', 2, 'IN_APP', 'అపాయింట్‌మెంట్ రిమైండర్', 'గుర్తు చేస్తున్నాము: మీకు త్వరలో అపాయింట్‌మెంట్ ఉంది. వివరాల కోసం దయచేసి మీ ఆరోగ్య కార్యకర్తను సంప్రదించండి.', true),
	(7, 'CARE_CASE_CLOSED', 1, 'IN_APP', 'Case closed', 'A patient care case was closed after final review.', true),
	(8, 'CARE_FINAL_CHECKUP', 1, 'IN_APP', 'Final checkup pending', 'A patient is ready for Medical Officer final checkup.', true),
	(9, 'CARE_DISCOMFORT_ALERT', 1, 'IN_APP', 'Patient discomfort alert', 'A patient discomfort report needs attention.', true),
	(10, 'CARE_FOLLOWUP_SUBMITTED', 1, 'IN_APP', 'Follow-up report received', 'A Health Worker submitted a follow-up report.', true),
	(11, 'CARE_FOLLOWUP_ASSIGNED', 1, 'IN_APP', 'Follow-up assigned', 'A patient follow-up visit has been assigned to you.', true),
	(12, 'CARE_PLAN_READY', 1, 'IN_APP', 'Care plan ready', 'A treatment plan is ready for follow-up coordination.', true),
	(13, 'CARE_CASE_CLOSED', 2, 'IN_APP', 'కేసు మూసివేయబడింది', 'చివరి సమీక్ష తర్వాత రోగి సంరక్షణ కేసు మూసివేయబడింది.', true),
	(14, 'CARE_FINAL_CHECKUP', 2, 'IN_APP', 'చివరి పరీక్ష పెండింగ్', 'రోగి వైద్య అధికారి చివరి పరీక్షకు సిద్ధం.', true),
	(15, 'CARE_DISCOMFORT_ALERT', 2, 'IN_APP', 'రోగి అసౌకర్య హెచ్చరిక', 'రోగి అసౌకర్య నివేదికకు దృష్టి అవసరం.', true),
	(16, 'CARE_FOLLOWUP_SUBMITTED', 2, 'IN_APP', 'ఫాలో-అప్ నివేదిక వచ్చింది', 'ఆరోగ్య కార్యకర్త ఫాలో-అప్ నివేదిక సమర్పించారు.', true),
	(17, 'CARE_FOLLOWUP_ASSIGNED', 2, 'IN_APP', 'ఫాలో-అప్ కేటాయించబడింది', 'రోగి ఫాలో-అప్ సందర్శన మీకు కేటాయించబడింది.', true),
	(18, 'CARE_PLAN_READY', 2, 'IN_APP', 'చికిత్స ప్రణాళిక సిద్ధం', 'ఫాలో-అప్ సమన్వయం కోసం చికిత్స ప్రణాళిక సిద్ధంగా ఉంది.', true),
	(19, 'CARE_DURATION_DUE', 1, 'IN_APP', 'Treatment or revisit due', 'A patient treatment duration or hospital revisit date is due. Coordinate follow-up; do not close the case.', true),
	(20, 'DIAGNOSTIC_REPORT_UPLOADED', 1, 'IN_APP', 'Diagnostic report uploaded', 'A diagnostic report was uploaded and is ready for review.', true),
	(21, 'CARE_DURATION_DUE', 2, 'IN_APP', 'చికిత్స లేదా రీవిజిట్ గడువు', 'రోగి చికిత్స వ్యవధి లేదా ఆసుపత్రి రీవిజిట్ తేదీ వచ్చింది. ఫాలో-అప్ సమన్వయం చేయండి; కేసు మూసివేయవద్దు.', true),
	(22, 'DIAGNOSTIC_REPORT_UPLOADED', 2, 'IN_APP', 'డయాగ్నస్టిక్ నివేదిక అప్‌లోడ్ అయింది', 'డయాగ్నస్టిక్ నివేదిక అప్‌లోడ్ అయింది. సమీక్షకు సిద్ధం.', true),
	(23, 'CARE_REVISIT_MISSED', 1, 'IN_APP', 'Hospital revisit missed', 'A patient hospital revisit date passed without attendance. Coordinate a new revisit. Do not close the case.', true),
	(24, 'CARE_REVISIT_MISSED', 2, 'IN_APP', 'ఆసుపత్రి రీవిజిట్ మిస్ అయింది', 'రోగి ఆసుపత్రి రీవిజిట్ తేదీ హాజరు లేకుండా గడిచింది. కొత్త రీవిజిట్ సమన్వయం చేయండి. కేసు మూసివేయవద్దు.', true),
	(25, 'CARE_RETURN_AUTHORIZED', 1, 'IN_APP', 'Return to MO authorized', 'Specialist authorized return to Medical Officer community care. Confirm only after Specialist care is no longer active.', true),
	(26, 'CARE_RETURN_AUTHORIZED', 2, 'IN_APP', 'MO కు తిరిగి రాక అనుమతి', 'స్పెషలిస్ట్ వైద్య అధికారి కమ్యూనిటీ సంరక్షణకు తిరిగి రాకను అనుమతించారు. స్పెషలిస్ట్ సంరక్షణ క్రియాశీలంగా లేనప్పుడు మాత్రమే నిర్ధారించండి.', true),
	(41, 'DIAGNOSTIC_FOLLOWUP_DONE', 1, 'IN_APP', 'Diagnostic patient follow-up recorded', 'Health Worker recorded patient acknowledgement of Specialist advice.', true),
	(42, 'DIAGNOSTIC_ADVICE_TO_HW', 1, 'IN_APP', 'Specialist advice for patient follow-up', 'Navigator forwarded signed Specialist advice for patient communication.', true),
	(43, 'DIAGNOSTIC_ADVICE_SIGNED', 1, 'IN_APP', 'Specialist diagnostic advice signed', 'Specialist signed diagnostic advice. Forward instructions to the Health Worker.', true),
	(44, 'DIAGNOSTIC_ROUTED_SPECIALIST', 1, 'IN_APP', 'Diagnostic report awaiting your review', 'Hospital Staff routed a diagnostic report for your clinical review.', true),
	(45, 'DIAGNOSTIC_FORWARDED_HS', 1, 'IN_APP', 'Diagnostic report for Hospital Staff', 'Navigator forwarded a verified diagnostic report for Specialist routing.', true),
	(46, 'DIAGNOSTIC_RETURNED', 1, 'IN_APP', 'Diagnostic submission returned', 'Navigator returned a diagnostic submission for correction.', true),
	(47, 'DIAGNOSTIC_NAV_ASSIGN_HW', 1, 'IN_APP', 'Diagnostic collection assigned', 'Navigator assigned a diagnostic collection task to you.', true),
	(48, 'DIAGNOSTIC_FOLLOWUP_DONE', 2, 'IN_APP', 'డయాగ్నస్టిక్ రోగి ఫాలో-అప్ నమోదు', 'ఆరోగ్య కార్యకర్త స్పెషలిస్ట్ సలహా రోగి అంగీకారాన్ని నమోదు చేశారు.', true),
	(49, 'DIAGNOSTIC_ADVICE_TO_HW', 2, 'IN_APP', 'రోగి ఫాలో-అప్ కోసం స్పెషలిస్ట్ సలహా', 'నావిగేటర్ సంతకం చేసిన స్పెషలిస్ట్ సలహాను రోగి సంప్రదింపు కోసం పంపారు.', true),
	(50, 'DIAGNOSTIC_ADVICE_SIGNED', 2, 'IN_APP', 'స్పెషలిస్ట్ సలహా సంతకం అయింది', 'స్పెషలిస్ట్ డయాగ్నస్టిక్ సలహాపై సంతకం చేశారు. ఆరోగ్య కార్యకర్తకు సూచనలు పంపండి.', true),
	(51, 'DIAGNOSTIC_ROUTED_SPECIALIST', 2, 'IN_APP', 'మీ సమీక్ష కోసం డయాగ్నస్టిక్ నివేదిక', 'ఆసుపత్రి సిబ్బంది డయాగ్నస్టిక్ నివేదికను మీ వైద్య సమీక్షకు పంపారు.', true),
	(52, 'DIAGNOSTIC_FORWARDED_HS', 2, 'IN_APP', 'ఆసుపత్రి సిబ్బందికి డయాగ్నస్టిక్ నివేదిక', 'నావిగేటర్ ధృవీకరించిన డయాగ్నస్టిక్ నివేదికను స్పెషలిస్ట్ మార్గానికి పంపారు.', true),
	(53, 'DIAGNOSTIC_RETURNED', 2, 'IN_APP', 'డయాగ్నస్టిక్ సమర్పణ తిరిగి పంపబడింది', 'నావిగేటర్ డయాగ్నస్టిక్ సమర్పణను సరిదిద్దడానికి తిరిగి పంపారు.', true),
	(54, 'DIAGNOSTIC_NAV_ASSIGN_HW', 2, 'IN_APP', 'డయాగ్నస్టిక్ సేకరణ కేటాయించబడింది', 'నావిగేటర్ మీకు డయాగ్నస్టిక్ సేకరణ పని కేటాయించారు.', true),
	(55, 'DIAGNOSTIC_CASE_CLOSED', 1, 'IN_APP', 'Diagnostic follow-up case closed', 'Specialist closed the diagnostic follow-up case. No further follow-up is required.', true),
	(56, 'DIAGNOSTIC_FOLLOWUP_OVERDUE', 1, 'IN_APP', 'Patient follow-up overdue', 'A Specialist-defined patient follow-up is overdue. Contact the patient and submit the report.', true),
	(57, 'DIAGNOSTIC_FOLLOWUP_DUE', 1, 'IN_APP', 'Patient follow-up due', 'A Specialist-defined patient follow-up is due.', true),
	(58, 'DIAGNOSTIC_REASSESSMENT_ADVICE', 1, 'IN_APP', 'Updated Specialist advice after reassessment', 'Specialist signed updated advice after reassessment. Forward to Health Worker.', true),
	(59, 'DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST', 1, 'IN_APP', 'Follow-up ready for reassessment', 'Navigator forwarded a verified patient follow-up for Specialist reassessment.', true),
	(60, 'DIAGNOSTIC_FOLLOWUP_RETURNED', 1, 'IN_APP', 'Follow-up report returned', 'Navigator returned a patient follow-up report for correction.', true),
	(61, 'DIAGNOSTIC_CASE_CLOSED', 2, 'IN_APP', 'డయాగ్నస్టిక్ ఫాలో-అప్ కేసు మూసివేయబడింది', 'స్పెషలిస్ట్ డయాగ్నస్టిక్ ఫాలో-అప్ కేసును మూసివేశారు. మరిన్ని ఫాలో-అప్‌లు అవసరం లేదు.', true),
	(62, 'DIAGNOSTIC_FOLLOWUP_OVERDUE', 2, 'IN_APP', 'రోగి ఫాలో-అప్ గడువు దాటింది', 'స్పెషలిస్ట్ నిర్ణయించిన రోగి ఫాలో-అప్ గడువు దాటింది. రోగిని సంప్రదించి నివేదిక సమర్పించండి.', true),
	(63, 'DIAGNOSTIC_FOLLOWUP_DUE', 2, 'IN_APP', 'రోగి ఫాలో-అప్ గడువు', 'స్పెషలిస్ట్ నిర్ణయించిన రోగి ఫాలో-అప్ గడువు వచ్చింది.', true),
	(64, 'DIAGNOSTIC_REASSESSMENT_ADVICE', 2, 'IN_APP', 'పునఃసమీక్ష తర్వాత నవీకరించిన సలహా', 'స్పెషలిస్ట్ పునఃసమీక్ష తర్వాత నవీకరించిన సలహాపై సంతకం చేశారు. ఆరోగ్య కార్యకర్తకు పంపండి.', true),
	(65, 'DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST', 2, 'IN_APP', 'పునఃసమీక్ష కోసం ఫాలో-అప్', 'నావిగేటర్ ధృవీకరించిన రోగి ఫాలో-అప్‌ను స్పెషలిస్ట్ పునఃసమీక్షకు పంపారు.', true),
	(66, 'DIAGNOSTIC_FOLLOWUP_RETURNED', 2, 'IN_APP', 'ఫాలో-అప్ నివేదిక తిరిగి పంపబడింది', 'నావిగేటర్ రోగి ఫాలో-అప్ నివేదికను సరిదిద్దడానికి తిరిగి పంపారు.', true);


--
-- Data for Name: mst_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_permissions (id, code, resource, action, description, created_at) OVERRIDING SYSTEM VALUE VALUES
	(1, 'patient.register', 'patient', 'create', 'Register synthetic patient', '2026-10-31 17:01:20.369913+05:30'),
	(2, 'patient.read_assigned', 'patient', 'read', 'Read patients within a care relationship', '2026-10-31 17:01:20.369913+05:30'),
	(3, 'consent.record', 'consent', 'create', 'Record purpose-specific consent', '2026-10-31 17:01:20.369913+05:30'),
	(4, 'screening.create', 'screening', 'create', 'Create screening and history', '2026-10-31 17:01:20.369913+05:30'),
	(5, 'image.upload', 'image', 'create', 'Upload oral photo for assigned screening', '2026-10-31 17:01:20.369913+05:30'),
	(6, 'image.view', 'image', 'read', 'View image via short-lived signed access (audited)', '2026-10-31 17:01:20.369913+05:30'),
	(7, 'ai.analyze', 'ai', 'create', 'Queue non-clinical AI analysis', '2026-10-31 17:01:20.369913+05:30'),
	(8, 'review.create', 'review', 'create', 'Save clinician observations', '2026-10-31 17:01:20.369913+05:30'),
	(9, 'review.sign', 'review', 'sign', 'Sign clinical review', '2026-10-31 17:01:20.369913+05:30'),
	(10, 'referral.create', 'referral', 'create', 'Create specialist referral', '2026-10-31 17:01:20.369913+05:30'),
	(11, 'referral.view', 'referral', 'read', 'View referrals in care relationship', '2026-10-31 17:01:20.369913+05:30'),
	(12, 'appointment.book', 'appointment', 'create', 'Book or request appointment', '2026-10-31 17:01:20.369913+05:30'),
	(13, 'appointment.confirm', 'appointment', 'confirm', 'Confirm / reschedule hospital appointment, record attendance', '2026-10-31 17:01:20.369913+05:30'),
	(14, 'appointment.view', 'appointment', 'read', 'View appointments', '2026-10-31 17:01:20.369913+05:30'),
	(15, 'video.join', 'video', 'join', 'Join authorised video consultation', '2026-10-31 17:01:20.369913+05:30'),
	(16, 'consultation.note', 'consultation', 'create', 'Record consultation notes and outcome', '2026-10-31 17:01:20.369913+05:30'),
	(17, 'investigation.record', 'investigation', 'create', 'Order / track biopsy and investigations', '2026-10-31 17:01:20.369913+05:30'),
	(18, 'pathology.review', 'pathology', 'review', 'Enter diagnosis on a pathology report', '2026-10-31 17:01:20.369913+05:30'),
	(19, 'classification.set', 'classification', 'create', 'Set clinician classification', '2026-10-31 17:01:20.369913+05:30'),
	(20, 'treatment.link', 'treatment', 'create', 'Create treatment linkage', '2026-10-31 17:01:20.369913+05:30'),
	(21, 'treatment.track', 'treatment', 'update', 'Track treatment initiation', '2026-10-31 17:01:20.369913+05:30'),
	(22, 'navigation.update', 'navigation', 'update', 'Track contact and attendance', '2026-10-31 17:01:20.369913+05:30'),
	(23, 'case.assign', 'case', 'assign', 'Assign care team / navigator', '2026-10-31 17:01:20.369913+05:30'),
	(24, 'dashboard.view_aggregate', 'dashboard', 'read', 'View aggregate reporting', '2026-10-31 17:01:20.369913+05:30'),
	(25, 'export.aggregate', 'export', 'create', 'Export aggregate report', '2026-10-31 17:01:20.369913+05:30'),
	(26, 'user.manage', 'user', 'manage', 'Manage users and assignments', '2026-10-31 17:01:20.369913+05:30'),
	(27, 'registration.review', 'registration', 'review', 'Approve / reject health worker registration requests', '2026-10-31 17:01:20.369913+05:30'),
	(28, 'audit.view', 'audit', 'read', 'View audit trail', '2026-10-31 17:01:20.369913+05:30'),
	(29, 'master.view', 'master', 'read', 'View master data (geography and facilities)', '2026-10-31 18:14:10.324168+05:30'),
	(30, 'master.manage', 'master', 'manage', 'Create, update and deactivate master data', '2026-10-31 18:14:10.324168+05:30'),
	(31, 'user.create_staff', 'user', 'create', 'Create Medical Officer, Specialist, Navigator, Hospital Staff and District Admin accounts', '2026-10-31 18:14:10.324168+05:30'),
	(32, 'user.create_admin', 'user', 'create', 'Create System Administrator accounts', '2026-10-31 18:14:10.324168+05:30'),
	(33, 'registration.verify', 'registration', 'verify', 'Verify health worker registrations for own facility', '2026-10-31 18:14:10.324168+05:30'),
	(34, 'settings.manage', 'settings', 'manage', 'Manage platform settings', '2026-10-31 18:14:10.324168+05:30'),
	(35, 'master.import', 'master', 'import', 'Import location master data from LGD and add locations manually', '2026-10-31 20:58:54.038049+05:30'),
	(36, 'role.manage', 'role', 'manage', 'Create and manage custom roles and permissions', '2026-11-03 12:11:43.112455+05:30'),
	(37, 'district_admin.manage', 'district_admin', 'manage', 'Create and map District Admin accounts', '2026-11-03 12:11:43.112455+05:30'),
	(38, 'registration.monitor', 'registration', 'read', 'Monitor Health Worker registration requests without approving or rejecting them', '2026-11-03 17:57:01.917852+05:30'),
	(39, 'registration.recommend', 'registration', 'recommend', 'Recommend a Health Worker registration in an assigned Mandal', '2026-11-07 16:45:27.233725+05:30'),
	(40, 'registration.finalize', 'registration', 'finalize', 'Make a final Health Worker registration decision within the assigned district', '2026-11-07 16:45:27.233725+05:30'),
	(41, 'appointment.slot_manage', 'appointment_slot', 'manage', 'Create, view, and cancel own Specialist consultation availability slots', '2026-11-10 06:21:11.333947+05:30'),
	(42, 'care.discomfort_report', 'care', 'escalate', 'Report patient discomfort during treatment', '2026-11-11 17:40:40.190042+05:30'),
	(43, 'care.final_review', 'care', 'review', 'Perform Medical Officer final checkup', '2026-11-11 17:40:40.190042+05:30'),
	(44, 'care.close', 'care', 'close', 'Close a care plan after recovery confirmation', '2026-11-11 17:40:40.190042+05:30'),
	(45, 'care.followup_assign', 'care', 'assign', 'Assign Health Worker field follow-ups', '2026-11-11 17:40:40.190042+05:30'),
	(46, 'care.plan_manage', 'care', 'manage', 'Create and update community care treatment plans', '2026-11-11 17:40:40.190042+05:30'),
	(47, 'care.followup_report', 'care', 'report', 'Submit Health Worker follow-up reports', '2026-11-11 17:40:40.190042+05:30'),
	(48, 'diagnostic.view', 'diagnostic', 'view', 'View diagnostic orders for assigned patients', '2026-11-11 22:10:42.069943+05:30'),
	(49, 'diagnostic.schedule', 'diagnostic', 'schedule', 'Request diagnostic appointment scheduling', '2026-11-11 22:22:30.154835+05:30'),
	(50, 'diagnostic.confirm', 'diagnostic', 'confirm', 'Confirm, reschedule or cancel diagnostic appointments', '2026-11-11 22:22:30.154835+05:30'),
	(51, 'diagnostic.followup', 'diagnostic', 'followup', 'Record patient contact and attendance for diagnostics', '2026-11-11 22:22:30.154835+05:30'),
	(52, 'diagnostic.report_upload', 'diagnostic', 'upload', 'Upload diagnostic order reports (PDF/JPG/PNG)', '2026-11-12 03:32:46.290039+05:30'),
	(53, 'diagnostic.report_review', 'diagnostic', 'review', 'Review uploaded diagnostic order reports', '2026-11-12 03:32:46.290039+05:30'),
	(54, 'page.healthWorkerAppointments', 'page', 'access', 'Open health worker appointments', '2026-11-12 05:04:35.351475+05:30'),
	(55, 'page.navVideo', 'page', 'access', 'Open navigator video module', '2026-11-12 05:04:35.351475+05:30'),
	(56, 'page.districtSpecialists', 'page', 'access', 'Open district specialists staff page', '2026-11-12 05:04:35.351475+05:30'),
	(57, 'page.moClinicalNotes', 'page', 'access', 'Open medical officer clinical notes', '2026-11-12 05:04:35.351475+05:30'),
	(58, 'page.moFollowUp', 'page', 'access', 'Open medical officer follow-ups', '2026-11-12 05:04:35.351475+05:30'),
	(59, 'page.districtNavigators', 'page', 'access', 'Open district navigators staff page', '2026-11-12 05:04:35.351475+05:30'),
	(60, 'page.appointments', 'page', 'access', 'Open hospital staff appointments', '2026-11-12 05:04:35.351475+05:30'),
	(61, 'page.registrations', 'page', 'access', 'Open registrations module (placeholder)', '2026-11-12 05:04:35.351475+05:30'),
	(62, 'page.navAppointments', 'page', 'access', 'Open navigator appointments', '2026-11-12 05:04:35.351475+05:30'),
	(63, 'page.spFollowUps', 'page', 'access', 'Open specialist care / follow-ups', '2026-11-12 05:04:35.351475+05:30'),
	(64, 'page.districtFacilities', 'page', 'access', 'Open district facilities view', '2026-11-12 05:04:35.351475+05:30'),
	(65, 'page.registrationMonitoring', 'page', 'access', 'Open registration monitoring', '2026-11-12 05:04:35.351475+05:30'),
	(66, 'page.districtHealthWorkers', 'page', 'access', 'Open district health workers', '2026-11-12 05:04:35.351475+05:30'),
	(67, 'page.navDiagnostics', 'page', 'access', 'Open navigator diagnostics', '2026-11-12 05:04:35.351475+05:30'),
	(68, 'page.moProfile', 'page', 'access', 'Open medical officer profile', '2026-11-12 05:04:35.351475+05:30'),
	(69, 'page.navReferrals', 'page', 'access', 'Open navigator referrals', '2026-11-12 05:04:35.351475+05:30'),
	(70, 'page.districtPatients', 'page', 'access', 'Open district patients', '2026-11-12 05:04:35.351475+05:30'),
	(71, 'page.staffManagement', 'page', 'access', 'Open staff management', '2026-11-12 05:04:35.351475+05:30'),
	(72, 'page.hsDiagnostics', 'page', 'access', 'Open hospital staff diagnostics', '2026-11-12 05:04:35.351475+05:30'),
	(73, 'page.spVideo', 'page', 'access', 'Open specialist video module', '2026-11-12 05:04:35.351475+05:30'),
	(74, 'page.districtProgramme', 'page', 'access', 'Open district programme dashboard', '2026-11-12 05:04:35.351475+05:30'),
	(75, 'page.moReferrals', 'page', 'access', 'Open medical officer referrals', '2026-11-12 05:04:35.351475+05:30'),
	(76, 'page.districtTracking', 'page', 'access', 'Open district patient tracking', '2026-11-12 05:04:35.351475+05:30'),
	(77, 'page.attendance', 'page', 'access', 'Open hospital staff attendance', '2026-11-12 05:04:35.351475+05:30'),
	(78, 'page.spDiagnostics', 'page', 'access', 'Open specialist diagnostics', '2026-11-12 05:04:35.351475+05:30'),
	(79, 'page.spTracking', 'page', 'access', 'Open specialist tracking', '2026-11-12 05:04:35.351475+05:30'),
	(80, 'page.adminAccounts', 'page', 'access', 'Open admin accounts module (placeholder)', '2026-11-12 05:04:35.351475+05:30'),
	(81, 'page.masterData', 'page', 'access', 'Open master data module (placeholder)', '2026-11-12 05:04:35.351475+05:30'),
	(82, 'page.districtRegistrations', 'page', 'access', 'Open district registration approvals', '2026-11-12 05:04:35.351475+05:30'),
	(83, 'page.facilities', 'page', 'access', 'Open facility list and details', '2026-11-12 05:04:35.351475+05:30'),
	(84, 'page.settings', 'page', 'access', 'Open account/settings navigation', '2026-11-12 05:04:35.351475+05:30'),
	(85, 'page.moTracking', 'page', 'access', 'Open medical officer tracking', '2026-11-12 05:04:35.351475+05:30'),
	(86, 'page.districtLocations', 'page', 'access', 'Open district locations', '2026-11-12 05:04:35.351475+05:30'),
	(87, 'page.spNotes', 'page', 'access', 'Open specialist notes', '2026-11-12 05:04:35.351475+05:30'),
	(88, 'page.followUp', 'page', 'access', 'Open health worker care follow-ups', '2026-11-12 05:04:35.351475+05:30'),
	(89, 'page.healthWorkerTracking', 'page', 'access', 'Open health worker patient tracking', '2026-11-12 05:04:35.351475+05:30'),
	(90, 'page.userManagement', 'page', 'access', 'Open user management module (placeholder)', '2026-11-12 05:04:35.351475+05:30'),
	(91, 'page.navPatients', 'page', 'access', 'Open navigator patients', '2026-11-12 05:04:35.351475+05:30'),
	(92, 'page.navTracking', 'page', 'access', 'Open navigator tracking', '2026-11-12 05:04:35.351475+05:30'),
	(93, 'page.navFollowUps', 'page', 'access', 'Open navigator follow-ups', '2026-11-12 05:04:35.351475+05:30'),
	(94, 'page.moRegistrations', 'page', 'access', 'Open medical officer registrations', '2026-11-12 05:04:35.351475+05:30'),
	(95, 'page.moMandalPatients', 'page', 'access', 'Open medical officer mandal patients', '2026-11-12 05:04:35.351475+05:30'),
	(96, 'page.districtAuditLogs', 'page', 'access', 'Open district audit logs', '2026-11-12 05:04:35.351475+05:30'),
	(97, 'page.spReferrals', 'page', 'access', 'Open specialist referrals', '2026-11-12 05:04:35.351475+05:30'),
	(98, 'page.moReports', 'page', 'access', 'Open medical officer reports', '2026-11-12 05:04:35.351475+05:30'),
	(99, 'page.screening', 'page', 'access', 'Open health worker screening', '2026-11-12 05:04:35.351475+05:30'),
	(100, 'page.diagnosticTestMaster', 'page', 'access', 'Open diagnostic test master', '2026-11-12 05:04:35.351475+05:30');
INSERT INTO public.mst_permissions (id, code, resource, action, description, created_at) OVERRIDING SYSTEM VALUE VALUES
	(101, 'page.districtHospitalStaff', 'page', 'access', 'Open district hospital staff page', '2026-11-12 05:04:35.351475+05:30'),
	(102, 'page.districtReports', 'page', 'access', 'Open district reports module (placeholder)', '2026-11-12 05:04:35.351475+05:30'),
	(103, 'page.healthWorkerPatients', 'page', 'access', 'Open health worker patient registration', '2026-11-12 05:04:35.351475+05:30'),
	(104, 'page.locationImport', 'page', 'access', 'Open location master import', '2026-11-12 05:04:35.351475+05:30'),
	(105, 'page.moDiagnostics', 'page', 'access', 'Open medical officer diagnostics', '2026-11-12 05:04:35.351475+05:30'),
	(106, 'page.healthWorkerPatientSearch', 'page', 'access', 'Open health worker patient search', '2026-11-12 05:04:35.351475+05:30'),
	(107, 'page.auditLogs', 'page', 'access', 'Open platform audit logs', '2026-11-12 05:04:35.351475+05:30'),
	(108, 'page.healthWorkerAssignments', 'page', 'access', 'Open health worker assignments', '2026-11-12 05:04:35.351475+05:30'),
	(109, 'page.roleManagement', 'page', 'access', 'Open role management', '2026-11-12 05:04:35.351475+05:30'),
	(110, 'page.districtMedicalOfficers', 'page', 'access', 'Open district medical officers staff page', '2026-11-12 05:04:35.351475+05:30'),
	(111, 'page.reports', 'page', 'access', 'Open platform reports', '2026-11-12 05:04:35.351475+05:30'),
	(112, 'page.moClinicalReview', 'page', 'access', 'Open medical officer clinical review', '2026-11-12 05:04:35.351475+05:30'),
	(113, 'page.districtAdmins', 'page', 'access', 'Open district admin management', '2026-11-12 05:04:35.351475+05:30'),
	(114, 'page.healthWorkerDiagnostics', 'page', 'access', 'Open health worker diagnostics', '2026-11-12 05:04:35.351475+05:30'),
	(115, 'page.moScreeningQueue', 'page', 'access', 'Open medical officer screening queue', '2026-11-12 05:04:35.351475+05:30'),
	(116, 'page.hsTracking', 'page', 'access', 'Open hospital staff tracking', '2026-11-12 05:04:35.351475+05:30'),
	(117, 'page.spConsultations', 'page', 'access', 'Open specialist consultations', '2026-11-12 05:04:35.351475+05:30'),
	(118, 'page.moCareLifecycle', 'page', 'access', 'Open medical officer care lifecycle', '2026-11-12 05:04:35.351475+05:30'),
	(119, 'page.moImageReview', 'page', 'access', 'Open medical officer image review', '2026-11-12 05:04:35.351475+05:30'),
	(120, 'diagnostic.advice_forward', 'diagnostic', 'forward_advice', 'Navigator forwards signed advice to Health Worker', '2026-11-13 12:38:39.153489+05:30'),
	(121, 'diagnostic.patient_followup', 'diagnostic', 'patient_followup', 'Health Worker records patient follow-up on signed advice', '2026-11-13 12:38:39.153489+05:30'),
	(122, 'diagnostic.verify', 'diagnostic', 'verify', 'Navigator verifies uploaded diagnostic reports', '2026-11-13 12:38:39.153489+05:30'),
	(123, 'diagnostic.forward_hs', 'diagnostic', 'forward', 'Navigator forwards verified reports to Hospital Staff', '2026-11-13 12:38:39.153489+05:30'),
	(124, 'diagnostic.route_specialist', 'diagnostic', 'route', 'Hospital Staff routes reports to authorized Specialist', '2026-11-13 12:38:39.153489+05:30'),
	(125, 'diagnostic.assign_hw', 'diagnostic', 'assign', 'Navigator assigns diagnostic collection to Health Worker', '2026-11-13 12:38:39.153489+05:30'),
	(126, 'diagnostic.advice_sign', 'diagnostic', 'advice', 'Specialist signs diagnostic treatment advice', '2026-11-13 12:38:39.153489+05:30'),
	(127, 'page.districtCustomAccounts', 'page', 'access', 'Open district custom-role account provisioning', '2026-11-13 18:38:38.843692+05:30'),
	(128, 'diagnostic.followup_verify', 'diagnostic', 'followup_verify', 'Navigator verifies or returns Health Worker follow-up reports', '2026-11-13 19:14:54.215913+05:30'),
	(129, 'diagnostic.case_close', 'diagnostic', 'case_close', 'Specialist closes diagnostic follow-up case with documented reason', '2026-11-13 19:14:54.215913+05:30'),
	(130, 'diagnostic.reassess', 'diagnostic', 'reassess', 'Specialist reassesses after follow-up and continues or updates advice', '2026-11-13 19:14:54.215913+05:30');


--
-- Data for Name: mst_protocol_rules; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_protocol_rules (id, code, rule_type, applies_to, offset_minutes, template_code, escalation_level, is_placeholder, is_active, notes) OVERRIDING SYSTEM VALUE VALUES
	(1, 'APPT_REMINDER_24H', 'REMINDER', 'HOSPITAL_APPOINTMENT', -1440, 'APPT_REMINDER', NULL, true, true, 'Placeholder'),
	(2, 'APPT_REMINDER_2H', 'REMINDER', 'HOSPITAL_APPOINTMENT', -120, 'APPT_REMINDER', NULL, true, true, 'Placeholder'),
	(3, 'VIDEO_REMINDER_1H', 'REMINDER', 'VIDEO_CONSULTATION', -60, 'APPT_REMINDER', NULL, true, true, 'Placeholder'),
	(4, 'MISSED_APPT_TASK', 'FOLLOWUP_TASK', 'HOSPITAL_APPOINTMENT', 60, 'MISSED_VISIT', NULL, true, true, 'Create navigator task after missed appointment'),
	(5, 'REFERRAL_OVERDUE_L1', 'OVERDUE_ESCALATION', 'REFERRAL', 4320, 'FOLLOWUP_REMINDER', 1, true, true, 'Placeholder'),
	(6, 'REFERRAL_OVERDUE_L2', 'OVERDUE_ESCALATION', 'REFERRAL', 10080, 'FOLLOWUP_REMINDER', 2, true, true, 'Placeholder');


--
-- Data for Name: mst_referral_priorities; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_referral_priorities (id, code, name_en, name_te, priority_rank, target_days, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'URGENT', 'Urgent', 'అత్యవసరం', 1, NULL, true),
	(2, 'SOON', 'Soon', 'త్వరగా', 2, NULL, true),
	(3, 'ROUTINE', 'Routine', 'సాధారణం', 3, NULL, true);


--
-- Data for Name: mst_roles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_roles (id, code, name_en, name_te, description, mfa_required, is_active, created_at, is_system_role) OVERRIDING SYSTEM VALUE VALUES
	(1, 'HEALTH_WORKER', 'Village health worker', 'గ్రామ ఆరోగ్య కార్యకర్త', 'Registers patients, screening intake, image capture, assigned follow-up', false, true, '2026-10-31 17:01:20.369913+05:30', true),
	(2, 'MEDICAL_OFFICER', 'Medical Officer', 'వైద్యాధికారి', 'Reviews findings independently of AI, signs review, decides referral', true, true, '2026-10-31 17:01:20.369913+05:30', true),
	(3, 'SPECIALIST', 'Specialist', 'నిపుణ వైద్యుడు', 'Sees referred cases, consultations, investigations', true, true, '2026-10-31 17:01:20.369913+05:30', true),
	(4, 'NAVIGATOR', 'Patient navigator', 'రోగి మార్గదర్శకుడు', 'Appointments, contacts, transport, missed-visit workflow', false, true, '2026-10-31 17:01:20.369913+05:30', true),
	(5, 'HOSPITAL_STAFF', 'Hospital staff', 'ఆసుపత్రి సిబ్బంది', 'Confirms / reschedules hospital appointments, records attendance', false, true, '2026-10-31 17:01:20.369913+05:30', true),
	(6, 'DISTRICT_ADMIN', 'District administrator', 'జిల్లా నిర్వాహకుడు', 'Aggregated programme indicators only; no default access to identifiable records', true, true, '2026-10-31 17:01:20.369913+05:30', true),
	(7, 'SYSTEM_ADMIN', 'System administrator', 'సిస్టమ్ నిర్వాహకుడు', 'User management and audit review; no clinical record access', true, false, '2026-10-31 17:01:20.369913+05:30', true),
	(8, 'SUPER_ADMIN', 'Super administrator', 'సూపర్ నిర్వాహకుడు', 'Manages system administrators, master data and platform settings; no clinical record access', true, true, '2026-10-31 18:14:10.324168+05:30', true),
	(9, 'AO_123', 'AO', NULL, 'HELLO', false, false, '2026-11-06 14:37:12.488718+05:30', false),
	(10, 'PO_123', 'PO', 'PO', 'PO SIR', false, true, '2026-11-13 08:46:22.236002+05:30', false);


--
-- Data for Name: mst_screening_sites; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: mst_specialties; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_specialties (id, code, name_en, name_te, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'ORAL_MEDICINE', 'Oral medicine', 'ఓరల్ మెడిసిన్', true),
	(2, 'ORAL_SURGERY', 'Oral & maxillofacial surgery', 'నోరు మరియు దవడ శస్త్రచికిత్స', true),
	(3, 'ENT', 'ENT', 'చెవి ముక్కు గొంతు (ENT)', true),
	(4, 'ONCOLOGY', 'Oncology', 'ఆంకాలజీ', true),
	(5, 'PATHOLOGY', 'Pathology', 'పాథాలజీ', true);


--
-- Data for Name: mst_symptoms; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_symptoms (id, code, name_en, name_te, is_active) OVERRIDING SYSTEM VALUE VALUES
	(1, 'MOUTH_ULCER', 'Non-healing mouth ulcer', 'మానని నోటి పుండు', true),
	(2, 'WHITE_PATCH', 'White patch', 'తెల్లని మచ్చ', true),
	(3, 'RED_PATCH', 'Red patch', 'ఎర్రని మచ్చ', true),
	(4, 'PAIN', 'Pain in mouth', 'నోటిలో నొప్పి', true),
	(5, 'DIFFICULTY_SWALLOWING', 'Difficulty swallowing', 'మింగడంలో ఇబ్బంది', true),
	(6, 'LIMITED_MOUTH_OPENING', 'Limited mouth opening', 'నోరు తెరవడంలో ఇబ్బంది', true),
	(7, 'BLEEDING', 'Bleeding', 'రక్తస్రావం', true),
	(8, 'VISIBLE_GROWTH', 'Visible growth / lump', 'నోటిలో గడ్డ', true),
	(9, 'NECK_SWELLING', 'Neck swelling', 'మెడలో వాపు', true);


--
-- Data for Name: mst_ui_translations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.mst_ui_translations (id, msg_key, language_id, msg_text, module, needs_review) OVERRIDING SYSTEM VALUE VALUES
	(1, 'image.recapture', 1, 'Image is not clear. Please retake.', 'screening', true),
	(2, 'error.access_denied', 1, 'You do not have access to this record', 'error', true),
	(3, 'error.consent_required', 1, 'Consent is required first', 'error', true),
	(4, 'error.required', 1, 'This field is required', 'error', true),
	(5, 'error.network', 1, 'Network error. Please try again.', 'error', true),
	(6, 'ai.image_insufficient', 1, 'Image insufficient', 'ai', true),
	(7, 'ai.not_for_clinical_use', 1, 'NOT FOR CLINICAL USE', 'ai', true),
	(8, 'sync.confirmed', 1, 'Synced', 'sync', true),
	(9, 'sync.pending', 1, 'Waiting to sync', 'sync', true),
	(10, 'login.title', 1, 'Login', 'auth', true),
	(11, 'common.retake', 1, 'Retake photo', 'screening', true),
	(12, 'common.next', 1, 'Next', 'common', true),
	(13, 'common.cancel', 1, 'Cancel', 'common', true),
	(14, 'common.save', 1, 'Save', 'common', true),
	(15, 'app.title', 1, 'Aarogya Drishti', 'common', true),
	(16, 'image.recapture', 2, 'చిత్రం స్పష్టంగా లేదు. దయచేసి మళ్లీ తీయండి.', 'screening', true),
	(17, 'error.access_denied', 2, 'ఈ రికార్డును చూడటానికి మీకు అనుమతి లేదు', 'error', true),
	(18, 'error.consent_required', 2, 'ముందుగా సమ్మతి అవసరం', 'error', true),
	(19, 'error.required', 2, 'ఈ వివరం అవసరం', 'error', true),
	(20, 'error.network', 2, 'నెట్‌వర్క్ లోపం. దయచేసి మళ్లీ ప్రయత్నించండి.', 'error', true),
	(21, 'ai.image_insufficient', 2, 'చిత్రం సరిపోదు', 'ai', true),
	(22, 'ai.not_for_clinical_use', 2, 'వైద్య వినియోగానికి కాదు', 'ai', true),
	(23, 'sync.confirmed', 2, 'సమకాలీకరించబడింది', 'sync', true),
	(24, 'sync.pending', 2, 'సమకాలీకరణ కోసం వేచి ఉంది', 'sync', true),
	(25, 'login.title', 2, 'లాగిన్', 'auth', true),
	(26, 'common.retake', 2, 'మళ్లీ ఫోటో తీయండి', 'screening', true),
	(27, 'common.next', 2, 'తరువాత', 'common', true),
	(28, 'common.cancel', 2, 'రద్దు చేయండి', 'common', true),
	(29, 'common.save', 2, 'సేవ్ చేయండి', 'common', true),
	(30, 'app.title', 2, 'ఆరోగ్య దృష్టి', 'common', true);


--
-- Name: mst_ai_models_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_ai_models_id_seq', 4, true);


--
-- Name: mst_appointment_statuses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_appointment_statuses_id_seq', 6, true);


--
-- Name: mst_consent_purposes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_consent_purposes_id_seq', 5, true);


--
-- Name: mst_diagnostic_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_diagnostic_categories_id_seq', 4, true);


--
-- Name: mst_diagnostic_tests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_diagnostic_tests_id_seq', 20, true);


--
-- Name: mst_districts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_districts_id_seq', 2, true);


--
-- Name: mst_exposure_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_exposure_types_id_seq', 6, true);


--
-- Name: mst_facilities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_facilities_id_seq', 13, true);


--
-- Name: mst_followup_statuses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_followup_statuses_id_seq', 4, true);


--
-- Name: mst_gram_panchayats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_gram_panchayats_id_seq', 1, true);


--
-- Name: mst_hospitals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_hospitals_id_seq', 6, true);


--
-- Name: mst_investigation_statuses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_investigation_statuses_id_seq', 7, true);


--
-- Name: mst_investigation_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_investigation_types_id_seq', 6, true);


--
-- Name: mst_languages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_languages_id_seq', 2, true);


--
-- Name: mst_mandals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_mandals_id_seq', 35, true);


--
-- Name: mst_missed_reasons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_missed_reasons_id_seq', 10, true);


--
-- Name: mst_notification_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_notification_templates_id_seq', 66, true);


--
-- Name: mst_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_permissions_id_seq', 130, true);


--
-- Name: mst_phcs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_phcs_id_seq', 4, true);


--
-- Name: mst_protocol_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_protocol_rules_id_seq', 6, true);


--
-- Name: mst_referral_priorities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_referral_priorities_id_seq', 3, true);


--
-- Name: mst_roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_roles_id_seq', 10, true);


--
-- Name: mst_screening_sites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_screening_sites_id_seq', 1, false);


--
-- Name: mst_specialties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_specialties_id_seq', 5, true);


--
-- Name: mst_symptoms_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_symptoms_id_seq', 9, true);


--
-- Name: mst_ui_translations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_ui_translations_id_seq', 30, true);


--
-- Name: mst_villages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mst_villages_id_seq', 2493, true);


--
-- PostgreSQL database dump complete
--





-- ---------------------------------------------------------------------------
-- Migration history: mark all current migrator files as applied (baseline).
-- After loading this file, `npm run migrate` should report: Database is up to date.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename     TEXT PRIMARY KEY,
  checksum     CHAR(64) NOT NULL,
  applied_by   TEXT NOT NULL DEFAULT 'migrator',
  execution_ms INT,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('001_schema_fixes.sql', '14c063647e00b4f88bf03fe6b22bc4248eb97c071496964dfcf286e7e6c91b8b', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('002_security_core.sql', '5b2e1520fa360de0a61fef72ee7bd9f24857329129c5bd3c5e47d2f26d0501cd', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('003_promote_bootstrap_admin.js', '188deb30eb45efa53f679932d74c7f9af8466cdfc4c9e504bbecb0d9574bf389', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('004_lgd_locations.sql', '924185ebecbbbe3219177acd496ca7566d20779ba106a7683c4fa0ef87846147', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('005_case_facts_village_mandal.js', 'ec7bfbabdd3e9cf1542a1b24dec27db32a6d8cf98f2da4c25999193501f25dbe', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('006_facility_type_values.sql', 'be83cf5fc3bd9519f4910cf7b3a02f827e60de3c87df063eacbdbe8c08ce27af', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('007_facility_management.sql', 'f20fe8f9f3160e94895020d6578421ded3d5d5c35c68eedbf59e469f84b3126d', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('008_pending_setup_status.sql', '48dff637f98ff75dad8ab3912ae5b3dc002682221c6fcd3250058dba7062d4fd', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('009_system_admin_management.sql', 'c1b2947db5324a956686fc50bbb306fea16ae86b55689e05a90b7ae107c71d1d', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('010_registration_workflow_compat.sql', '78732c07820b5fc2be9d473ae5455a3b13adb1efe4b5aaff2cc101d34a4ae018', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('011_unify_admin_roles.sql', 'b758252bb1409160d43fdd75b34cea0343a287b3895bdf51c7572e272a420af7', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('012_district_admin_setup_delivery.sql', '0b5357ff541f513969d39693c3bcdb4be16f0f9fc9b21f6fa470d94462c9dbec', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('013_explicit_mandal_medical_officer_workflow.sql', 'f707fe5bdc4fffcdda615f16f8b2d839f3acd597ec44380faf8e27e86ac0bc81', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('015_two_stage_registration.sql', '10f91aa2412f678a01c490a012d20f6615b746be951157c2710b18d66e0ab0a1', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('017_health_worker_mandal_registration.sql', '1e5eaa6cfe5224b387fcb2e14711280cee41d0f08df60f79fac9d6461985d9ed', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('018_ai_screening_details.sql', '869a95f7ce7536d571c5add80cd45fd775a01b6c471ecbb3ee5663a771345726', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('020_specialist_consultation_booking.sql', '66120985fe760ebdbd602f064ba64b3e2b0a7d1d3125949750b16e3d4e909e98', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('021_specialist_consultation_slot_management.sql', '8ef9e332166d30a0e0f175d7428470cccccfc07e992733166e627ebc03ed17a6', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('022_specialist_consultation_decisions.sql', '70bb4a5fa71e8ae2b64f34d8bcf7f45e39fcc15f86b3a461b47dacecbd8bfd80', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('023_specialist_availability_requests.sql', 'a7330997e8cf572105a18ffe666022504d912bc8b25e1d527d683249cecde7fb', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('024_video_decision_booking_separation.sql', '6cafbf5a871b1eae50a3b953c7fb679d81d32cab4640572874facb7dfafae276', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('025_video_join_hw_navigator.sql', '6b5f64b5f685998aea41bd748a98c12feaed8c660be190ea9548edc8272e07b2', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('026_patient_care_lifecycle.sql', '8ee0d9cedf303f8895cc15c71c3c77f543efca5f5b001a131f323c55e9c2575d', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('027_case_transition_allowed.sql', '81b231c917c17e2ac7160579666800ac87acba783d20288725606a72347b579f', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('028_navigator_video_coordination.sql', 'b4f00824d1131ffe955dd583471131e6c669e0c01446ecb0db075d18ec06c29b', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('029_diagnostic_module.sql', '31fe43ca1982458398bd09ea2072cb3fca0c12d135ce4bcd055cf6cc1b22c9fc', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('030_diagnostic_scheduling.sql', '25d353635910de7ded42f2f8624beaaad9d660719471f6d38526a94123e9ae53', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('031_patient_tracking_timeline.sql', '21c57883b3696096225baa4509a77b940dfbd27d2add28422b81a65f15a106f0', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('032_cloudflare_workers_ai_model.sql', '09e0b51bce1c1a7dfcf2d49e54f528add177ac23de69c836a548d9d553b41327', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('033_care_followup_reassessment.sql', '278ff044f0697a0b7ca0b4ccedd5754256d70f5960f50d70c92a807e3119c94e', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('034_diagnostic_reports_care_duration.sql', 'e3a2e71c3aa98b463ad2e6ec8a52f9381a97d05878143a5c26c9616dcbf72534', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('035_care_missed_revisit_timeline_referral.sql', '6a31ebcc92bdfc7bad3c312302bace27580c959d7801698bd0ae32f4cd9050e3', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('036_specialist_care_lifecycle.sql', 'a78fdea4cd332e23cdae563dc0858800e3c0fbf863458f418ff4e1a70572528e', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('037_specialist_return_and_precautions.sql', '64521073dcf50aa965154bc2cf20d01a0d66ec8132aac80dd709a653e2b9065d', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('038_dynamic_page_rbac.sql', 'ec4a674fa2f1aef6a2453152f7c452495230865d1c43e5d390d08451926d24a5', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('039_diagnostic_navigator_workflow.sql', '6ea1f7c6b62e929c2688cc0aa5c023d0ed6431235c8390e8279c98098ff6844c', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('040_system_admin_role_manage.sql', '8a7d6c01f55379ac2b7db6ab9625859670c297b4606d91b1c50e19eb92e1878a', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('041_district_custom_accounts_page.sql', '6f34cd0c1f09101579116606f611fb72c0c8155bac196c9151246ca5e69baa73', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('042_diagnostic_followup_reassessment_cycle.sql', '34722cbf94ddf86ea7d109b41b44881bb818c3d7ca0f48bac07d78e9e6a5425b', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)
VALUES ('043_diagnostic_followup_security_timeline.sql', '5b76a92aed1b9ff0ecdb1b9bb290ee1a1b1adf3a994c8dc6ab11d23cb292e6f6', 'bootstrap_final', 0)
ON CONFLICT (filename) DO UPDATE
  SET checksum = EXCLUDED.checksum,
      applied_by = EXCLUDED.applied_by,
      applied_at = now();

-- Recorded 40 migration file(s).


COMMIT;

-- End of AAROGYA_BOOTSTRAP_FINAL.sql
