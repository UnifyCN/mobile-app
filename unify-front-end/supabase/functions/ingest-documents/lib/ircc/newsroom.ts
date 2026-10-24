import { formatLongDate } from './dates.ts';
import type { SourceRecord } from './types.ts';

/** Items kept: published in the last 30 days, the 30th day back included. */
export const NEWSROOM_WINDOW_DAYS = 30;

interface Item {
  date: string;
  time: number;
  title: string;
  summary: string;
  link?: string;
}

function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u00ad/g, '')
    .replace(/[\u00a0\u202f\u200b]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text with one closing full stop, unless it already ends a sentence. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function readItem(row: unknown): Item | null {
  if (row === null || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const published = clean(r.publishedDate);
  // The date as the feed writes it (Eastern time), not converted to UTC.
  const date = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(published)?.[1];
  const time = Date.parse(published);
  const title = clean(r.title);
  if (!date || formatLongDate(date) === null || Number.isNaN(time)) return null;
  if (title === '') return null;
  const link = clean(r.link);
  return {
    date,
    time,
    title,
    summary: clean(r.teaser),
    link: link.startsWith('https://') ? link : undefined,
  };
}

function cutoffDate(now: Date): string {
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  cutoff.setUTCDate(cutoff.getUTCDate() - NEWSROOM_WINDOW_DAYS);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Converts the Government of Canada news API response for IRCC into one record
 * per item published in the last 30 days, newest first. Each record keeps the
 * address of its own item.
 */
export function convertNewsroom(json: unknown, now: Date): SourceRecord[] {
  const entries = (json as { feed?: { entry?: unknown } } | null)?.feed?.entry;
  if (!Array.isArray(entries)) throw new Error('Newsroom: no entry list');
  const cutoff = cutoffDate(now);
  return entries
    .map(readItem)
    .filter((item): item is Item => item !== null && item.date >= cutoff)
    .sort((a, b) =>
      a.time === b.time ? (a.title < b.title ? -1 : 1) : b.time - a.time
    )
    .map(item => {
      const head = `${formatLongDate(item.date)}: ${sentence(item.title)}`;
      const text =
        item.summary === '' || item.summary === item.title
          ? head
          : `${head} ${sentence(item.summary)}`;
      return {
        text,
        publishedAt: item.date,
        ...(item.link === undefined ? {} : { sourceUrl: item.link }),
      };
    });
}
