export const SANITY_LANGUAGES = [
  'en',
  'vi',
  'es',
  'hi',
  'ar',
  'fr-CA',
  'pa',
] as const;

export type SanityLanguage = (typeof SANITY_LANGUAGES)[number];

/** Resolve regional UI locales to available Sanity translation keys. */
export function normalizeSanityLanguage(
  language: string | null | undefined
): SanityLanguage {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) return 'en';
  if (normalized === 'fr' || normalized.startsWith('fr-')) return 'fr-CA';
  if (normalized === 'vi' || normalized.startsWith('vi-')) return 'vi';
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es';
  if (normalized === 'hi' || normalized.startsWith('hi-')) return 'hi';
  if (normalized === 'ar' || normalized.startsWith('ar-')) return 'ar';
  if (normalized === 'pa' || normalized.startsWith('pa-')) return 'pa';
  return 'en';
}

export type WithI18n<T> = T & {
  i18n?: { [Key in keyof T]?: T[Key] | null } | null;
};

const IDENTITY_FIELDS = new Set(['_id', '_type', '_key']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isKeyedItem(value: unknown): value is Record<string, unknown> & {
  _key: string;
} {
  return isRecord(value) && typeof value._key === 'string';
}

/**
 * Merge translated data into base content without letting a translation alter
 * keyed Sanity structure. Base order and `_key`s remain authoritative because
 * progress, saved answers and resume positions persist those identities.
 */
function mergeTranslatedValue(base: unknown, translated: unknown): unknown {
  if (translated === null || translated === undefined) return base;

  if (Array.isArray(base)) {
    if (!Array.isArray(translated)) return base;
    if (base.every(isKeyedItem)) {
      const translatedByKey = new Map(
        translated.filter(isKeyedItem).map(item => [item._key, item])
      );
      return base.map(item => {
        const translatedItem = translatedByKey.get(item._key);
        return translatedItem
          ? mergeTranslatedValue(item, translatedItem)
          : item;
      });
    }
    return translated;
  }

  if (Array.isArray(translated)) return base;

  if (isRecord(base)) {
    if (!isRecord(translated)) return base;
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(translated)) {
      if (IDENTITY_FIELDS.has(key) || value === null || value === undefined) {
        continue;
      }
      merged[key] = mergeTranslatedValue(base[key], value);
    }
    return merged;
  }

  if (isRecord(translated)) return base;

  return translated;
}

/** Overlay translated fields while preserving all base document identities. */
export function mergeI18nOverlay<T extends object>(row: WithI18n<T>): T {
  const { i18n, ...base } = row;
  if (!i18n) return base as unknown as T;
  return mergeTranslatedValue(base, i18n) as T;
}

/** Filter listings to English/legacy docs so translations cannot duplicate rows. */
export const BASE_LANGUAGE_FILTER = '(language == "en" || !defined(language))';

export const i18nOverlay = (fields: string) =>
  `"i18n": select($lang != "en" => *[_type == "translation.metadata" && references(^._id)][0].translations[_key == $lang][0].value->{ ${fields} }, null)`;
