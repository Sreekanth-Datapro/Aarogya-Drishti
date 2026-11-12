import { useEffect, useState } from "react";
import api from "../../services/api";

// Loads the location dropdowns from our backend (never from LGD directly):
//   districts always, mandals of the chosen district, villages of the chosen mandal.
export default function useLocationLists(districtId, mandalId) {
  const [districts, setDistricts] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [villages, setVillages] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/masters/districts")
      .then(({ data }) => setDistricts(data.districts))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!districtId) {
      setMandals([]);
      return undefined;
    }
    let cancelled = false;
    api.get("/masters/mandals", { params: { district_id: districtId } })
      .then(({ data }) => { if (!cancelled) setMandals(data.mandals); })
      .catch(() => setError(true));
    return () => { cancelled = true; };
  }, [districtId]);

  useEffect(() => {
    if (!mandalId) {
      setVillages([]);
      return undefined;
    }
    let cancelled = false;
    api.get("/masters/villages", { params: { mandal_id: mandalId } })
      .then(({ data }) => { if (!cancelled) setVillages(data.villages); })
      .catch(() => setError(true));
    return () => { cancelled = true; };
  }, [mandalId]);

  return { districts, mandals, villages, error };
}
