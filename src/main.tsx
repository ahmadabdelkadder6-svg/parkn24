import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// ✅ مش محتاج fetchAll هنا - App.tsx بيعملها في useEffect
// ✅ مش محتاج setupRealtime هنا - App.tsx بيعملها بعد fetchAll

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error("❌ Root element not found!");
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}