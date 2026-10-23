export type LearnOrigin = 'checklist';

export function normalizeLearnOrigin(
  origin: string | string[] | undefined
): LearnOrigin | undefined {
  const value = Array.isArray(origin) ? origin[0] : origin;
  return value === 'checklist' ? value : undefined;
}

export function withLearnOrigin(
  href: string,
  origin: LearnOrigin | undefined
): string {
  if (!origin) return href;
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}origin=${origin}`;
}

export function getLessonExitDestination(
  origin: LearnOrigin | undefined,
  learnFallback: string
): string {
  return origin === 'checklist' ? '/(tabs)/Checklist' : learnFallback;
}
