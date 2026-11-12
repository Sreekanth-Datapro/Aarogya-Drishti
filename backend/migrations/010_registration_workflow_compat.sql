-- NULL keeps existing registration requests on the legacy review workflow.
-- Version 1 is reserved for the future two-stage workflow.
ALTER TABLE tbl_user_registration_requests
    ADD COLUMN IF NOT EXISTS workflow_version SMALLINT;

ALTER TABLE tbl_user_registration_requests
    ADD CONSTRAINT ck_registration_workflow_version
    CHECK (workflow_version IS NULL OR workflow_version = 1) NOT VALID;
