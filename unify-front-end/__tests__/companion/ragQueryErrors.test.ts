import {
  AICompanionBusyError,
  AICompanionLimitError,
  BUSY_FALLBACK_MESSAGE_KEY,
  DAILY_LIMIT_FALLBACK_MESSAGE_KEY,
  classifyRagQueryError,
} from '@/helpers/companion/ragQueryErrors';
import en from '@/i18n/locales/en/translation.json';

describe('classifyRagQueryError', () => {
  describe('daily limit (429)', () => {
    it('maps a 429 with daily_limit_reached code to AICompanionLimitError', () => {
      const body = JSON.stringify({
        error: 'Daily message limit reached. Try again tomorrow.',
        code: 'daily_limit_reached',
      });
      const err = classifyRagQueryError(429, body);
      expect(err).toBeInstanceOf(AICompanionLimitError);
      expect((err as AICompanionLimitError).code).toBe('daily_limit_reached');
      expect(err.message).toBe('Daily message limit reached. Try again tomorrow.');
      expect((err as AICompanionLimitError).messageKey).toBe(
        DAILY_LIMIT_FALLBACK_MESSAGE_KEY
      );
    });

    it('maps a bare 429 (no/invalid body) to AICompanionLimitError carrying the fallback i18n key', () => {
      const err = classifyRagQueryError(429, '');
      expect(err).toBeInstanceOf(AICompanionLimitError);
      expect((err as AICompanionLimitError).messageKey).toBe(
        DAILY_LIMIT_FALLBACK_MESSAGE_KEY
      );
      // Diagnostic message stays machine-readable; it is never shown to users.
      expect(err.message).toBe('rag-query 429: daily_limit_reached');
    });

    it('maps the daily_limit_reached code even if the status is not 429', () => {
      const err = classifyRagQueryError(400, JSON.stringify({ code: 'daily_limit_reached' }));
      expect(err).toBeInstanceOf(AICompanionLimitError);
    });
  });

  describe('busy (503)', () => {
    it('maps a 503 with ai_companion_busy code to AICompanionBusyError', () => {
      const body = JSON.stringify({
        error: 'AI Companion is busy right now. Please try again in a minute.',
        code: 'ai_companion_busy',
      });
      const err = classifyRagQueryError(503, body);
      expect(err).toBeInstanceOf(AICompanionBusyError);
      expect(err.message).toContain('busy');
    });

    it('maps a bare 503 to AICompanionBusyError carrying the fallback i18n key', () => {
      const err = classifyRagQueryError(503, '');
      expect(err).toBeInstanceOf(AICompanionBusyError);
      expect((err as AICompanionBusyError).messageKey).toBe(
        BUSY_FALLBACK_MESSAGE_KEY
      );
      expect(err.message).toBe('rag-query 503: ai_companion_busy');
    });

    it('exposes fallback keys that exist in the English catalogue', () => {
      const resolve = (key: string) =>
        key.split('.').reduce<any>((acc, part) => acc?.[part], en);
      expect(typeof resolve(BUSY_FALLBACK_MESSAGE_KEY)).toBe('string');
      expect(typeof resolve(DAILY_LIMIT_FALLBACK_MESSAGE_KEY)).toBe('string');
    });
  });

  describe('other failures', () => {
    it('maps a 500 to a generic Error including status and body', () => {
      const err = classifyRagQueryError(500, '{"error":"boom"}');
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(AICompanionBusyError);
      expect(err).not.toBeInstanceOf(AICompanionLimitError);
      expect(err.message).toBe('rag-query 500: {"error":"boom"}');
    });

    it('maps a 401 with no body to a generic Error with just the status', () => {
      const err = classifyRagQueryError(401, '');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('rag-query 401');
    });

    it('does not throw on non-JSON bodies', () => {
      const err = classifyRagQueryError(502, '<html>Bad Gateway</html>');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('rag-query 502: <html>Bad Gateway</html>');
    });
  });
});
