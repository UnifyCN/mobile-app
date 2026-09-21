import type { MaterialIcons } from '@expo/vector-icons';
import type { Priority } from '@/types/checklist';

export type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

export interface PriorityConfig {
  icon: MaterialIconName;
  color: string;
  backgroundColor: string;
  /**
   * i18n key for the human-readable label. The record keys stay in English
   * because they are the Supabase column values and the ordering keys in
   * `utils/checklistOrder.ts` — only the rendered label is translated.
   */
  labelKey: string;
}

export const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  'Do now': {
    icon: 'error-outline',
    color: '#E03B3B',
    backgroundColor: '#FBCFCF',
    labelKey: 'checklist.priority.doNow',
  },
  'Do soon': {
    icon: 'schedule',
    color: '#F47734',
    backgroundColor: '#FBE4CF',
    labelKey: 'checklist.priority.doSoon',
  },
  'Explore and connect': {
    icon: 'people',
    color: '#F49E34',
    backgroundColor: '#FFEDBD',
    labelKey: 'checklist.priority.exploreAndConnect',
  },
  'Explore & connect': {
    icon: 'people',
    color: '#F49E34',
    backgroundColor: '#FFEDBD',
    labelKey: 'checklist.priority.exploreAndConnect',
  },
  'Optional / later': {
    icon: 'pending',
    color: '#5E8651',
    backgroundColor: '#CDE9D2',
    labelKey: 'checklist.priority.optionalLater',
  },
};
