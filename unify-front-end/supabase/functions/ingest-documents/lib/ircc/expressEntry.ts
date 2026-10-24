import { formatLongDate } from './dates.ts';
import type { SourceRecord } from './types.ts';

/** Draws kept: the ten most recent. */
export const EXPRESS_ENTRY_DRAW_LIMIT = 10;

interface Draw {
  number: number;
  date: string;
  name: string;
  size: string;
  crs: string;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}

function readDraw(row: unknown): Draw | null {
  if (row === null || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const number = text(r.drawNumber);
  const date = text(r.drawDate);
  const name = text(r.drawName);
  const size = text(r.drawSize);
  const crs = text(r.drawCRS);
  if (!number || !/^\d+$/.test(number)) return null;
  if (!date || formatLongDate(date) === null) return null;
  if (!name || !size || !crs) return null;
  return { number: Number(number), date, name, size, crs };
}

/**
 * Converts IRCC's ee_rounds_123_en.json into one record per draw: the ten most
 * recent, newest first. A row with a missing or invalid field is skipped.
 */
export function convertExpressEntryRounds(json: unknown): SourceRecord[] {
  const rounds = (json as { rounds?: unknown } | null)?.rounds;
  if (!Array.isArray(rounds)) {
    throw new Error('Express Entry rounds: no rounds list');
  }
  return rounds
    .map(readDraw)
    .filter((draw): draw is Draw => draw !== null)
    .sort((a, b) =>
      a.date === b.date ? b.number - a.number : a.date < b.date ? 1 : -1
    )
    .slice(0, EXPRESS_ENTRY_DRAW_LIMIT)
    .map(draw => ({
      text: `Express Entry draw #${draw.number} on ${formatLongDate(draw.date)}: ${draw.name}, ${draw.size} invitations, minimum CRS ${draw.crs}.`,
      publishedAt: draw.date,
    }));
}
