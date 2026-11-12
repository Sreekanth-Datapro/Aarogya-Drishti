const pool = require("../../db");
const { mandalScope } = require("./scope");
const { activeScreeningOrder } = require("../../utils/screeningSelection");

// Patients in my Mandals with their latest screening
const MY_PATIENTS = `
  FROM tbl_patients p
  JOIN mst_villages pv ON pv.id = p.village_id
  LEFT JOIN LATERAL (
    SELECT s.id, s.case_state, s.screening_date
      FROM tbl_screenings s
     WHERE s.patient_id = p.id
     ORDER BY ${activeScreeningOrder("s")}
     LIMIT 1
  ) latest ON TRUE
 WHERE p.deleted_at IS NULL AND ${mandalScope("$1")}`;

const toNumber = (value) => Number(value || 0);

async function getDashboard(userId) {
  const [totals, states, weekly, byMandal, referrals, urgentReferrals, followups, activity, mandals] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total_patients,
              COUNT(*) FILTER (WHERE latest.case_state = 'AWAITING_CLINICIAN'
                AND NOT EXISTS (SELECT 1 FROM tbl_medical_officer_case_claims c
                                 WHERE c.patient_id = p.id AND c.released_at IS NULL)) AS pending_screenings,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM tbl_medical_officer_case_claims c
                                 WHERE c.patient_id = p.id AND c.released_at IS NULL
                                   AND c.medical_officer_id = $1)) AS my_claimed_cases,
              COUNT(*) FILTER (WHERE latest.case_state = 'AWAITING_CLINICIAN'
                AND EXISTS (SELECT 1 FROM tbl_medical_officer_case_claims c
                             WHERE c.patient_id = p.id AND c.released_at IS NULL AND c.medical_officer_id = $1)
                AND NOT EXISTS (SELECT 1 FROM tbl_clinical_reviews cr
                                 WHERE cr.screening_id = latest.id AND cr.signed_at IS NOT NULL)) AS pending_reviews
       ${MY_PATIENTS}`,
      [userId]
    ),
    pool.query(
      `SELECT latest.case_state::text AS state, COUNT(*) AS count
       ${MY_PATIENTS} AND latest.id IS NOT NULL
        GROUP BY latest.case_state ORDER BY count DESC`,
      [userId]
    ),
    pool.query(
      `SELECT to_char(w.week_start, 'YYYY-MM-DD') AS week,
              (SELECT COUNT(*) FROM tbl_screenings s
                 JOIN tbl_patients p ON p.id = s.patient_id AND p.deleted_at IS NULL
                 JOIN mst_villages pv ON pv.id = p.village_id
                WHERE ${mandalScope("$1")}
                  AND s.screening_date >= w.week_start
                  AND s.screening_date < w.week_start + interval '7 days') AS screenings,
              (SELECT COUNT(*) FROM tbl_clinical_reviews cr
                WHERE cr.doctor_id = $1 AND cr.signed_at >= w.week_start
                  AND cr.signed_at < w.week_start + interval '7 days') AS signed_reviews
         FROM generate_series(date_trunc('week', CURRENT_DATE) - interval '7 weeks',
                              date_trunc('week', CURRENT_DATE), interval '1 week') AS w(week_start)
        ORDER BY w.week_start`,
      [userId]
    ),
    pool.query(
      `SELECT m.id, m.name_en, m.name_te,
              COUNT(p.id) AS patients,
              COUNT(p.id) FILTER (WHERE latest.case_state = 'AWAITING_CLINICIAN') AS awaiting_review
         FROM tbl_medical_officer_mandal_assignments moa
         JOIN mst_mandals m ON m.id = moa.mandal_id
         LEFT JOIN mst_villages pv ON pv.mandal_id = m.id
         LEFT JOIN tbl_patients p ON p.village_id = pv.id AND p.deleted_at IS NULL
         LEFT JOIN LATERAL (
           SELECT s.case_state FROM tbl_screenings s WHERE s.patient_id = p.id
            ORDER BY ${activeScreeningOrder("s")} LIMIT 1
         ) latest ON TRUE
        WHERE moa.user_id = $1 AND moa.valid_from <= CURRENT_DATE
          AND (moa.valid_to IS NULL OR moa.valid_to >= CURRENT_DATE)
        GROUP BY m.id, m.name_en, m.name_te
        ORDER BY patients DESC, m.name_en`,
      [userId]
    ),
    pool.query(
      `SELECT r.status::text AS status, COUNT(*) AS count
         FROM tbl_referrals r
         JOIN tbl_patients p ON p.id = r.patient_id
         JOIN mst_villages pv ON pv.id = p.village_id
        WHERE ${mandalScope("$1")}
        GROUP BY r.status`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) AS count
         FROM tbl_referrals r
         JOIN tbl_clinical_reviews review ON review.id = r.review_id
         JOIN tbl_patients p ON p.id = r.patient_id AND p.deleted_at IS NULL
         JOIN mst_villages pv ON pv.id = p.village_id
        WHERE ${mandalScope("$1")}
          AND review.decision = 'URGENT_REFERRAL'
          AND r.status NOT IN ('COMPLETED', 'CANCELLED', 'DECLINED')`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE t.closed_at IS NULL) AS open,
              COUNT(*) FILTER (WHERE t.closed_at IS NULL AND t.due_at < now()) AS overdue,
              COUNT(*) FILTER (WHERE t.closed_at IS NOT NULL) AS closed
         FROM tbl_followup_tasks t
         JOIN tbl_patients p ON p.id = t.patient_id
         JOIN mst_villages pv ON pv.id = p.village_id
        WHERE ${mandalScope("$1")}`,
      [userId]
    ),
    pool.query(
      `SELECT id, occurred_at, event, outcome, resource_type
         FROM tbl_audit_logs
        WHERE actor_id = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT 8`,
      [userId]
    ),
    pool.query(
      `SELECT m.id, m.name_en, m.name_te
         FROM tbl_medical_officer_mandal_assignments moa
         JOIN mst_mandals m ON m.id = moa.mandal_id
        WHERE moa.user_id = $1 AND moa.valid_from <= CURRENT_DATE
          AND (moa.valid_to IS NULL OR moa.valid_to >= CURRENT_DATE)
        ORDER BY m.name_en`,
      [userId]
    ),
  ]);

  const referralCounts = {};
  for (const row of referrals.rows) referralCounts[row.status] = toNumber(row.count);
  const total = totals.rows[0] || {};

  return {
    assigned_mandals: mandals.rows.map((row) => ({ ...row, id: Number(row.id) })),
    totals: {
      total_patients: toNumber(total.total_patients),
      pending_screenings: toNumber(total.pending_screenings),
      my_claimed_cases: toNumber(total.my_claimed_cases),
      pending_reviews: toNumber(total.pending_reviews),
      referrals: Object.values(referralCounts).reduce((sum, value) => sum + value, 0),
      urgent_referrals: toNumber(urgentReferrals.rows[0]?.count),
      open_followups: toNumber(followups.rows[0]?.open),
      overdue_followups: toNumber(followups.rows[0]?.overdue),
    },
    case_states: states.rows.map((row) => ({ state: row.state, count: toNumber(row.count) })),
    weekly: weekly.rows.map((row) => ({
      week: row.week,
      screenings: toNumber(row.screenings),
      signed_reviews: toNumber(row.signed_reviews),
    })),
    by_mandal: byMandal.rows.map((row) => ({
      id: Number(row.id),
      name_en: row.name_en,
      name_te: row.name_te,
      patients: toNumber(row.patients),
      awaiting_review: toNumber(row.awaiting_review),
    })),
    referrals_by_status: referralCounts,
    followups: {
      open: toNumber(followups.rows[0]?.open),
      overdue: toNumber(followups.rows[0]?.overdue),
      closed: toNumber(followups.rows[0]?.closed),
    },
    recent_activity: activity.rows.map((row) => ({ ...row, id: Number(row.id) })),
  };
}

module.exports = { getDashboard };
