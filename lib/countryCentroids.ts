/**
 * Approximate country centroids for fallback when lat/lon are missing but country is known.
 * Used by GDELT ingestion and backfill to set primary_location so the map can plot markers.
 * Confidence should be set to Low when using these.
 */
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  UA: [49.0, 32.0],
  UKR: [49.0, 32.0],
  RU: [60.0, 100.0],
  RUS: [60.0, 100.0],
  SY: [35.0, 38.0],
  SYR: [35.0, 38.0],
  IQ: [33.0, 44.0],
  IRQ: [33.0, 44.0],
  IR: [32.0, 53.0],
  IRN: [32.0, 53.0],
  IL: [31.5, 34.75],
  ISR: [31.5, 34.75],
  PS: [31.5, 34.45],
  PSE: [31.5, 34.45],
  AF: [33.0, 65.0],
  AFG: [33.0, 65.0],
  YE: [15.5, 48.0],
  YEM: [15.5, 48.0],
  LY: [27.0, 17.0],
  LBY: [27.0, 17.0],
  EG: [27.0, 30.0],
  EGY: [27.0, 30.0],
  TR: [39.0, 35.0],
  TUR: [39.0, 35.0],
  SA: [25.0, 45.0],
  SAU: [25.0, 45.0],
  DE: [51.0, 10.0],
  DEU: [51.0, 10.0],
  FR: [46.0, 2.0],
  FRA: [46.0, 2.0],
  US: [38.0, -97.0],
  USA: [38.0, -97.0],
  CN: [35.0, 105.0],
  CHN: [35.0, 105.0],
  IN: [20.0, 77.0],
  IND: [20.0, 77.0],
  PK: [30.0, 70.0],
  PAK: [30.0, 70.0],
  NG: [10.0, 8.0],
  NGA: [10.0, 8.0],
  ET: [9.0, 40.0],
  ETH: [9.0, 40.0],
  SD: [15.0, 30.0],
  SDN: [15.0, 30.0],
  SS: [7.0, 30.0],
  SSD: [7.0, 30.0],
  MM: [21.0, 96.0],
  MMR: [21.0, 96.0],
  GB: [54.0, -2.0],
  GBR: [54.0, -2.0],
  JP: [36.0, 138.0],
  JPN: [36.0, 138.0],
  KR: [36.5, 127.5],
  KOR: [36.5, 127.5],
  MX: [23.0, -102.0],
  MEX: [23.0, -102.0],
  BR: [-10.0, -55.0],
  BRA: [-10.0, -55.0],
  CO: [4.0, -72.0],
  COL: [4.0, -72.0],
  PL: [52.0, 19.0],
  POL: [52.0, 19.0],
  VE: [8.0, -66.0],
  VEN: [8.0, -66.0],
};

/** Normalize country code to uppercase; accept 2- or 3-letter. Returns null if empty. */
export function normalizeCountryCode(code: string | null | undefined): string | null {
  const s = code?.trim().toUpperCase();
  if (!s || s.length < 2) return null;
  return s.length > 3 ? s.slice(0, 3) : s;
}

/** Get [lat, lon] for a country code (2- or 3-letter). Returns null if unknown. */
export function getCountryCentroid(countryCode: string | null | undefined): [number, number] | null {
  const key = normalizeCountryCode(countryCode);
  if (!key) return null;
  return COUNTRY_CENTROIDS[key] ?? COUNTRY_CENTROIDS[key.slice(0, 2)] ?? null;
}

/** Format centroid as primary_location string "lat,lon". */
export function centroidToPrimaryLocation(centroid: [number, number]): string {
  return `${centroid[0]},${centroid[1]}`;
}

/**
 * Infer country code from title/description for backfill when country_code is missing.
 * Returns 2-letter code or null. Used only when country_code is not in DB.
 */
const TITLE_COUNTRY_HINTS: { pattern: RegExp; code: string }[] = [
  { pattern: /\bukraine\b|\bkharkiv\b|\bkyiv\b|\bdonbas\b/i, code: "UA" },
  { pattern: /\brussia\b|\bmoscow\b|\brussian\b/i, code: "RU" },
  { pattern: /\bgaza\b|\bpalestine\b|\bwest bank\b/i, code: "PS" },
  { pattern: /\bisrael\b|\btel aviv\b|\bjerusalem\b/i, code: "IL" },
  { pattern: /\biran\b|\btehran\b|\biranian\b/i, code: "IR" },
  { pattern: /\bsyria\b|\bdamascus\b|\bsyrian\b/i, code: "SY" },
  { pattern: /\biraq\b|\bbaghdad\b|\biraqi\b/i, code: "IQ" },
  { pattern: /\byemen\b|\bsanaa\b/i, code: "YE" },
  { pattern: /\bafghanistan\b|\bkabul\b/i, code: "AF" },
  { pattern: /\blibya\b|\btripoli\b/i, code: "LY" },
  { pattern: /\begypt\b|\bcairo\b|\begyptian\b/i, code: "EG" },
  { pattern: /\bturkey\b|\btürkiye\b|\bistanbul\b|\bturkish\b/i, code: "TR" },
  { pattern: /\bsaudi\b|\briyadh\b/i, code: "SA" },
  { pattern: /\bethiopia\b|\baddis ababa\b/i, code: "ET" },
  { pattern: /\bsudan\b|\bkhartoum\b/i, code: "SD" },
  { pattern: /\bmyanmar\b|\bburma\b|\byangon\b/i, code: "MM" },
  { pattern: /\bnigeria\b|\blagos\b|\babuja\b/i, code: "NG" },
  { pattern: /\bpakistan\b|\bislamabad\b|\bkarachi\b/i, code: "PK" },
  { pattern: /\bindia\b|\bnew delhi\b|\bmumbai\b/i, code: "IN" },
  { pattern: /\bchina\b|\bbeijing\b|\bchinese\b/i, code: "CN" },
  { pattern: /\buk\b|\bbritain\b|\blondon\b|\bengland\b|\bscotland\b|\bwales\b/i, code: "GB" },
  { pattern: /\bjapan\b|\btokyo\b|\bosaka\b|\bjapanese\b/i, code: "JP" },
  { pattern: /\bkorea\b|\bseoul\b|\bpyongyang\b/i, code: "KR" },
  { pattern: /\bmexico\b|\bmexican\b|\bciudad\b/i, code: "MX" },
  { pattern: /\bbrazil\b|\bbrasília\b|\bsão paulo\b|\bra de janeiro\b/i, code: "BR" },
  { pattern: /\bcolombia\b|\bbogotá\b|\bmedellín\b/i, code: "CO" },
  { pattern: /\bpoland\b|\bwarsaw\b|\bkrakow\b/i, code: "PL" },
  { pattern: /\bvenezuela\b|\bcaracas\b/i, code: "VE" },
  { pattern: /\bfrance\b|\bparis\b|\bfrench\b/i, code: "FR" },
  { pattern: /\bgermany\b|\bberlin\b|\bmunich\b|\bgerman\b/i, code: "DE" },
];

/** Scan any free text (title, summary, or both) for country/region hints. */
export function inferCountryFromText(text: string | null | undefined): string | null {
  const s = text?.trim();
  if (!s) return null;
  for (const { pattern, code } of TITLE_COUNTRY_HINTS) {
    if (pattern.test(s)) return code;
  }
  return null;
}

export function inferCountryFromTitle(title: string | null | undefined): string | null {
  return inferCountryFromText(title);
}
