import React, { useEffect, useState } from "react";
import { registerServiceWorker } from "../../pwa/registerServiceWorker";
import PwaUpdateBanner from "./PwaUpdateBanner";

/**
 * Registers the production service worker and shows update banners.
 * OfflineBanner lives under AuthProvider (see App.js) so it can show OFFLINE MODE.
 */
export default function PwaProvider({ children }) {
  const [applyUpdate, setApplyUpdate] = useState(null);

  useEffect(() => {
    registerServiceWorker({
      onUpdateAvailable: (apply) => setApplyUpdate(() => apply),
    });
  }, []);

  return (
    <>
      <PwaUpdateBanner
        applyUpdate={applyUpdate}
        onDismiss={() => setApplyUpdate(null)}
      />
      {children}
    </>
  );
}
