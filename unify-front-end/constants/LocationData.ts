import {
  PROVINCES,
  normalizeProvince,
  resolveUserProvince,
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

// The normalizer lives with the province list so the Learn edge function and
// the app share one implementation. Re-exported for existing callers.
export { normalizeProvince, resolveUserProvince };
