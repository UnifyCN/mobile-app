export const CYCLE_TIMEOUT_MS: number;
export function configurationStatus(request: Request, mode: string, env: Record<string, string | undefined>): number;
export function handlePush(request: Request, mode?: 'cycle' | 'readiness'): Promise<Response>;
