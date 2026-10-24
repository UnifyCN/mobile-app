import React from 'react';

const h = React.createElement;
import { fireEvent, render, screen } from '@testing-library/react-native';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';
import ar from '@/i18n/locales/ar/translation.json';

jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');

import { ArrivalCountdownCard } from '@/components/checklist/ArrivalCountdownCard';

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
    react: { useSuspense: false },
  });
});

afterEach(async () => {
  await i18next.changeLanguage('en');
});

describe('ArrivalCountdownCard', () => {
  it('shows the day count before arrival', () => {
    render(
      h(ArrivalCountdownCard, {
        countdown: { state: 'pre_arrival', days: 40 },
        onPress: jest.fn(),
      })
    );
    expect(screen.getByText('40 days until you land')).toBeTruthy();
  });

  it('uses the singular for tomorrow', () => {
    render(
      h(ArrivalCountdownCard, {
        countdown: { state: 'pre_arrival', days: 1 },
        onPress: jest.fn(),
      })
    );
    expect(screen.getByText('1 day until you land')).toBeTruthy();
  });

  it('shows the first-30-days copy after arrival', () => {
    render(
      h(ArrivalCountdownCard, {
        countdown: { state: 'first_30_days' },
        onPress: jest.fn(),
      })
    );
    expect(screen.getByText('Your first 30 days')).toBeTruthy();
  });

  it('is one labelled button that opens the date sheet', () => {
    const onPress = jest.fn();
    render(
      h(ArrivalCountdownCard, {
        countdown: { state: 'pre_arrival', days: 40 },
        onPress: onPress,
      })
    );
    const button = screen.getByRole('button');
    expect(button.props.accessibilityLabel).toBe('40 days until you land');
    expect(button.props.accessibilityHint).toBe('Change your arrival date');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('picks the Arabic plural form for the language', async () => {
    await i18next.changeLanguage('ar');
    render(
      h(ArrivalCountdownCard, {
        countdown: { state: 'pre_arrival', days: 2 },
        onPress: jest.fn(),
      })
    );
    expect(
      screen.getByText(ar.checklist.arrivalCountdown.preArrival_two)
    ).toBeTruthy();
  });
});
