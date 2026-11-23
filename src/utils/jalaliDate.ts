/**
 * Exact Jalali (Solar Hijri) <-> Gregorian calendar conversion and bilingual date normalization.
 * Compatible with both browser React components and Node 22 native TypeScript server modules.
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const JALALI_MONTHS_FA = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export function latinizeDigits(input: string): string {
  return String(input).replace(/[۰-۹٠-٩]/g, ch => {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) return String(p);
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) return String(a);
    return ch;
  });
}

export function persianizeDigits(input: string | number): string {
  return String(input).replace(/\d/g, d => PERSIAN_DIGITS[Number(d)] ?? d);
}

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function mod(a: number, b: number): number {
  return a - div(a, b) * b;
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
    2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;

  for (let i = 1; i < breaks.length; i++) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) {
    leapJ += 1;
  }

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) {
    n = n - jump + div(jump + 4, 33) * 33;
  }
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm = 0;
  let jd = 0;

  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function isLeapJalaaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function jalaaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaaliYear(jy) ? 30 : 29;
}

export function isValidJalaaliDate(jy: number, jm: number, jd: number): boolean {
  return (
    jy >= 1200 &&
    jy <= 1600 &&
    jm >= 1 &&
    jm <= 12 &&
    jd >= 1 &&
    jd <= jalaaliMonthLength(jy, jm)
  );
}

export function toGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  return d2g(j2d(jy, jm, jd));
}

export function toJalaali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  return d2j(g2d(gy, gm, gd));
}

export function parseAndNormalizeDate(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? undefined : raw.toISOString().split('T')[0];
  }

  const s = latinizeDigits(String(raw)).trim();
  if (!s) return undefined;

  // Excel serial number
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 90000) {
      const utcMs = (serial - 25569) * 86400 * 1000;
      const d = new Date(utcMs);
      if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  // ISO or YYYY/MM/DD or YYYY-MM-DD (handles both Gregorian and Jalali 1300..1599)
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (y >= 1250 && y <= 1599) {
      if (!isValidJalaaliDate(y, m, d)) return undefined;
      const g = toGregorian(y, m, d);
      return `${String(g.gy).padStart(4, '0')}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
    }
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (!Number.isNaN(dt.getTime()) && dt.getUTCMonth() === m - 1) {
        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    return undefined;
  }

  // DD/MM/YYYY or MM/DD/YYYY (also supports Jalali year in 4th group)
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (dmy) {
    const p1 = Number(dmy[1]);
    const p2 = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (y >= 1250 && y <= 1599) {
      // Assume DD/MM/YYYY if first > 12 or standard Persian DD/MM/YYYY order
      const day = p1 > 12 || p2 <= 12 ? p1 : p2;
      const month = p1 > 12 || p2 <= 12 ? p2 : p1;
      if (!isValidJalaaliDate(y, month, day)) return undefined;
      const g = toGregorian(y, month, day);
      return `${String(g.gy).padStart(4, '0')}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
    }
    const month = p1 > 12 ? p2 : p1;
    const day = p1 > 12 ? p1 : p2;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return undefined;
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return undefined;
}

export function formatJalaliDate(isoOrDate: string | Date | undefined | null, withMonthName = false): string {
  if (!isoOrDate) return '-';
  const dt = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(dt.getTime())) {
    const norm = parseAndNormalizeDate(isoOrDate);
    if (!norm) return String(isoOrDate);
    return formatJalaliDate(new Date(`${norm}T00:00:00Z`), withMonthName);
  }

  const { jy, jm, jd } = toJalaali(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  if (withMonthName) {
    const mName = JALALI_MONTHS_FA[jm - 1] || String(jm);
    return `${persianizeDigits(jd)} ${mName} ${persianizeDigits(jy)}`;
  }
  return persianizeDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

export function formatLocalizedDateOnly(
  isoOrDate: string | Date | undefined | null,
  lang: 'fa' | 'en'
): string {
  if (!isoOrDate) return '-';
  if (lang === 'fa') return formatJalaliDate(isoOrDate, true);
  const dt = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(dt.getTime())) return String(isoOrDate);
  return dt.toISOString().split('T')[0];
}
