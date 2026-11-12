-- Register Cloudflare Workers AI vision model for non-clinical screening support.
-- Keeps existing ollama-cloud rows intact.

DO $$
BEGIN
    IF to_regclass('public.mst_ai_models') IS NULL THEN
        RAISE EXCEPTION 'Migration 032 requires mst_ai_models from the approved baseline';
    END IF;
END;
$$;

INSERT INTO mst_ai_models
    (provider, model_version, description, permitted_use, validation_status,
     supports_localization, is_research_only, clinical_use, is_active)
VALUES
    ('cloudflare-workers-ai', '@cf/meta/llama-3.2-11b-vision-instruct',
     'Cloudflare Workers AI vision model for preliminary image suitability and visual observations; not trained or validated for clinical diagnosis.',
     'Preliminary screening support only - NOT FOR CLINICAL USE',
     'NOT_VALIDATED', FALSE, TRUE, FALSE, TRUE)
ON CONFLICT (provider, model_version) DO UPDATE
SET is_active = TRUE,
    is_research_only = TRUE,
    clinical_use = FALSE,
    description = EXCLUDED.description,
    permitted_use = EXCLUDED.permitted_use,
    validation_status = EXCLUDED.validation_status;
