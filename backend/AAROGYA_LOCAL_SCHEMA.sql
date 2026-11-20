--
-- PostgreSQL database dump
--

\restrict efP85jkRWNiFnkVnyNCa6X9uEqFsoKiCbYTeZvicvHrONoChfdl9ewS3OL7wTsS

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
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
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


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
-- Name: FUNCTION fn_case_transition_allowed(from_state text, to_state text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_case_transition_allowed(from_state text, to_state text) IS 'Shared case_state transition matrix used by fn_check_case_transition and care lifecycle screening sync.';


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
        SELECT district_id INTO mandal_district FROM mst_mandals WHERE id = NEW.mandal_id;
        IF mandal_district IS DISTINCT FROM NEW.district_id THEN
            RAISE EXCEPTION 'Facility mandal % does not belong to district %', NEW.mandal_id, NEW.district_id;
        END IF;
    END IF;

    IF NEW.village_id IS NOT NULL THEN
        IF NEW.mandal_id IS NULL THEN
            RAISE EXCEPTION 'A facility with a village must also have a mandal';
        END IF;
        SELECT mandal_id INTO village_mandal FROM mst_villages WHERE id = NEW.village_id;
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
        SELECT mandal_id INTO gp_mandal FROM mst_gram_panchayats WHERE id = NEW.gram_panchayat_id;

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
-- Name: COLUMN tbl_ai_assessments.analysis_details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_ai_assessments.analysis_details IS 'Structured preliminary visual observations and image-quality checks; never a diagnosis or trained-model prediction.';


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
-- Name: COLUMN tbl_care_plans.responsible_specialist_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_care_plans.responsible_specialist_id IS 'Specialist clinical owner when source=SPECIALIST. responsible_mo_id remains the referring Medical Officer for return-from-specialist.';


--
-- Name: COLUMN tbl_care_plans.precautions_duration_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_care_plans.precautions_duration_days IS 'Optional precaution follow-up duration in days. Expiry never auto-closes the case.';


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
-- Name: VIEW vw_patient_timeline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.vw_patient_timeline IS 'Codes/ids only patient journey events including diagnostic advice/follow-up cycle. Authorise with fn_user_has_patient_access before use.';


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

\unrestrict efP85jkRWNiFnkVnyNCa6X9uEqFsoKiCbYTeZvicvHrONoChfdl9ewS3OL7wTsS

