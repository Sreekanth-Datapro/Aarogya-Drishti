import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { normalizeLanguage, translate, translateMessage } from "./translate";

const STORAGE_KEY = "language";

// t("login.title")                       -> text for a translation key
// t("roleManagement.created", { code })  -> fills in {code}
// tm(message)                            -> a message kept in state: a translation key or a server message
function makeHelpers(language) {
  return {
    t: (key, values) => translate(language, key, values),
    tm: (message, values) => translateMessage(language, message, values),
  };
}

// Default value means components still work without the provider (e.g. in tests).
const LanguageContext = createContext({
  language: "en",
  setLanguage: () => {},
  ...makeHelpers("en"),
});

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(
    () => normalizeLanguage(localStorage.getItem(STORAGE_KEY))
  );
  const helpers = useMemo(() => makeHelpers(language), [language]);

  // Remember the choice and tell the browser which language the page is in
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.title = translate(language, "common.appName");
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage: (next) => setLanguage(normalizeLanguage(next)), ...helpers }),
    [language, helpers]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
