import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import type { Deadline } from '@/types/deadlines';
import { REMINDER_OFFSETS_DAYS } from '@/types/deadlines';
import { reminderTriggerDates } from '@/utils/checklistHorizons';

export type ReminderPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const identifierFor = (deadlineId: number, offsetDays: number) =>
  `deadline-${deadlineId}-${offsetDays}`;

/** Ask once if undetermined; never re-prompt a denial (see PR #293). */
export async function ensureReminderPermission(): Promise<ReminderPermission> {
  if (!Device.isDevice) return 'unsupported';
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  if (!current.canAskAgain) return 'denied';
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted' ? 'granted' : 'denied';
}

export async function getReminderPermission(): Promise<ReminderPermission> {
  if (!Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export async function cancelDeadlineReminders(deadlineId: number): Promise<void> {
  await Promise.all(
    REMINDER_OFFSETS_DAYS.map(offset =>
      Notifications.cancelScheduledNotificationAsync(
        identifierFor(deadlineId, offset)
      ).catch(() => undefined)
    )
  );
}

export interface ReminderCopy {
  title: (offsetDays: number) => string;
  body: string;
}

/**
 * Replace any existing reminders for this deadline with 90/30/7-day local
 * notifications at 09:00. Returns how many were scheduled.
 */
export async function scheduleDeadlineReminders(
  deadline: Deadline,
  copy: ReminderCopy,
  now: Date = new Date()
): Promise<number> {
  await cancelDeadlineReminders(deadline.id);
  if (deadline.completed) return 0;
  const triggers = reminderTriggerDates(deadline.due_date, now);
  await Promise.all(
    triggers.map(({ offsetDays, date }) =>
      Notifications.scheduleNotificationAsync({
        identifier: identifierFor(deadline.id, offsetDays),
        content: {
          title: copy.title(offsetDays),
          body: copy.body,
          sound: 'default',
          data: { type: 'deadline', deadline_id: deadline.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId: 'learn',
        },
      })
    )
  );
  return triggers.length;
}
