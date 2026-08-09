{/* التكلفة الكبيرة - Premium Edition */}
<div
  className="relative overflow-hidden rounded-3xl p-6 mb-4 text-center"
  style={{
    background: 'linear-gradient(145deg, #0C1222 0%, #0A0F1E 50%, #0D1527 100%)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
  }}
>
  {/* خلفية لمعة متحركة */}
  <div
    className="absolute -top-20 -right-20"
    style={{
      width: 200,
      height: 200,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)',
      filter: 'blur(30px)',
    }}
  />
  <div
    className="absolute -bottom-10 -left-10"
    style={{
      width: 150,
      height: 150,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
      filter: 'blur(20px)',
    }}
  />

  {/* أيقونة ذهبية */}
  <div
    className="relative z-10 mx-auto mb-3"
    style={{
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #D4AF37 0%, #F5D060 50%, #D4AF37 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
    }}
  >
    <span style={{ fontSize: 20 }}>💰</span>
  </div>

  {/* العنوان */}
  <div
    className="relative z-10 mb-4"
    style={{
      fontSize: 22,
      fontWeight: 900,
      letterSpacing: '1px',
      background: 'linear-gradient(135deg, #FFFFFF 0%, #D4AF37 50%, #FFFFFF 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      textShadow: 'none',
    }}
  >
    إجمالي المستحق
  </div>

  {/* خط فاصل ذهبي */}
  <div
    className="relative z-10 mx-auto mb-4"
    style={{
      width: 60,
      height: 2,
      borderRadius: 999,
      background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)',
    }}
  />

  {/* المبلغ الرئيسي */}
  <div className="relative z-10 flex items-end justify-center gap-3 mb-2">
    <span
      className="font-mono"
      style={{
        fontSize: 64,
        fontWeight: 900,
        lineHeight: 1,
        color: '#FFFFFF',
        textShadow: '0 0 30px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.3)',
        letterSpacing: '-2px',
      }}
    >
      {cost.toFixed(0)}
    </span>
    <span
      style={{
        fontSize: 24,
        fontWeight: 800,
        color: '#D4AF37',
        marginBottom: 8,
        textShadow: '0 0 10px rgba(212,175,55,0.3)',
      }}
    >
      ج.م
    </span>
  </div>

  {/* جنيه مصري */}
  <div
    className="relative z-10"
    style={{
      fontSize: 12,
      fontWeight: 700,
      color: 'rgba(255,255,255,0.35)',
      letterSpacing: '3px',
      marginBottom: 8,
    }}
  >
    جنيه مصري
  </div>

  {/* خط سفلي ذهبي */}
  <div
    className="relative z-10 mx-auto"
    style={{
      width: 120,
      height: 3,
      borderRadius: 999,
      background: 'linear-gradient(90deg, transparent, #D4AF37, #F5D060, #D4AF37, transparent)',
      opacity: 0.7,
    }}
  />
</div>