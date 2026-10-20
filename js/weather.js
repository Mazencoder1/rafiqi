/*
 * weather.js — الطقس وأوقات الصلاة
 *  - Open-Meteo للطقس والبحث عن المدن (مجاني، بدون مفتاح)
 *  - Aladhan لأوقات الصلاة (طريقة أم القرى)
 *  - كاش في localStorage: لو انقطع النت نعرض آخر نتيجة محفوظة (stale-while-error)
 * فكرة جلب البيانات بـ async/await مستوحاة من مشاريع Weather App مفتوحة المصدر (MIT)؛ الكود مكتوب من جديد.
 */
(() => {
  "use strict";
  const R = window.R;

  const CITIES = [
    { name: "الرياض", lat: 24.7136, lon: 46.6753 },
    { name: "جدة", lat: 21.4858, lon: 39.1925 },
    { name: "مكة المكرمة", lat: 21.3891, lon: 39.8579 },
    { name: "المدينة المنورة", lat: 24.5247, lon: 39.5692 },
    { name: "الدمام", lat: 26.4207, lon: 50.0888 },
    { name: "الخبر", lat: 26.2172, lon: 50.1971 },
    { name: "الطائف", lat: 21.2703, lon: 40.4158 },
    { name: "أبها", lat: 18.2164, lon: 42.5053 },
    { name: "تبوك", lat: 28.3838, lon: 36.555 },
    { name: "بريدة", lat: 26.326, lon: 43.975 },
    { name: "حائل", lat: 27.5114, lon: 41.7208 },
    { name: "جازان", lat: 16.8892, lon: 42.5611 },
    { name: "نجران", lat: 17.4917, lon: 44.1322 },
    { name: "العلا", lat: 26.6085, lon: 37.9232 },
  ];

  // رموز WMO → [وصف بلهجة سعودية، أيقونة نهار، أيقونة ليل]
  const CODES = {
    0: ["صحو وشمس", "☀️", "🌙"], 1: ["الجو صافي تقريباً", "🌤️", "🌙"],
    2: ["غيوم متفرقة", "⛅", "☁️"], 3: ["غيم كثيف", "☁️", "☁️"],
    45: ["ضباب", "🌫️", "🌫️"], 48: ["ضباب كثيف", "🌫️", "🌫️"],
    51: ["رذاذ خفيف", "🌦️", "🌧️"], 53: ["رذاذ", "🌦️", "🌧️"], 55: ["رذاذ كثيف", "🌧️", "🌧️"],
    61: ["مطر خفيف", "🌧️", "🌧️"], 63: ["مطر", "🌧️", "🌧️"], 65: ["مطر غزير، الله يجعله خير", "🌧️", "🌧️"],
    71: ["ثلج خفيف", "🌨️", "🌨️"], 73: ["ثلج", "🌨️", "🌨️"], 75: ["ثلج كثيف", "❄️", "❄️"],
    80: ["زخات مطر", "🌦️", "🌧️"], 81: ["زخات مطر قوية", "🌧️", "🌧️"], 82: ["زخات عنيفة", "⛈️", "⛈️"],
    95: ["رعد وبرق", "⛈️", "⛈️"], 96: ["رعد وبرد", "⛈️", "⛈️"], 99: ["رعد وبرد قوي", "⛈️", "⛈️"],
  };
  const RAINY = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);

  function describe(code, isDay = 1) {
    const e = CODES[code] || ["جو متقلب", "🌡️", "🌡️"];
    return { text: e[0], icon: isDay ? e[1] : e[2] };
  }

  function advice({ temp, code }) {
    if (RAINY.has(code)) return "فيه مطر، لا تنسى المظلة وانتبه من الطرق الزلقة والسيول 🌧️";
    if (temp >= 45) return "الجو نار! لا تطلع إلا للضرورة وخذ لك مي كثير 🥵";
    if (temp >= 38) return "حر مرة، اشرب مي وخلك بالظل وقت الظهيرة ☀️";
    if (temp >= 30) return "الجو دافي وحلو للطلعات، بس لا تنسى المي 💧";
    if (temp >= 20) return "الجو معتدل ومُنعش، يا حليله! 😎";
    if (temp >= 12) return "فيه برودة خفيفة، خذ لك جاكيت وقت العصر 🧥";
    if (temp >= 5) return "الجو بارد، البس ثقيل وجيب لك شاهي أو قهوة تدفيك ☕";
    return "برد قارس! دفّي نفسك وشب النار لو بالبر 🔥";
  }

  const windNote = (kmh) => (kmh >= 50 ? "رياح قوية" : kmh >= 30 ? "رياح نشطة" : kmh >= 15 ? "هواء خفيف" : "هادي");

  async function fetchJson(url, { timeout = 10000 } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // كاش مع رجوع للنسخة القديمة عند فشل الشبكة
  async function cached(key, ttl, loader) {
    const hit = R.storage.get(key, null);
    if (hit && Date.now() - hit.t < ttl) return { data: hit.d, stale: false };
    try {
      const d = await loader();
      R.storage.set(key, { t: Date.now(), d });
      return { data: d, stale: false };
    } catch (err) {
      if (hit) return { data: hit.d, stale: true };
      throw err;
    }
  }

  const coordKey = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

  async function search(query) {
    const url = "https://geocoding-api.open-meteo.com/v1/search?count=5&language=ar&format=json&name=" + encodeURIComponent(query);
    const data = await fetchJson(url);
    return (data.results || []).map((r) => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join("، "),
      lat: r.latitude,
      lon: r.longitude,
    }));
  }

  function forecast(lat, lon) {
    return cached(`wx:${coordKey(lat, lon)}`, 30 * 60 * 1000, () => {
      const params = new URLSearchParams({
        latitude: lat, longitude: lon,
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day",
        hourly: "temperature_2m,weather_code,is_day",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        timezone: "auto", forecast_days: "7",
      });
      return fetchJson("https://api.open-meteo.com/v1/forecast?" + params);
    });
  }

  const cleanTime = (s) => String(s).split(" ")[0];

  function prayer(lat, lon, iso = R.date.todayISO()) {
    return cached(`pray:${coordKey(lat, lon)}:${iso}`, 12 * 3600 * 1000, async () => {
      const [y, m, d] = iso.split("-");
      const json = await fetchJson(`https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${lat}&longitude=${lon}&method=4`);
      const t = json.data.timings;
      return Object.fromEntries(["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"].map((k) => [k, cleanTime(t[k])]));
    });
  }

  const PRAYERS = [["Fajr", "الفجر"], ["Dhuhr", "الظهر"], ["Asr", "العصر"], ["Maghrib", "المغرب"], ["Isha", "العشاء"]];

  function nextPrayer(timings, now = new Date()) {
    const at = (hhmm, addDays = 0) => {
      const [h, m] = hhmm.split(":").map(Number);
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      d.setDate(d.getDate() + addDays);
      return d;
    };
    for (const [key, label] of PRAYERS) {
      const time = at(timings[key]);
      if (time > now) return { key, label, time, minutes: (time - now) / 60000, tomorrow: false };
    }
    const time = at(timings.Fajr, 1);
    return { key: "Fajr", label: "الفجر", time, minutes: (time - now) / 60000, tomorrow: true };
  }

  R.weather = { cities: CITIES, prayers: PRAYERS, describe, advice, windNote, search, forecast, prayer, nextPrayer };
})();
