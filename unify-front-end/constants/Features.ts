// Re-enable the database first. See CIRCLES.md for the restore procedure.
export const CIRCLES_ENABLED: boolean = false;

export const CIRCLE_NOTIFICATION_TYPES = [
  'circle_matched',
  'circle_ending_soon',
  'circle_ended',
  'new_message',
] as const;

export function isCircleNotification(type: unknown, data?: unknown): boolean {
  return (
    CIRCLE_NOTIFICATION_TYPES.some(circleType => circleType === type) ||
    (typeof data === 'object' && data !== null && 'circle_id' in data)
  );
}
