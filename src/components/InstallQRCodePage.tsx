import { useMemo, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Copy, QrCode, Shield, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://parkn24.com';

export default function InstallQRCodePage() {
  const qrShieldRef = useRef<HTMLCanvasElement | null>(null);
  const qrAppRef = useRef<HTMLCanvasElement | null>(null);

  const shieldUrl = useMemo(() => `${SITE_URL}/?shield`, []);
  const appUrl = useMemo(() => `${SITE_URL}/install`, []);

  const downloadQR = (ref: React.RefObject<HTMLCanvasElement | null>, name: string) => {
    const canvas = ref.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.png`;
    a.click();
  };

  const copyLink = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`تم نسخ رابط ${label} ✅`);
    } catch {
      toast.error('تعذر نسخ الرابط');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: '#EBF2FF' }}
    >
      <div
        className="w-full max-w-2xl"
        style={{
          background: '#fff',
          borderRadius: 28,
          padding: 24,
          border: '2px solid #D0DCFF',
          boxShadow: '0 8px 32px rgba(0,102,255,0.08)',
        }}
      >
        {/* ═══════════ Header ═══════════ */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <QrCode size={22} style={{ color: '#0066FF' }} />
          <h1 className="font-black" style={{ fontSize: 22, color: '#0A1628' }}>
            باركود Park'n 24
          </h1>
        </div>
        <p className="font-bold mb-6 text-center" style={{ fontSize: 12, color: '#7B8CA6' }}>
          اطبع الباركود المناسب وحطه عند السايس
        </p>

        {/* ═══════════ الـ 2 باركود ═══════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">

          {/* ─── باركود الدرع ─── */}
          <div
            className="text-center"
            style={{
              background: 'linear-gradient(180deg, #F0F4FF 0%, #F8FBFF 100%)',
              borderRadius: 24,
              padding: 20,
              border: '2px solid #D0DCFF',
            }}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <Shield size={18} style={{ color: '#1656b8' }} />
              <span className="font-black" style={{ fontSize: 14, color: '#1656b8' }}>
                🛡️ حماية إضافية
              </span>
            </div>
            <p className="font-bold mb-3" style={{ fontSize: 10, color: '#7B8CA6' }}>
              العميل يمسح → يشوف صفحة الحماية → يحمّل التطبيق
            </p>

            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 12,
                border: '2px solid #E0EAFF',
                display: 'inline-block',
                marginBottom: 12,
              }}
            >
              <QRCodeCanvas
                value={shieldUrl}
                size={180}
                level="H"
                includeMargin
                bgColor="#ffffff"
                fgColor="#1656b8"
                ref={qrShieldRef}
              />
            </div>

            <div
              className="mb-3"
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: 8,
                border: '1.5px solid #E0EAFF',
                wordBreak: 'break-all',
              }}
            >
              <div className="font-mono font-black" style={{ fontSize: 10, color: '#1656b8' }}>
                {shieldUrl}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => downloadQR(qrShieldRef, 'parkn24-shield-qr')}
                className="font-black flex items-center justify-center gap-1 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #1656b8, #0f3d85)',
                  color: '#fff',
                  padding: '10px 0',
                  borderRadius: 14,
                  fontSize: 11,
                  boxShadow: '0 4px 12px rgba(22,86,184,0.25)',
                }}
              >
                <Download size={14} />
                تنزيل
              </button>
              <button
                onClick={() => copyLink(shieldUrl, 'الدرع')}
                className="font-black flex items-center justify-center gap-1 active:scale-95"
                style={{
                  background: '#F0F4FF',
                  color: '#475569',
                  padding: '10px 0',
                  borderRadius: 14,
                  fontSize: 11,
                  border: '2px solid #D0DCFF',
                }}
              >
                <Copy size={14} />
                نسخ
              </button>
            </div>
          </div>

          {/* ─── باركود التطبيق ─── */}
          <div
            className="text-center"
            style={{
              background: 'linear-gradient(180deg, #F0FFF4 0%, #F8FFF8 100%)',
              borderRadius: 24,
              padding: 20,
              border: '2px solid #BBF7D0',
            }}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <Smartphone size={18} style={{ color: '#16a34a' }} />
              <span className="font-black" style={{ fontSize: 14, color: '#16a34a' }}>
                📲 تحميل التطبيق
              </span>
            </div>
            <p className="font-bold mb-3" style={{ fontSize: 10, color: '#7B8CA6' }}>
              العميل يمسح → يفتح صفحة التثبيت مباشرة
            </p>

            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 12,
                border: '2px solid #D1FAE5',
                display: 'inline-block',
                marginBottom: 12,
              }}
            >
              <QRCodeCanvas
                value={appUrl}
                size={180}
                level="H"
                includeMargin
                bgColor="#ffffff"
                fgColor="#16a34a"
                ref={qrAppRef}
              />
            </div>

            <div
              className="mb-3"
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: 8,
                border: '1.5px solid #D1FAE5',
                wordBreak: 'break-all',
              }}
            >
              <div className="font-mono font-black" style={{ fontSize: 10, color: '#16a34a' }}>
                {appUrl}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => downloadQR(qrAppRef, 'parkn24-app-qr')}
                className="font-black flex items-center justify-center gap-1 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #16a34a, #15803d)',
                  color: '#fff',
                  padding: '10px 0',
                  borderRadius: 14,
                  fontSize: 11,
                  boxShadow: '0 4px 12px rgba(22,163,74,0.25)',
                }}
              >
                <Download size={14} />
                تنزيل
              </button>
              <button
                onClick={() => copyLink(appUrl, 'التطبيق')}
                className="font-black flex items-center justify-center gap-1 active:scale-95"
                style={{
                  background: '#F0FFF4',
                  color: '#475569',
                  padding: '10px 0',
                  borderRadius: 14,
                  fontSize: 11,
                  border: '2px solid #BBF7D0',
                }}
              >
                <Copy size={14} />
                نسخ
              </button>
            </div>
          </div>
        </div>

        {/* ═══════════ ملاحظات ═══════════ */}
        <div
          style={{
            background: '#FFF8F0',
            borderRadius: 18,
            padding: 14,
            border: '1.5px solid #FFD180',
          }}
        >
          <div className="font-black mb-2" style={{ fontSize: 12, color: '#FF8800' }}>
            💡 نصائح للطباعة:
          </div>
          <ul style={{ fontSize: 11, color: '#7B8CA6', lineHeight: 1.9 }}>
            <li>• اطبع الباركودين على ورقة واحدة وحطها عند السايس</li>
            <li>• باركود الدرع 🔵 = تسويق للحماية (بيجذب العميل)</li>
            <li>• باركود التطبيق 🟢 = تحميل مباشر</li>
            <li>• Android: يفضّل المسح بالكاميرا ويفتح في Chrome</li>
            <li>• iPhone: يفضّل الفتح في Safari</li>
          </ul>
        </div>
      </div>
    </div>
  );
}