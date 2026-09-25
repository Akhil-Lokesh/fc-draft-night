import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/base.css";
import "./styles/screens.css";
import "./styles/board.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
