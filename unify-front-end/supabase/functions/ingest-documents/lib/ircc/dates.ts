const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** "2026-10-16" to "October 16, 2026". Returns null for anything else. */
export function formatLongDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [year, month, day] = [+match[1], +match[2], +match[3]];
  if (!isRealDate(year, month, day)) return null;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** "October 21, 2026" to "2026-10-21". Returns null for anything else. */
export function parseLongDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const month = MONTHS.findIndex(
    name => name.toLowerCase() === match[1].toLowerCase()
  );
  if (month < 0) return null;
  const [year, day] = [+match[3], +match[2]];
  if (!isRealDate(year, month + 1, day)) return null;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
