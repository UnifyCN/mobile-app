import { sanityClient } from '../../sanity-custom';
import { SanityChecklistItem } from '@/types/checklist';
import {
  i18nOverlay,
  mergeI18nOverlay,
  type SanityLanguage,
  type WithI18n,
} from './i18n';
import {
  checklistProvinceKeyPart,
  checklistProvinceParam,
} from '@/utils/checklistProvince';

/**
 * GROQ: checklist items where user's persona is in item's personas array
 * and user's stage matches item's stage. Order by class then class_order.
 * Items with no province are national and show to everyone; an item with a
 * province shows only to users in that province.
 * Params: $persona (slug from Supabase), $stage (slug from Supabase),
 * $province (canonical name, or an empty string when the user has none).
 */
const CHECKLIST_QUERY = `*[
  _type == "checklist"
  && (language == "en" || !defined(language))
  && $persona in personas
  && stage == $stage
  && (!defined(province) || province == "" || province == $province)
] | order(class asc, class_order asc) {
  _id,
  _type,
  title,
  description,
  longer_description,
  class,
  class_order,
  link_tab,
  ${i18nOverlay('title, description, longer_description')},
  "module": module-> { _id, title, province },
  "submodule": submodule-> { _id, title, "moduleId": module._ref, "moduleProvince": module->province }
}`;

const CACHE_KEY = (
  persona: string,
  stageSlug: string,
  language: SanityLanguage,
  province: string | null | undefined
) =>
  `checklist:${persona}:${stageSlug}:${language}:${checklistProvinceKeyPart(province)}`;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cache: {
  key: string;
  data: SanityChecklistItem[];
  ts: number;
} | null = null;

export async function getChecklistByPersonaAndStage(
  persona: string,
  stageSlug: string,
  options?: {
    skipCache?: boolean;
    language?: SanityLanguage;
    province?: string | null;
  }
): Promise<SanityChecklistItem[]> {
  const language = options?.language ?? 'en';
  const key = CACHE_KEY(persona, stageSlug, language, options?.province);
  const now = Date.now();

  if (
    !options?.skipCache &&
    cache?.key === key &&
    now - cache.ts < CACHE_TTL_MS
  ) {
    return cache.data;
  }

  try {
    const result = await sanityClient.fetch<WithI18n<SanityChecklistItem>[]>(
      CHECKLIST_QUERY,
      {
        persona,
        stage: stageSlug,
        lang: language,
        province: checklistProvinceParam(options?.province),
      }
    );
    const data = Array.isArray(result) ? result.map(mergeI18nOverlay) : [];
    cache = { key, data, ts: now };
    return data;
  } catch (error) {
    console.error('Error fetching checklist from Sanity:', error);
    if (!options?.skipCache && cache?.key === key) return cache.data;
    // A transport/query failure is not a legitimate empty checklist. Reject so
    // React Query retains hydrated same-language data and does not persist `[]`.
    throw error;
  }
}

export function clearChecklistCache(): void {
  cache = null;
}
