const pool = require("../../db");
const { audit } = require("../../utils/audit");
const { withTransaction } = require("./scope");

// ==========================================
// MO REPORTS: counts per assigned Mandal (no patient identifiers).
// Optional date range filters on registration / screening / referral dates.
// ==========================================

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateFilters(query = {}) {
  return {
    from: isDate(query.date_from) ? query.date_from : null,
    to: isDate(query.date_to) ? query.date_to : null,
  };
}

// $2 = date_from or NULL, $3 = date_to or NULL
const IN_RANGE = (column) => `($2::date IS NULL OR ${column} >= $2::date)
  AND ($3::date IS NULL OR ${column} < $3::date + 1)`;

async function getMandalReport(userId, query = {}) {
  const { from, to } = dateFilters(query);
  const { rows } = await pool.query(
    `SELECT m.id, m.name_en, m.name_te,
            (SELECT COUNT(*) FROM tbl_patients p JOIN mst_villages v ON v.id = p.village_id
              WHERE v.mandal_id = m.id AND p.deleted_at IS NULL AND ${IN_RANGE("p.created_at")}) AS patients,
            (SELECT COUNT(*) FROM tbl_screenings s JOIN tbl_patients p ON p.id = s.patient_id
               JOIN mst_villages v ON v.id = p.village_id
              WHERE v.mandal_id = m.id AND ${IN_RANGE("s.screening_date")}) AS screenings,
            (SELECT COUNT(*) FROM tbl_screenings s JOIN tbl_patients p ON p.id = s.patient_id
               JOIN mst_villages v ON v.id = p.village_id
              WHERE v.mandal_id = m.id AND s.case_state = 'AWAITING_CLINICIAN'
                AND ${IN_RANGE("s.screening_date")}) AS awaiting_review,
            (SELECT COUNT(*) FROM tbl_clinical_reviews cr JOIN tbl_patients p ON p.id = cr.patient_id
               JOIN mst_villages v ON v.id = p.village_id
              WHERE v.mandal_id = m.id AND cr.signed_at IS NOT NULL AND ${IN_RANGE("cr.signed_at")}) AS signed_reviews,
            (SELECT COUNT(*) FROM tbl_clinical_reviews cr JOIN tbl_patients p ON p.id = cr.patient_id
               JOIN mst_villages v ON v.id = p.village_id
              WHERE v.mandal_id = m.id AND cr.signed_at IS NULL AND ${IN_RANGE("cr.created_at")}) AS draft_reviews,
            (SELECT COUNT(*) FROM tbl_referrals r JOIN tbl_patients p ON p.id = r.patient_id
               JOIN mst_villages v ON v.id = p.village_id
              WHERE v.mandal_id = m.id AND ${IN_RANGE("r.created_at")}) AS referrals,
            (SELECT COUNT(*) FROM tbl_referrals r JOIN tbl_patients p ON p.id = r.patient_id
               JOIN mst_villages v ON v.id = p.village_id
              WHERE v.mandal_id = m.id AND r.status = 'COMPLETED' AND ${IN_RANGE("r.created_at")}) AS referrals_completed,
            (SELECT COUNT(*) FROM tbl_followup_tasks t JOIN tbl_patients p ON p.id = t.patient_id
               JOIN mst_villages v ON v.id = p.village_id
              WHERE v.mandal_id = m.id AND t.closed_at IS NULL AND ${IN_RANGE("t.created_at")}) AS followups_open,
            (SELECT COUNT(*) FROM tbl_followup_tasks t JOIN tbl_patients p ON p.id = t.patient_id
               JOIN mst_villages v ON v.id = p.village_id
              WHERE v.mandal_id = m.id AND t.closed_at IS NOT NULL AND ${IN_RANGE("t.created_at")}) AS followups_closed
       FROM tbl_medical_officer_mandal_assignments moa
       JOIN mst_mandals m ON m.id = moa.mandal_id
      WHERE moa.user_id = $1 AND moa.valid_from <= CURRENT_DATE
        AND (moa.valid_to IS NULL OR moa.valid_to >= CURRENT_DATE)
      ORDER BY m.name_en`,
    [userId, from, to]
  );

  const numbers = ["patients", "screenings", "awaiting_review", "signed_reviews", "draft_reviews",
    "referrals", "referrals_completed", "followups_open", "followups_closed"];
  const mandals = rows.map((row) => {
    const clean = { id: Number(row.id), name_en: row.name_en, name_te: row.name_te };
    for (const key of numbers) clean[key] = Number(row[key] || 0);
    return clean;
  });
  const totals = {};
  for (const key of numbers) totals[key] = mandals.reduce((sum, row) => sum + row[key], 0);
  return { filters: { date_from: from, date_to: to }, mandals, totals, columns: numbers };
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Aggregate-only CSV; every export is recorded in tbl_data_exports (append-only)
async function exportMandalReport(userId, req, query = {}) {
  const report = await getMandalReport(userId, query);
  const header = ["mandal", ...report.columns];
  const lines = [header.join(",")];
  for (const row of report.mandals) lines.push([row.name_en, ...report.columns.map((key) => row[key])].map(csvValue).join(","));
  lines.push(["TOTAL", ...report.columns.map((key) => report.totals[key])].map(csvValue).join(","));

  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO tbl_data_exports (exported_by, export_kind, filters, row_count, contains_identifiers)
       VALUES ($1, 'MO_MANDAL_SUMMARY', $2::jsonb, $3, FALSE)`,
      [userId, JSON.stringify(report.filters), report.mandals.length]
    );
    await audit(req, {
      client,
      required: true,
      event: "REPORT_EXPORTED",
      resourceType: "report",
      resourceId: "MO_MANDAL_SUMMARY",
      metadata: { rows: report.mandals.length },
    });
  });
  return lines.join("\n");
}

module.exports = { getMandalReport, exportMandalReport };
