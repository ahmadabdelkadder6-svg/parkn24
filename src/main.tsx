import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from './lib/pushManager';

// 🚀 تسجيل وإدارة تحديثات الـ Service Worker بسلاسة وتحديث الكاش تلقائياً
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await registerServiceWorker();

      if (reg) {
        // ✅ فحص وجود تحديث جديد للـ SW فور اكتمال التحميل
        try {
          await reg.update();
        } catch {}

        // ✅ لو فيه SW جديد - اطلب منه التفعيل فوراً وتخطي الانتظار
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // إرسال أمر التفعيل الفوري للكاش الجديد
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      }
    } catch (err) {
      console.warn('⚠️ Service Worker registration skipped:', err);
    }
  });

  // 🔄 إعادة تحميل ذكية لمرة واحدة فقط عند استلام الإصدار الجديد لمنع تعليق الكاش القديم
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

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