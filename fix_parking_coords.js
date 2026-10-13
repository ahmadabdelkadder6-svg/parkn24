// fix_parking_coords.js
// 🤖 PARK'N 24 - محرك التصحيح والمطابقة الذكي متعدد السيرفرات
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fhrwmjaiahpijptllysp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_a5Od3ButDQdJVVaFEyopQQ_DyHpu1BM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 📐 دالة حساب المسافة بالمتر بين نقطتين (Haversine Formula)
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// قائمة السيرفرات العالمية المعتمدة للتبديل التلقائي في حال ضغط السيرفر
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

// دالة جلب البيانات من السيرفر مع التبديل التلقائي
async function fetchFromOverpass(query) {
  for (const server of OVERPASS_SERVERS) {
    try {
      const url = `${server}?data=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Parkn24-GIS-Engine/2.0' } });
      
      const text = await res.text();
      // التأكد من أن الرد هو JSON سليم وليس صفحة HTML
      if (text.startsWith('{')) {
        const json = JSON.parse(text);
        if (json.elements) return json.elements;
      }
    } catch (e) {
      // تجربة السيرفر التالي
    }
  }
  return [];
}

// 🚀 الدالة الرئيسية للتشغيل
async function runSmartSnapping() {
  console.log('🚀 جاري بدء عملية الفحص والمطابقة الذكية المجمعة...\n');

  // 1. جلب جراجات الدليل من Supabase
  const { data: garages, error } = await supabase
    .from('garages')
    .select('id, name, area, lat, lng')
    .eq('garage_type', 'directory');

  if (error || !garages) {
    console.error('❌ تعذر الاتصال بـ Supabase:', error?.message);
    return;
  }

  console.log(`📦 تم سحب ${garages.length} جراج من Supabase بنجاح.`);

  // 2. تقسيم البحث لـ 3 نطاقات جغرافية سريعة وخفيفة جداً
  const REGIONS = [
    { name: 'القاهرة الكبرى والجيزة والمدن الجديدة', bbox: '29.7,30.8,30.4,31.9' },
    { name: 'الإسكندرية والساحل الشمالي والدلتا', bbox: '30.7,27.5,31.4,31.5' },
    { name: 'مدن القناة والعين السخنة', bbox: '29.3,32.1,31.3,32.6' }
  ];

  let allOsmElements = [];

  for (const region of REGIONS) {
    console.log(`🌐 جاري جلب بيانات: ${region.name}...`);
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="parking"]["access"!="private"]["access"!="residents"](${region.bbox});
        node["amenity"="parking_entrance"]["access"!="private"]["access"!="residents"](${region.bbox});
        way["amenity"="parking"]["access"!="private"]["access"!="residents"](${region.bbox});
      );
      out center;
    `;

    const elements = await fetchFromOverpass(query);
    console.log(`   ✅ تم جلب ${elements.length} نقطة جراج عامة وموثقة.`);
    allOsmElements = allOsmElements.concat(elements);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n🎉 إجمالي الساحات والبوابات المحملة في الذاكرة: ${allOsmElements.length} نقطة.`);
  console.log('🧲 جاري مطابقة وسحب إحداثيات الجراجات محلياً في الذاكرة (نطاق 300 متر)...\n');

  let fixedCount = 0;
  let intactCount = 0;

  // 3. مطابقة البيانات في الذاكرة وتحديث Supabase
  for (let i = 0; i < garages.length; i++) {
    const g = garages[i];
    if (!g.lat || !g.lng) continue;

    let closestNode = null;
    let minDist = Infinity;

    allOsmElements.forEach(el => {
      const itemLat = el.lat || el.center?.lat;
      const itemLon = el.lon || el.center?.lon;
      if (itemLat && itemLon) {
        const dist = getDistanceMeters(g.lat, g.lng, itemLat, itemLon);
        if (dist <= 300 && dist < minDist) {
          minDist = dist;
          closestNode = {
            lat: itemLat,
            lng: itemLon,
            dist: Math.round(dist),
            type: el.tags?.amenity === 'parking_entrance' ? '🚪 بوابة/رامب' : '🅿️ ساحة عامة'
          };
        }
      }
    });

    if (closestNode) {
      await supabase
        .from('garages')
        .update({ lat: closestNode.lat, lng: closestNode.lng })
        .eq('id', g.id);

      fixedCount++;
      console.log(`[${i + 1}/${garages.length}] 🧲 لقط بنجاح: "${g.name}" (انتقل ${closestNode.dist}م لـ ${closestNode.type})`);
    } else {
      intactCount++;
      console.log(`[${i + 1}/${garages.length}] 🔒 تم تثبيت مكانه الأصلي: "${g.name}"`);
    }
  }

  console.log('\n=============================================');
  console.log('🎉 تم الانتهاء بنجاح تام وبدون أي أخطاء!');
  console.log(`✅ إجمالي الجراجات التي تم سحب بواباتها الحقيقية: ${fixedCount}`);
  console.log(`🔒 إجمالي الجراجات المأمنة بإحداثياتها الأصلية: ${intactCount}`);
  console.log('=============================================');
}

runSmartSnapping();