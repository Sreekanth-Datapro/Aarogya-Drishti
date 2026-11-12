-- 028_navigator_video_coordination.sql
-- Lets Navigators submit preferred video times for Hospital Staff review,
-- without creating a second booking module. Non-destructive.

BEGIN;

-- Allow Navigator (preferred-time submitter) or Hospital Staff as requester.
DROP TRIGGER IF EXISTS trg_specialist_availability_request_requester_role
  ON tbl_specialist_availability_requests;
CREATE TRIGGER trg_specialist_availability_request_requester_role
  BEFORE INSERT OR UPDATE ON tbl_specialist_availability_requests
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('requested_by', 'HOSPITAL_STAFF,NAVIGATOR');

-- STAFF_REVIEW = Navigator preferred time waiting for Hospital Staff action.
ALTER TABLE tbl_specialist_availability_requests
  DROP CONSTRAINT IF EXISTS ck_specialist_availability_requests_status_check;

ALTER TABLE tbl_specialist_availability_requests
  DROP CONSTRAINT IF EXISTS tbl_specialist_availability_requests_status_check;

DO $$
BEGIN
  ALTER TABLE tbl_specialist_availability_requests
    ADD CONSTRAINT tbl_specialist_availability_requests_status_check
    CHECK (status IN (
      'STAFF_REVIEW',
      'PENDING',
      'ACCEPTED',
      'SUGGESTED',
      'DECLINED',
      'CONFIRMED',
      'CANCELLED',
      'HOSPITAL_DECLINED'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tbl_specialist_availability_requests
  DROP CONSTRAINT IF EXISTS ck_specialist_availability_request_state;

ALTER TABLE tbl_specialist_availability_requests
  ADD CONSTRAINT ck_specialist_availability_request_state CHECK (
    (status = 'STAFF_REVIEW'
        AND responded_by IS NULL AND responded_at IS NULL
        AND response_reason IS NULL AND proposed_start IS NULL
        AND proposed_end IS NULL AND slot_id IS NULL
        AND video_consultation_id IS NULL
        AND confirmed_by IS NULL AND confirmed_at IS NULL
        AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR (status = 'PENDING'
        AND responded_by IS NULL AND responded_at IS NULL
        AND response_reason IS NULL AND proposed_start IS NULL
        AND proposed_end IS NULL AND slot_id IS NULL
        AND video_consultation_id IS NULL
        AND confirmed_by IS NULL AND confirmed_at IS NULL
        AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR (status IN ('ACCEPTED', 'SUGGESTED')
        AND responded_by IS NOT NULL AND responded_at IS NOT NULL
        AND proposed_start IS NOT NULL AND proposed_end IS NOT NULL
        AND video_consultation_id IS NULL
        AND confirmed_by IS NULL AND confirmed_at IS NULL
        AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR (status = 'DECLINED'
        AND responded_by IS NOT NULL AND responded_at IS NOT NULL
        AND response_reason IS NOT NULL AND length(trim(response_reason)) > 0
        AND proposed_start IS NULL AND proposed_end IS NULL
        AND video_consultation_id IS NULL
        AND confirmed_by IS NULL AND confirmed_at IS NULL
        AND cancelled_by IS NULL AND cancelled_at IS NULL)
    -- Specialist-path confirm (has specialist response) OR published-slot direct confirm.
    OR (status = 'CONFIRMED'
        AND proposed_start IS NOT NULL AND proposed_end IS NOT NULL
        AND slot_id IS NOT NULL AND video_consultation_id IS NOT NULL
        AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL
        AND cancelled_by IS NULL AND cancelled_at IS NULL
        AND (
          (responded_by IS NOT NULL AND responded_at IS NOT NULL)
          OR (responded_by IS NULL AND responded_at IS NULL)
        ))
    OR (status IN ('CANCELLED', 'HOSPITAL_DECLINED')
        AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL
        AND cancellation_reason IS NOT NULL
        AND length(trim(cancellation_reason)) > 0
        AND video_consultation_id IS NULL
        AND confirmed_by IS NULL AND confirmed_at IS NULL)
  );

DROP INDEX IF EXISTS uq_specialist_availability_active_referral;
CREATE UNIQUE INDEX uq_specialist_availability_active_referral
  ON tbl_specialist_availability_requests (referral_id)
  WHERE status IN ('STAFF_REVIEW', 'PENDING', 'ACCEPTED', 'SUGGESTED');

COMMIT;
