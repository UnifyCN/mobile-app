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

/** IRCC prints counts as "752" or "5,000": digits, grouped by commas in threes. */
const INVITATIONS = /^(?:\d{1,3}(?:,\d{3})+|\d+)$/;
/** A CRS score is whole digits. */
const SCORE = /^\d+$/;

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
  if (!INVITATIONS.test(size) || !SCORE.test(crs)) return null;
  return { number: Number(number), date, name, size, crs };
}

/** The leading digits of the draw number ("91b" is 91), or null. */
function drawRank(row: unknown): number | null {
  const number = (row as { drawNumber?: unknown } | null)?.drawNumber;
  const digits =
    typeof number === 'string' ? /^\s*(\d+)/.exec(number)?.[1] : undefined;
  return digits === undefined ? null : Number(digits);
}

function malformed(row: unknown): Error {
  const number = (row as { drawNumber?: unknown } | null)?.drawNumber;
  return new Error(`Express Entry rounds: malformed draw ${String(number)}`);
}

/**
 * Converts IRCC's ee_rounds_123_en.json into one record per draw: the ten most
 * recent, newest first. Draws are numbered in order, so the ten highest numbers
 * are the current set. Every one of them must be complete: a malformed current
 * draw, including its invitation count and CRS score as numbers, fails the
 * source, so the previous complete set stays. Older draws are
 * not read, so a historical format such as draw 91b does not matter. A row
 * without a number cannot be placed and also fails the source.
 */
export function convertExpressEntryRounds(json: unknown): SourceRecord[] {
  const rounds = (json as { rounds?: unknown } | null)?.rounds;
  if (!Array.isArray(rounds)) {
    throw new Error('Express Entry rounds: no rounds list');
  }
  const ranked = rounds.map(row => ({ row, rank: drawRank(row) }));
  const unplaced = ranked.find(r => r.rank === null);
  if (unplaced) throw malformed(unplaced.row);
  return ranked
    .sort((a, b) => b.rank! - a.rank!)
    .slice(0, EXPRESS_ENTRY_DRAW_LIMIT)
    .map(({ row }) => {
      const draw = readDraw(row);
      if (draw === null) throw malformed(row);
      return draw;
    })
    .sort((a, b) =>
      a.date === b.date ? b.number - a.number : a.date < b.date ? 1 : -1
    )
    .map(draw => ({
      text: `Express Entry draw #${draw.number} on ${formatLongDate(draw.date)}: ${draw.name}, ${draw.size} invitations, minimum CRS ${draw.crs}.`,
      publishedAt: draw.date,
    }));
}
