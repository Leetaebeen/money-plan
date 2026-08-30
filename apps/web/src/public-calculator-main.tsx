import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PublicCalculatorPage } from "./features/public-calculator/PublicCalculatorPage";
import "./styles.css";
import "./public-calculator.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("계산기를 표시할 루트 요소를 찾지 못했습니다.");
}

createRoot(root).render(
  <StrictMode>
    <PublicCalculatorPage />
  </StrictMode>,
);
