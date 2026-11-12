-- Structured non-clinical image observations for the existing AI assessments.
-- This migration is added for review only and must be applied explicitly.

DO $$
BEGIN
    IF to_regclass('public.tbl_ai_assessments') IS NULL
       OR to_regclass('public.mst_ai_models') IS NULL THEN
        RAISE EXCEPTION 'Migration 018 requires the AI assessment schema from the approved baseline';
    END IF;
END;
$$;

ALTER TABLE tbl_ai_assessments
    ADD COLUMN IF NOT EXISTS analysis_details JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'tbl_ai_assessments'::regclass
           AND conname = 'ck_ai_analysis_details_object'
    ) THEN
        ALTER TABLE tbl_ai_assessments
            ADD CONSTRAINT ck_ai_analysis_details_object
            CHECK (analysis_details IS NULL OR jsonb_typeof(analysis_details) = 'object');
    END IF;
END;
$$;

COMMENT ON COLUMN tbl_ai_assessments.analysis_details IS
    'Structured preliminary visual observations and image-quality checks; never a diagnosis or trained-model prediction.';

INSERT INTO mst_ai_models
    (provider, model_version, description, permitted_use, validation_status,
     supports_localization, is_research_only, clinical_use)
VALUES
    ('ollama-cloud', 'gemma4:cloud',
     'General-purpose cloud vision model for preliminary visual observations; not trained or validated for oral disease diagnosis.',
     'Preliminary screening support only - NOT FOR CLINICAL USE',
     'NOT_VALIDATED', FALSE, TRUE, FALSE)
ON CONFLICT (provider, model_version) DO NOTHING;
