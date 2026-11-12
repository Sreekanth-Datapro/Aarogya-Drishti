CREATE TABLE tbl_specialist_availability_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    specialist_id UUID NOT NULL REFERENCES tbl_users(id),
    hospital_id BIGINT NOT NULL REFERENCES mst_hospitals(id),
    specialty_id BIGINT NOT NULL REFERENCES mst_specialties(id),
    requested_by UUID NOT NULL REFERENCES tbl_users(id),
    requested_start TIMESTAMPTZ NOT NULL,
    requested_end TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'ACCEPTED',
        'SUGGESTED',
        'DECLINED',
        'CONFIRMED',
        'CANCELLED',
        'HOSPITAL_DECLINED'
    )),
    responded_by UUID REFERENCES tbl_users(id),
    responded_at TIMESTAMPTZ,
    response_reason TEXT,
    proposed_start TIMESTAMPTZ,
    proposed_end TIMESTAMPTZ,
    slot_id UUID REFERENCES tbl_consultation_slots(id),
    video_consultation_id UUID UNIQUE REFERENCES tbl_video_consultations(id),
    confirmed_by UUID REFERENCES tbl_users(id),
    confirmed_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES tbl_users(id),
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    rescheduled_from_id UUID REFERENCES tbl_specialist_availability_requests(id),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (referral_id, patient_id) REFERENCES tbl_referrals(id, patient_id),
    CONSTRAINT ck_specialist_availability_request_range
        CHECK (requested_end > requested_start),
    CONSTRAINT ck_specialist_availability_proposed_range
        CHECK (
            (proposed_start IS NULL AND proposed_end IS NULL)
            OR (proposed_start IS NOT NULL AND proposed_end > proposed_start)
        ),
    CONSTRAINT ck_specialist_availability_request_state CHECK (
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
            AND slot_id IS NOT NULL AND video_consultation_id IS NULL
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
            AND cancellation_reason IS NOT NULL AND length(trim(cancellation_reason)) > 0
            AND video_consultation_id IS NULL
            AND confirmed_by IS NULL AND confirmed_at IS NULL)
    )
);

CREATE UNIQUE INDEX uq_specialist_availability_active_referral
    ON tbl_specialist_availability_requests (referral_id)
    WHERE status IN ('PENDING', 'ACCEPTED', 'SUGGESTED');

CREATE INDEX idx_specialist_availability_pending
    ON tbl_specialist_availability_requests (specialist_id, requested_start)
    WHERE status = 'PENDING';

CREATE INDEX idx_specialist_availability_hospital
    ON tbl_specialist_availability_requests (hospital_id, status, requested_start);

CREATE TRIGGER trg_specialist_availability_request_specialist_role
    BEFORE INSERT OR UPDATE ON tbl_specialist_availability_requests
    FOR EACH ROW EXECUTE FUNCTION fn_require_role('specialist_id', 'SPECIALIST');

CREATE TRIGGER trg_specialist_availability_request_responder_role
    BEFORE INSERT OR UPDATE ON tbl_specialist_availability_requests
    FOR EACH ROW EXECUTE FUNCTION fn_require_role('responded_by', 'SPECIALIST');

CREATE TRIGGER trg_specialist_availability_request_requester_role
    BEFORE INSERT OR UPDATE ON tbl_specialist_availability_requests
    FOR EACH ROW EXECUTE FUNCTION fn_require_role('requested_by', 'HOSPITAL_STAFF');

CREATE TRIGGER trg_specialist_availability_request_confirmer_role
    BEFORE INSERT OR UPDATE ON tbl_specialist_availability_requests
    FOR EACH ROW EXECUTE FUNCTION fn_require_role('confirmed_by', 'HOSPITAL_STAFF');

CREATE TRIGGER trg_specialist_availability_request_canceller_role
    BEFORE INSERT OR UPDATE ON tbl_specialist_availability_requests
    FOR EACH ROW EXECUTE FUNCTION fn_require_role('cancelled_by', 'HOSPITAL_STAFF');

CREATE TRIGGER trg_specialist_availability_request_updated_at
    BEFORE UPDATE ON tbl_specialist_availability_requests
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
