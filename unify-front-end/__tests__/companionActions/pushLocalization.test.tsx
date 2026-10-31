import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance } from 'i18next';
import { CompanionPushControl } from '@/components/companion/tasks/CompanionPushControl';
import en from '@/i18n/locales/en/translation.json';
import ar from '@/i18n/locales/ar/translation.json';
import es from '@/i18n/locales/es/translation.json';
import fr from '@/i18n/locales/fr-CA/translation.json';
import hi from '@/i18n/locales/hi/translation.json';
import pa from '@/i18n/locales/pa/translation.json';
import vi from '@/i18n/locales/vi/translation.json';
jest.mock('@/hooks/companion/useCompanionPush', () => ({
  useCompanionPushDevice: () => ({
    view: { phase: 'denied', permission: 'denied', receiptSaved: false },
    locale: 'en',
    device: { enable: jest.fn(), refresh: jest.fn() },
  }),
}));
jest.mock('@/services/account/accountSession', () => ({
  ownAccountWork: () => ({ accountId: 'a', epoch: 1 }),
  stillOwned: () => true,
}));
const entries = Object.entries({ en, ar, es, 'fr-CA': fr, hi, pa, vi });
const original = Platform.OS;
afterEach(() => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: original,
  });
});
it.each(entries)(
  'renders all %s labels without truncation properties and preserves native target constraints',
  (locale, copy) => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    const i18n = createInstance();
    void i18n
      .use(initReactI18next)
      .init({
        lng: locale,
        resources: { [locale]: { translation: copy } },
        initImmediate: false,
      });
    const app = render(
      <I18nextProvider i18n={i18n}>
        <CompanionPushControl />
      </I18nextProvider>
    );
    expect(
      screen.getByText(copy.companionPush.scope).props.numberOfLines
    ).toBeUndefined();
    expect(
      screen.getByText(copy.companionPush.state.denied).props
        .accessibilityLiveRegion
    ).toBe('polite');
    for (const b of screen.getAllByRole('button')) {
      expect(
        StyleSheet.flatten(b.props.style).minHeight
      ).toBeGreaterThanOrEqual(48);
      expect(b.props.accessibilityLabel).not.toMatch(/^companionPush\./);
      expect(b.props.accessibilityState.disabled).toBe(false);
    }
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    app.rerender(
      <I18nextProvider i18n={i18n}>
        <CompanionPushControl />
      </I18nextProvider>
    );
    for (const b of screen.getAllByRole('button'))
      expect(
        StyleSheet.flatten(b.props.style).minHeight
      ).toBeGreaterThanOrEqual(44);
    // Structural proof only. React Native's renderer stand-in does not measure clipping or speech.
    expect(i18n.dir()).toBe(locale === 'ar' ? 'rtl' : 'ltr');
  }
);
