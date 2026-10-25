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

type Annotation = Record<string, unknown> & { _key: string; _type: string };

const TEXT_DECORATORS = new Set([
  'strong',
  'em',
  'code',
  'underline',
  'strike-through',
]);

function isAnnotation(value: unknown): value is Annotation {
  return (
    isKeyedItem(value) &&
    typeof value._type === 'string' &&
    (value._type !== 'link' ||
      (typeof value.href === 'string' && value.href.length > 0))
  );
}

function mergeAnnotations(base: unknown, translated: unknown): Annotation[] {
  const definitions = new Map<string, Annotation>();
  if (Array.isArray(base))
    for (const definition of base.filter(isAnnotation))
      definitions.set(definition._key, definition);
  if (Array.isArray(translated) && translated.every(isAnnotation)) {
    for (const definition of translated)
      definitions.set(definition._key, definition);
  }
  return [...definitions.values()];
}

function hasTranslatedSpans(
  block: Record<string, unknown>,
  annotations: Annotation[]
): boolean {
  const children = block.children;
  const annotationKeys = new Set(
    annotations.map(definition => definition._key)
  );
  return (
    Array.isArray(children) &&
    children.length > 0 &&
    children.every(
      span =>
        isKeyedItem(span) &&
        span._type === 'span' &&
        typeof span.text === 'string' &&
        (span.marks === undefined ||
          (Array.isArray(span.marks) &&
            span.marks.every(
              mark =>
                typeof mark === 'string' &&
                (TEXT_DECORATORS.has(mark) || annotationKeys.has(mark))
            )))
    ) &&
    (block.markDefs === undefined ||
      (Array.isArray(block.markDefs) && block.markDefs.every(isAnnotation)))
  );
}

/**
 * Merge translated data into base content without letting a translation alter
 * page, block or response structure. Their base order and keys remain
 * authoritative for progress, saved answers and resume positions.
 * Portable Text spans and their annotations belong to the translated paragraph.
 */
function mergeTranslatedValue(
  base: unknown,
  translated: unknown,
  inheritedAnnotations: Annotation[] = []
): unknown {
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
          ? mergeTranslatedValue(item, translatedItem, inheritedAnnotations)
          : item;
      });
    }
    return translated;
  }

  if (Array.isArray(translated)) return base;

  if (isRecord(base)) {
    if (!isRecord(translated)) return base;
    const isTextBlock = base._type === 'block' && translated._type === 'block';
    const annotations = mergeAnnotations(
      inheritedAnnotations,
      isTextBlock
        ? (translated.markDefs ?? base.markDefs)
        : mergeAnnotations(base.markDefs, translated.markDefs)
    );
    // Span keys and annotations belong to the localized paragraph. Keep them
    // together, while the paragraph and all progress identities keep base keys.
    if (isTextBlock && !hasTranslatedSpans(translated, annotations))
      return base;
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(translated)) {
      if (IDENTITY_FIELDS.has(key) || value === null || value === undefined) {
        continue;
      }
      if (isTextBlock && (key === 'children' || key === 'markDefs')) continue;
      if (key === 'markDefs' || key.endsWith('MarkDefs')) {
        if (Array.isArray(value) && value.every(isAnnotation))
          merged[key] = mergeAnnotations(base[key], value);
        continue;
      }
      const annotationField =
        key === 'question_text' ? 'questionMarkDefs' : `${key}MarkDefs`;
      const fieldAnnotations = [
        'instructions',
        'text',
        'explanation',
        'question_text',
      ].includes(key)
        ? mergeAnnotations(base[annotationField], translated[annotationField])
        : key === 'answer_box'
          ? []
          : annotations;
      merged[key] = mergeTranslatedValue(base[key], value, fieldAnnotations);
    }
    if (isTextBlock) {
      merged.children = translated.children;
      merged.markDefs = translated.markDefs ?? base.markDefs;
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
