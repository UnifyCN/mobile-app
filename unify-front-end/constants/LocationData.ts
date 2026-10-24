import {
  PROVINCES,
  toKnownProvince,
  type Province,
} from '@/supabase/functions/_shared/province';

// Top 20 Canadian cities + provinces + "Other (specify)"
export const CANADIAN_CITIES = [
  'Toronto',
  'Vancouver',
  'Montreal',
  'Calgary',
  'Edmonton',
  'Ottawa',
  'Winnipeg',
  'Quebec City',
  'Hamilton',
  'Halifax',
  'Victoria',
  'Saskatoon',
  'Regina',
  "St. John's",
  'Kelowna',
  'London',
  'Kitchener',
  'Windsor',
  'Oshawa',
  'Barrie',
];

// Province mapping for each city
const CITY_TO_PROVINCE: Record<string, string> = {
  'Toronto': 'Ontario',
  'Vancouver': 'British Columbia',
  'Montreal': 'Quebec',
  'Calgary': 'Alberta',
  'Edmonton': 'Alberta',
  'Ottawa': 'Ontario',
  'Winnipeg': 'Manitoba',
  'Quebec City': 'Quebec',
  'Hamilton': 'Ontario',
  'Halifax': 'Nova Scotia',
  'Victoria': 'British Columbia',
  'Saskatoon': 'Saskatchewan',
  'Regina': 'Saskatchewan',
  "St. John's": 'Newfoundland and Labrador',
  'Kelowna': 'British Columbia',
  'London': 'Ontario',
  'Kitchener': 'Ontario',
  'Windsor': 'Ontario',
  'Oshawa': 'Ontario',
  'Barrie': 'Ontario',
};

export const CANADIAN_PROVINCES: string[] = [...PROVINCES];

export const getProvinceForCity = (city: string): string | null => {
  return CITY_TO_PROVINCE[city] || null;
};

export const isValidCity = (city: string): boolean => {
  return CANADIAN_CITIES.includes(city);
};

export const isValidProvince = (province: string): boolean => {
  return CANADIAN_PROVINCES.includes(province);
};

// Postal abbreviations and common spellings that other writers of the shared
// `user_onboarding_profiles` table (the web app, older builds) have stored.
// Analytics showed both "ON" and "Ontario" in production, which splits every
// province breakdown and defeats province-based personalization.
const PROVINCE_ALIASES: Record<string, string> = {
  ab: 'Alberta',
  bc: 'British Columbia',
  mb: 'Manitoba',
  nb: 'New Brunswick',
  nl: 'Newfoundland and Labrador',
  nfld: 'Newfoundland and Labrador',
  newfoundland: 'Newfoundland and Labrador',
  nt: 'Northwest Territories',
  nwt: 'Northwest Territories',
  ns: 'Nova Scotia',
  nu: 'Nunavut',
  on: 'Ontario',
  ont: 'Ontario',
  pe: 'Prince Edward Island',
  pei: 'Prince Edward Island',
  qc: 'Quebec',
  pq: 'Quebec',
  québec: 'Quebec',
  sk: 'Saskatchewan',
  sask: 'Saskatchewan',
  yt: 'Yukon',
  yukon: 'Yukon',
  'yukon territory': 'Yukon',
};

const PROVINCE_BY_LOWER: Record<string, string> = Object.fromEntries(
  CANADIAN_PROVINCES.map(p => [p.toLowerCase(), p])
);

/**
 * Map any stored province value to its canonical full name.
 * Returns the trimmed input unchanged when it is not recognised, so a value
 * a user typed for "Other" is never silently dropped. Null/empty stays null.
 */
export const normalizeProvince = (
  province: string | null | undefined
): string | null => {
  if (province == null) return null;
  const trimmed = province.trim();
  if (trimmed === '') return null;
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
  return PROVINCE_BY_LOWER[key] ?? PROVINCE_ALIASES[key] ?? trimmed;
};

/**
 * The province a stored profile value stands for, or null when it is not one of
 * the 13 (null, blank, or free text typed for "Other"). Use this, not
 * `normalizeProvince`, wherever the value decides which content shows.
 */
export const resolveUserProvince = (
  province: string | null | undefined
): Province | null => toKnownProvince(normalizeProvince(province));
