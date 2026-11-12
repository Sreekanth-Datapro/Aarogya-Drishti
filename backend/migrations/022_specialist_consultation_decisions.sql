CREATE TABLE tbl_specialist_consultation_decisions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id           UUID NOT NULL,
    patient_id            UUID NOT NULL,
    specialist_id         UUID NOT NULL REFERENCES tbl_users(id),
    decision_type         TEXT NOT NULL CHECK (decision_type IN (
                              'VIDEO_CONSULTATION',
                              'DIRECT_HOSPITAL_VISIT',
                              'ADDITIONAL_INVESTIGATIONS',
                              'CLINICAL_FOLLOW_UP',
                              'EMERGENCY_HOSPITAL_REFERRAL'
                          )),
    status                TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SIGNED')),
    clinical_reason       TEXT NOT NULL,
    clinical_recommendation TEXT,
    instructions          TEXT,
    additional_notes      TEXT,
    priority_id           BIGINT REFERENCES mst_referral_priorities(id),
    follow_up_date        DATE,
    hospital_id           BIGINT REFERENCES mst_hospitals(id),
    investigation_type_id BIGINT REFERENCES mst_investigation_types(id),
    consultation_id       UUID REFERENCES tbl_video_consultations(id),
    investigation_order_id UUID REFERENCES tbl_investigation_orders(id),
    signed_by             UUID REFERENCES tbl_users(id),
    signed_at             TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (referral_id, patient_id) REFERENCES tbl_referrals(id, patient_id),
    UNIQUE (referral_id),
    CONSTRAINT ck_specialist_decision_signoff CHECK (
        (status = 'DRAFT' AND signed_by IS NULL AND signed_at IS NULL)
        OR (status = 'SIGNED' AND signed_by IS NOT NULL AND signed_at IS NOT NULL)
    ),
    CONSTRAINT ck_specialist_decision_self_signoff CHECK (
        signed_by IS NULL OR signed_by = specialist_id
    ),
    CONSTRAINT ck_specialist_decision_video_consultation CHECK (
        status = 'DRAFT'
        OR decision_type <> 'VIDEO_CONSULTATION'
        OR consultation_id IS NOT NULL
    ),
    CONSTRAINT ck_specialist_decision_investigation_type CHECK (
        decision_type <> 'ADDITIONAL_INVESTIGATIONS'
        OR investigation_type_id IS NOT NULL
    )
);

CREATE INDEX idx_specialist_decisions_patient
    ON tbl_specialist_consultation_decisions (patient_id, created_at DESC);
CREATE INDEX idx_specialist_decisions_navigator
    ON tbl_specialist_consultation_decisions (referral_id, status, signed_at DESC);

CREATE TRIGGER trg_specialist_decision_specialist_role
    BEFORE INSERT OR UPDATE ON tbl_specialist_consultation_decisions
    FOR EACH ROW EXECUTE FUNCTION fn_require_role('specialist_id', 'SPECIALIST');
CREATE TRIGGER trg_specialist_decision_signer_role
    BEFORE INSERT OR UPDATE ON tbl_specialist_consultation_decisions
    FOR EACH ROW EXECUTE FUNCTION fn_require_role('signed_by', 'SPECIALIST');
CREATE TRIGGER trg_specialist_decision_updated_at
    BEFORE UPDATE ON tbl_specialist_consultation_decisions
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE FUNCTION fn_protect_signed_specialist_decision() RETURNS trigger LANGUAGE plpgsql AS $$
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

CREATE TRIGGER trg_specialist_decision_signed_immutable
    BEFORE UPDATE OR DELETE ON tbl_specialist_consultation_decisions
    FOR EACH ROW EXECUTE FUNCTION fn_protect_signed_specialist_decision();
