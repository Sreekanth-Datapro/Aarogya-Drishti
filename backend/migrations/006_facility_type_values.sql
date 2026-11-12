-- 006_facility_type_values.sql | Two more values for the existing facility_type enum.
-- PostgreSQL cannot use a new enum value in the same transaction that adds it,
-- so the values are added here and used from migration 007 onwards.
-- Additive only: existing values and rows are unchanged.

ALTER TYPE facility_type ADD VALUE IF NOT EXISTS 'SUB_CENTRE';
ALTER TYPE facility_type ADD VALUE IF NOT EXISTS 'OTHER';
