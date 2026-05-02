import React from "react";
import ReactDOM from "react-dom/client";
import "./style.css";
import { App } from "./App";
import { ErrorBoundary } from "./ui/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

