import {
  reminderTime,
  reminderLabel,
  parseSuggestedReminder,
} from '@/services/companionActions/reminders';

test('an explicit approved offset remains usable when device zone rules are old', () => {
  const old = Intl.DateTimeFormat;
  const stale = function (locale: string, options: Intl.DateTimeFormatOptions) {
    return new old(locale, {
      ...options,
      timeZone:
        options.timeZone === 'America/Vancouver'
          ? 'Etc/GMT+8'
          : options.timeZone,
    });
  };
  Intl.DateTimeFormat = stale as typeof Intl.DateTimeFormat;
  try {
    expect(reminderTime('2026-11-03T10:30-07:00', 'America/Vancouver')).toEqual(
      { instant: '2026-11-03T10:30:00-07:00', wall: '2026-11-03T10:30:00' }
    );
    expect(
      parseSuggestedReminder({
        version: 1,
        type: 'reminder.schedule',
        task_ref: 'custom:1',
        remind_at: '2026-11-03T10:30:00-07:00',
        time_zone: 'America/Vancouver',
      })?.wall_time
    ).toBe('2026-11-03T10:30:00');
    const label = reminderLabel(
      {
        remindAt: '2026-11-03T17:30:00Z',
        timeZone: 'America/Vancouver',
        wallTime: '2026-11-03T10:30:00',
      },
      'en'
    );
    expect(label).toContain('10:30');
    expect(label).toContain('UTC-07:00');
    expect(label).toContain('America/Vancouver');
    const historical = reminderLabel(
      {
        remindAt: '2026-11-03T18:30:00Z',
        timeZone: 'America/Vancouver',
        wallTime: '2026-11-03T10:30:00',
      },
      'en'
    );
    expect(historical).toContain('10:30');
    expect(historical).toContain('UTC-08:00');
  } finally {
    Intl.DateTimeFormat = old;
  }
});

test('explicit entry rejects impossible calendar values, offsets and zone names', () => {
  for (const instant of [
    '2026-02-30T10:30-07:00',
    '2026-11-03T25:30-07:00',
    '2026-11-03T10:30+24:00',
    '2026-11-03T10:30',
  ])
    expect(reminderTime(instant, 'America/Vancouver')).toBeNull();
  expect(reminderTime('2026-11-03T10:30-07:00', 'Invalid/Zone')).toBeNull();
});
