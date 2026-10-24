import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ChecklistCacheContext,
  UserTaskWithDetails,
} from '@/types/checklist';
import { checklistProvinceKeyPart } from '@/utils/checklistProvince';

const STORAGE_PREFIX = '@checklist_tasks_v1';
export const CHECKLIST_CACHE_TTL_MS = 10 * 60 * 1000;

export function buildChecklistCacheStorageKey({
  userId,
  stage,
  personaSlug,
  stageChanged,
  language,
  province,
}: ChecklistCacheContext): string {
  return `${STORAGE_PREFIX}:${userId}:${stage}:${personaSlug}:${
    stageChanged ? '1' : '0'
  }:${language}:${checklistProvinceKeyPart(province)}`;
}

interface ChecklistCacheEntry {
  savedAt: number;
  tasks: UserTaskWithDetails[];
}

const memory = new Map<string, ChecklistCacheEntry>();

function isFresh(savedAt: number): boolean {
  return Date.now() - savedAt < CHECKLIST_CACHE_TTL_MS;
}

export function getChecklistMemoryCache(
  key: string
): UserTaskWithDetails[] | undefined {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (!isFresh(entry.savedAt)) {
    memory.delete(key);
    return undefined;
  }
  return entry.tasks;
}

export function setChecklistMemoryCache(
  key: string,
  tasks: UserTaskWithDetails[]
): void {
  memory.set(key, { tasks, savedAt: Date.now() });
}

export async function loadChecklistFromDisk(
  key: string
): Promise<UserTaskWithDetails[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ChecklistCacheEntry>;
    if (
      !Array.isArray(parsed.tasks) ||
      typeof parsed.savedAt !== 'number' ||
      !isFresh(parsed.savedAt)
    ) {
      return null;
    }
    return parsed.tasks;
  } catch {
    return null;
  }
}

export async function saveChecklistToDisk(
  key: string,
  tasks: UserTaskWithDetails[]
): Promise<void> {
  try {
    const entry: ChecklistCacheEntry = { tasks, savedAt: Date.now() };
    memory.set(key, entry);
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    console.warn('Failed to persist checklist cache', e);
  }
}
