-- A signed video decision records clinical sign-off, not an appointment.
-- Availability responses also remain unbooked until Hospital Staff confirms.

ALTER TABLE tbl_specialist_consultation_decisions
    DROP CONSTRAINT ck_specialist_decision_video_consultation;

ALTER TABLE tbl_specialist_availability_requests
    DROP CONSTRAINT ck_specialist_availability_request_state;

ALTER TABLE tbl_specialist_availability_requests
    ADD CONSTRAINT ck_specialist_availability_request_state CHECK (
        (status = 'PENDING'
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
        OR (status = 'CONFIRMED'
            AND responded_by IS NOT NULL AND responded_at IS NOT NULL
            AND proposed_start IS NOT NULL AND proposed_end IS NOT NULL
            AND slot_id IS NOT NULL AND video_consultation_id IS NOT NULL
            AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL
            AND cancelled_by IS NULL AND cancelled_at IS NULL)
        OR (status IN ('CANCELLED', 'HOSPITAL_DECLINED')
            AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL
            AND cancellation_reason IS NOT NULL
            AND length(trim(cancellation_reason)) > 0
            AND video_consultation_id IS NULL
            AND confirmed_by IS NULL AND confirmed_at IS NULL)
    );
