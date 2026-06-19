import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { migrateMapConfigsToCartoSystem } from "./utils/migration";

// Run one-time data migration before first render
migrateMapConfigsToCartoSystem();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
