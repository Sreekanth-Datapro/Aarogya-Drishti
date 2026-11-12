ALTER TABLE tbl_district_admin_setup_tokens
    ADD COLUMN IF NOT EXISTS encrypted_token TEXT,
    ADD COLUMN IF NOT EXISTS email_delivery_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    ADD COLUMN IF NOT EXISTS email_delivery_attempted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_delivery_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sms_delivery_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    ADD COLUMN IF NOT EXISTS sms_delivery_attempted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sms_delivery_sent_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'ck_district_setup_email_delivery_status'
           AND conrelid = 'tbl_district_admin_setup_tokens'::regclass
    ) THEN
        ALTER TABLE tbl_district_admin_setup_tokens
            ADD CONSTRAINT ck_district_setup_email_delivery_status
            CHECK (email_delivery_status IN ('NOT_CONFIGURED', 'SENT', 'FAILED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'ck_district_setup_sms_delivery_status'
           AND conrelid = 'tbl_district_admin_setup_tokens'::regclass
    ) THEN
        ALTER TABLE tbl_district_admin_setup_tokens
            ADD CONSTRAINT ck_district_setup_sms_delivery_status
            CHECK (sms_delivery_status IN ('NOT_CONFIGURED', 'SENT', 'FAILED'));
    END IF;
END;
$$;
