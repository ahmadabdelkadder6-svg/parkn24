import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { useStore, setupRealtime } from "./store";

// تحميل البيانات من Supabase عند بدء التطبيق
useStore.getState().fetchAll();

// تفعيل التحديث اللحظي (Realtime)
setupRealtime();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
