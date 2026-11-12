-- Diagnostic Module Phase 3: scheduling appointments for diagnostic orders.
-- Does not modify tbl_hospital_appointments or video consultations.
-- Does not change case_state transitions.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS tbl_diagnostic_appointments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diagnostic_order_id  UUID NOT NULL REFERENCES tbl_diagnostic_orders(id),
    patient_id           UUID NOT NULL REFERENCES tbl_patients(id),
    facility_id          BIGINT NOT NULL REFERENCES mst_facilities(id),
    requested_at         TIMESTAMPTZ NOT NULL,
    confirmed_at_time    TIMESTAMPTZ,
    status_id            BIGINT NOT NULL REFERENCES mst_appointment_statuses(id),
    attendance           attendance_status NOT NULL DEFAULT 'PENDING',
    attended_at          TIMESTAMPTZ,
    patient_informed     BOOLEAN NOT NULL DEFAULT FALSE,
    patient_informed_at  TIMESTAMPTZ,
    contact_status       TEXT NOT NULL DEFAULT 'NOT_CONTACTED'
                           CHECK (contact_status IN (
                             'NOT_CONTACTED', 'INFORMED', 'REACHED', 'UNREACHABLE'
                           )),
    contact_notes        TEXT,
    coordination_notes   TEXT,
    location_note        TEXT,
    cancel_reason        TEXT,
    missed_reason_text   TEXT,
    booked_by            UUID NOT NULL REFERENCES tbl_users(id),
    confirmed_by         UUID REFERENCES tbl_users(id),
    confirmed_at         TIMESTAMPTZ,
    rescheduled_from_id  UUID REFERENCES tbl_diagnostic_appointments(id),
    idempotency_key      TEXT,
    version              INT NOT NULL DEFAULT 1,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, patient_id),
    UNIQUE (booked_by, idempotency_key),
    FOREIGN KEY (diagnostic_order_id, patient_id)
      REFERENCES tbl_diagnostic_orders (id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_appt_order
  ON tbl_diagnostic_appointments (diagnostic_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_appt_patient
  ON tbl_diagnostic_appointments (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_appt_facility_time
  ON tbl_diagnostic_appointments (facility_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_diagnostic_appt_status
  ON tbl_diagnostic_appointments (status_id);

DROP TRIGGER IF EXISTS trg_tbl_diagnostic_appointments_updated_at ON tbl_diagnostic_appointments;
CREATE TRIGGER trg_tbl_diagnostic_appointments_updated_at
  BEFORE UPDATE ON tbl_diagnostic_appointments
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_diagnostic_appt_booker_role ON tbl_diagnostic_appointments;
CREATE TRIGGER trg_diagnostic_appt_booker_role
  BEFORE INSERT ON tbl_diagnostic_appointments
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('booked_by', 'NAVIGATOR,HOSPITAL_STAFF');

DROP TRIGGER IF EXISTS trg_diagnostic_appt_confirmer_role ON tbl_diagnostic_appointments;
CREATE TRIGGER trg_diagnostic_appt_confirmer_role
  BEFORE INSERT OR UPDATE ON tbl_diagnostic_appointments
  FOR EACH ROW EXECUTE FUNCTION fn_require_role('confirmed_by', 'HOSPITAL_STAFF');

-- Active-booking and facility-time conflicts are enforced in the service
-- (partial unique indexes cannot safely reference status code lookups).

CREATE TABLE IF NOT EXISTS tbl_diagnostic_appointment_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id  UUID NOT NULL REFERENCES tbl_diagnostic_appointments(id) ON DELETE CASCADE,
    from_status_id  BIGINT REFERENCES mst_appointment_statuses(id),
    to_status_id    BIGINT NOT NULL REFERENCES mst_appointment_statuses(id),
    changed_by      UUID NOT NULL REFERENCES tbl_users(id),
    reason          TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_appt_history
  ON tbl_diagnostic_appointment_history (appointment_id, changed_at);

DROP TRIGGER IF EXISTS trg_diagnostic_appt_history_append_only ON tbl_diagnostic_appointment_history;
CREATE TRIGGER trg_diagnostic_appt_history_append_only
  BEFORE UPDATE OR DELETE ON tbl_diagnostic_appointment_history
  FOR EACH ROW EXECUTE FUNCTION fn_block_mutation();

-- Permissions
INSERT INTO mst_permissions (code, resource, action, description)
SELECT 'diagnostic.schedule', 'diagnostic', 'schedule', 'Request diagnostic appointment scheduling'
 WHERE NOT EXISTS (SELECT 1 FROM mst_permissions WHERE code = 'diagnostic.schedule');

INSERT INTO mst_permissions (code, resource, action, description)
SELECT 'diagnostic.confirm', 'diagnostic', 'confirm', 'Confirm, reschedule or cancel diagnostic appointments'
 WHERE NOT EXISTS (SELECT 1 FROM mst_permissions WHERE code = 'diagnostic.confirm');

INSERT INTO mst_permissions (code, resource, action, description)
SELECT 'diagnostic.followup', 'diagnostic', 'followup', 'Record patient contact and attendance for diagnostics'
 WHERE NOT EXISTS (SELECT 1 FROM mst_permissions WHERE code = 'diagnostic.followup');

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'NAVIGATOR'
   AND permission_row.code IN ('diagnostic.schedule', 'diagnostic.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'HOSPITAL_STAFF'
   AND permission_row.code IN ('diagnostic.confirm', 'diagnostic.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO tbl_role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
  FROM mst_roles role_row
  CROSS JOIN mst_permissions permission_row
 WHERE role_row.code = 'HEALTH_WORKER'
   AND permission_row.code IN ('diagnostic.followup', 'diagnostic.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;
