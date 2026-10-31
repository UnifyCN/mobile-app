import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { arrivalKey } from '@/helpers/companion/companionContext';

const PERSONAS = new Set([
  'international_student',
  'skilled_worker',
  'refugee',
  'protected_person',
  'immigrant',
  'pr',
  'other',
]);

const CHECK_TIME: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/**
 * Display text for Companion context values in the UI language: personas and
 * arrival codes are translated; dates and check times use the locale's date
 * format, with the time zone named where the platform supports it. Place and
 * publisher names are proper names and are shown as stored.
 */
export function useContextLabels() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';

  const time = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      try {
        return date.toLocaleString(lang, {
          ...CHECK_TIME,
          timeZoneName: 'short',
        });
      } catch {
        return date.toLocaleString(lang, CHECK_TIME);
      }
    },
    [lang]
  );

  const arrival = useCallback(
    (code: string) => {
      const key = arrivalKey(code);
      if (!key) return code;
      return key.number === undefined
        ? t(key.key)
        : t(key.key, { number: key.number });
    },
    [t]
  );

  const fieldValue = useCallback(
    (key: string, value: string) => {
      if (key === 'persona' && PERSONAS.has(value)) {
        return t(`checklist.persona.${value}`);
      }
      if (key === 'arrival') return arrival(value);
      if (key === 'arrival_date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T00:00:00Z`).toLocaleDateString(lang, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        });
      }
      return value;
    },
    [arrival, lang, t]
  );

  return { time, arrival, fieldValue };
}
