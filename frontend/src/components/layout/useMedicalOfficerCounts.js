import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../../services/api";

// Live task counts for the Medical Officer sidebar, read from existing APIs:
//  - registrations: pending Health Worker applications in my Mandals still
//    waiting for my recommendation (GET /registrations/medical-officer)
//  - queue: unclaimed screenings waiting for review in my Mandals
//    (GET /medical-officer/cases?view=available)
// A count is left out (no badge) when its API call fails, so no number is ever guessed.
export default function useMedicalOfficerCounts(user) {
  const location = useLocation();
  const [counts, setCounts] = useState({});
  const isMedicalOfficer = user?.role === "MEDICAL_OFFICER";
  // registration.recommend after migration 015, registration.verify before it
  const canRecommend = ["registration.recommend", "registration.verify"].some((code) => user?.permissions?.includes(code));

  useEffect(() => {
    if (!isMedicalOfficer) {
      setCounts({});
      return undefined;
    }

    let cancelled = false;

    async function loadCounts() {
      const next = {};

      try {
        const response = await api.get("/medical-officer/cases", { params: { view: "available" } });
        next.queue = response.data.pagination?.total ?? (response.data.cases || []).length;
      } catch {
        // no badge
      }

      if (canRecommend) {
        try {
          const response = await api.get("/registrations/medical-officer");
          next.registrations = (response.data.registrations || [])
            .filter((item) => !item.mo_recommended_by).length;
        } catch {
          // no badge
        }
      }

      if (!cancelled) setCounts(next);
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
    // Reload when the officer moves to another page (e.g. after claiming a case)
  }, [isMedicalOfficer, canRecommend, location.pathname]);

  return counts;
}
