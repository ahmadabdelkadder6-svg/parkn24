import { useMemo, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Copy, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';

// ✅ الدومين الحقيقي
const SITE_URL = 'https://parkn24.vercel.app';

export default function InstallQRCodePage() {
  const qrRef = useRef<HTMLCanvasElement | null>(null);

  // ✅ دايمًا يشاور على الدومين الحقيقي مش localhost
  const installUrl = useMemo(() => {
    return `${SITE_URL}/install`;
  }, []);

  const downloadQR = () => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'parkn24-install-qr.png';
    a.click();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(installUrl);
      toast.success('تم نسخ الرابط ✅');
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
        className="w-full max-w-md text-center"
        style={{
          background: '#fff',
          borderRadius: 28,
          padding: 24,
          border: '2px solid #D0DCFF',
          boxShadow: '0 8px 32px rgba(0,102,255,0.08)',
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-4">
          <QrCode size={22} style={{ color: '#0066FF' }} />
          <h1 className="font-black" style={{ fontSize: 22, color: '#0A1628' }}>
            QR تثبيت التطبيق
          </h1>
        </div>

        <p className="font-bold mb-5" style={{ fontSize: 12, color: '#7B8CA6' }}>
          امسح الكود بالموبايل لفتح صفحة التثبيت مباشرة
        </p>

        <div
          style={{
            background: '#F8FBFF',
            borderRadius: 24,
            padding: 20,
            border: '2px solid #E0EAFF',
            marginBottom: 16,
          }}
        >
          <QRCodeCanvas
            value={installUrl}
            size={240}
            level="H"
            includeMargin
            bgColor="#ffffff"
            fgColor="#0A1628"
            ref={qrRef}
          />
        </div>

        <div
          className="mb-4"
          style={{
            background: '#F0F4FF',
            borderRadius: 16,
            padding: 12,
            border: '1.5px solid #D0DCFF',
            wordBreak: 'break-all',
          }}
        >
          <div className="font-bold mb-1" style={{ fontSize: 10, color: '#94a3b8' }}>
            رابط التثبيت
          </div>
          <div className="font-mono font-black" style={{ fontSize: 12, color: '#0066FF' }}>
            {installUrl}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={downloadQR}
            className="font-black flex items-center justify-center gap-2 active:scale-95"
            style={{
              background: 'linear-gradient(135deg,#0066FF,#4D00FF)',
              color: '#fff',
              padding: '14px 0',
              borderRadius: 18,
              fontSize: 13,
              boxShadow: '0 6px 20px rgba(0,102,255,0.25)',
            }}
          >
            <Download size={16} />
            تنزيل QR
          </button>

          <button
            onClick={copyLink}
            className="font-black flex items-center justify-center gap-2 active:scale-95"
            style={{
              background: '#F0F4FF',
              color: '#475569',
              padding: '14px 0',
              borderRadius: 18,
              fontSize: 13,
              border: '2px solid #D0DCFF',
            }}
          >
            <Copy size={16} />
            نسخ الرابط
          </button>
        </div>

        <div
          className="text-right"
          style={{
            background: '#FFF8F0',
            borderRadius: 18,
            padding: 14,
            border: '1.5px solid #FFD180',
          }}
        >
          <div className="font-black mb-2" style={{ fontSize: 12, color: '#FF8800' }}>
            ملاحظات مهمة:
          </div>
          <ul style={{ fontSize: 11, color: '#7B8CA6', lineHeight: 1.9 }}>
            <li>• Android: يفضّل المسح بالكاميرا ويفتح في Chrome</li>
            <li>• iPhone: يفضّل الفتح في Safari</li>
            <li>• بعد فتح الصفحة يظهر التثبيت أو خطواته مباشرة</li>
          </ul>
        </div>
      </div>
    </div>
  );
}