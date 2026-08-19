import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from './lib/pushManager';

// ✅ تسجيل SW بعد تحميل الصفحة مع force update check
window.addEventListener('load', async () => {
  const reg = await registerServiceWorker();

  if (reg) {
    // ✅ تحقق من وجود update للـ SW بعد كل deploy
    try {
      await reg.update();
      console.log('✅ SW update check done');
    } catch (e) {
      console.warn('⚠️ SW update check failed:', e);
    }

    // ✅ لو فيه SW جديد جاهز - حمّله فوراً
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('🔄 SW جديد متاح - سيتم التفعيل عند إعادة الفتح');
        }
        if (newWorker.state === 'activated') {
          console.log('✅ SW الجديد فعّال');
        }
      });
    });
  }
});

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