import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PwaProvider from "./components/pwa/PwaProvider";
import "./styles/global.css";
import "./styles/theme.css";

const root = ReactDOM.createRoot(
  document.getElementById("root")
);

root.render(
  <React.StrictMode>
    <PwaProvider>
      <App />
    </PwaProvider>
  </React.StrictMode>
);
