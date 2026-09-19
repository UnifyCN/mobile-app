import * as Notifications from 'expo-notifications';
import {
  cancelDeadlineReminders,
  ensureReminderPermission,
  scheduleDeadlineReminders,
} from '@/services/push/deadlineReminders';
import type { Deadline } from '@/types/deadlines';

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const getPerm = Notifications.getPermissionsAsync as jest.Mock;
const reqPerm = Notifications.requestPermissionsAsync as jest.Mock;

const NOW = new Date(2026, 8, 3, 15, 30);
const base: Deadline = {
  id: 42,
  user_id: 'u1',
  kind: 'study_permit',
  title: 'Study permit expires',
  due_date: '2027-04-30',
  linked_task_key: null,
  completed: false,
  completed_at: null,
  created_at: '',
  updated_at: '',
};
const copy = { title: (d: number) => `T${d}`, body: 'B' };

beforeEach(() => jest.clearAllMocks());

describe('scheduleDeadlineReminders', () => {
  it('cancels old identifiers, then schedules one per future offset with stable ids', async () => {
    const n = await scheduleDeadlineReminders(base, copy, NOW);
    expect(n).toBe(3);
    expect(cancel.mock.calls.map(c => c[0])).toEqual([
      'deadline-42-90',
      'deadline-42-30',
      'deadline-42-7',
    ]);
    expect(schedule).toHaveBeenCalledTimes(3);
    const first = schedule.mock.calls[0][0];
    expect(first.identifier).toBe('deadline-42-90');
    expect(first.content.title).toBe('T90');
    expect(first.content.data).toEqual({ type: 'deadline', deadline_id: 42 });
    expect(first.trigger.type).toBe('date');
    expect(first.trigger.date.getHours()).toBe(9);
  });

  it('schedules nothing for a completed deadline but still clears old ones', async () => {
    const n = await scheduleDeadlineReminders({ ...base, completed: true }, copy, NOW);
    expect(n).toBe(0);
    expect(cancel).toHaveBeenCalledTimes(3);
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe('cancelDeadlineReminders', () => {
  it('swallows cancel errors so a missing id never blocks the caller', async () => {
    cancel.mockRejectedValueOnce(new Error('nope'));
    await expect(cancelDeadlineReminders(7)).resolves.toBeUndefined();
  });
});

describe('ensureReminderPermission', () => {
  it('does not re-prompt when iOS already denied', async () => {
    getPerm.mockResolvedValue({ status: 'denied', canAskAgain: false });
    expect(await ensureReminderPermission()).toBe('denied');
    expect(reqPerm).not.toHaveBeenCalled();
  });
  it('prompts when undetermined', async () => {
    getPerm.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    reqPerm.mockResolvedValue({ status: 'granted' });
    expect(await ensureReminderPermission()).toBe('granted');
    expect(reqPerm).toHaveBeenCalledTimes(1);
  });
});
