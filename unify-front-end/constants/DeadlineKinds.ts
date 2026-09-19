import type { MaterialIcons } from '@expo/vector-icons';
import type { DeadlineKind } from '@/types/deadlines';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

export const DEADLINE_KIND_ICON: Record<DeadlineKind, IconName> = {
  study_permit: 'school',
  work_permit: 'work-outline',
  pr_card: 'badge',
  health_card: 'local-hospital',
  sin: 'fingerprint',
  tax_filing: 'receipt-long',
  insurance: 'verified-user',
  passport: 'flight-takeoff',
  other: 'event',
};
