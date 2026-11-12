import React from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { FileSignature, ScanEye, Stethoscope } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

const STEPS = [
  { path: "/medical-officer/review", key: "mo.stepReview", icon: Stethoscope },
  { path: "/medical-officer/images", key: "mo.stepImages", icon: ScanEye },
  { path: "/medical-officer/notes", key: "mo.stepSignOff", icon: FileSignature },
];

// Review -> Images -> Sign-off for one case; the chosen patient (?patient=) travels with the links
export default function MoCaseSteps() {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const patient = searchParams.get("patient");

  return (
    <nav className="mo-steps" aria-label={t("mo.caseSteps")}>
      <ol>
        {STEPS.map(({ path, key, icon: Icon }, index) => {
          const active = pathname === path;
          return (
            <li key={path}>
              <Link
                to={patient ? `${path}?patient=${encodeURIComponent(patient)}` : path}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
              >
                <span className="mo-step-number">{index + 1}</span>
                <Icon size={16} aria-hidden="true" />
                <span>{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
