// '실제 시간' 모드: 한국(서울) 시각과 그날의 해 뜨고 지는 시각으로 하늘을 정합니다.
// 사용자 컴퓨터가 어느 나라 시간으로 맞춰져 있어도 항상 서울 기준입니다.
const LAT = 37.5665, LON = 126.978; // 서울
const TZ = 9; // 한국은 일 년 내내 UTC+9 (서머타임 없음)

// 서울의 지금 날짜와 시각(0~24, 소수)
export function seoulNow(date = new Date()) {
  const k = new Date(date.getTime() + TZ * 3600 * 1000); // UTC에 9시간을 더하면 서울 시각
  return {
    year: k.getUTCFullYear(), month: k.getUTCMonth() + 1, day: k.getUTCDate(),
    hours: k.getUTCHours() + k.getUTCMinutes() / 60 + k.getUTCSeconds() / 3600,
  };
}

// 해 뜨는 시각·지는 시각·한낮(서울 시각, 시간 단위). 미국 해양대기청(NOAA)의 간단한 계산식.
export function sunTimes(year, month, day) {
  const rad = Math.PI / 180;
  const start = Date.UTC(year, 0, 1);
  const n = (Date.UTC(year, month - 1, day) - start) / 86400000 + 1; // 1월 1일부터 며칠째
  const g = (2 * Math.PI / 365) * (n - 1);
  // 균시차(분)와 태양 적위(라디안)
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosH = (Math.cos(90.833 * rad) - Math.sin(LAT * rad) * Math.sin(decl)) / (Math.cos(LAT * rad) * Math.cos(decl));
  const ha = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad; // 도
  const noon = (720 - 4 * LON - eqt) / 60 + TZ;
  return { sunrise: noon - (ha * 4) / 60, sunset: noon + (ha * 4) / 60, noon };
}

// 실제 시각을 하늘 색표(palette.js의 SKY_KEYS) 시각으로 바꾸기.
// 하늘 색표는 '해 뜸 ≈ 6.5시, 한낮 12.5시, 해 짐 ≈ 19.2시'로 만들어져 있어서,
// 계절마다 다른 실제 해 뜸·해 짐을 그 자리에 맞춰 늘이거나 줄입니다.
const SKY_SUNRISE = 6.5, SKY_NOON = 12.5, SKY_SUNSET = 19.2;
export function skyTimeFor(hours, sun) {
  const seg = (h, a, b, A, B) => A + ((h - a) / (b - a)) * (B - A);
  if (hours < sun.sunrise) return seg(hours, 0, sun.sunrise, 0, SKY_SUNRISE);
  if (hours < sun.noon) return seg(hours, sun.sunrise, sun.noon, SKY_SUNRISE, SKY_NOON);
  if (hours < sun.sunset) return seg(hours, sun.noon, sun.sunset, SKY_NOON, SKY_SUNSET);
  return seg(hours, sun.sunset, 24, SKY_SUNSET, 24);
}

export function fmt(h) {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
