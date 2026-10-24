import React from 'react';

const h = React.createElement;
import { fireEvent, render, screen } from '@testing-library/react-native';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';

jest.mock('@/components/common/BottomSheet', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({
      visible,
      children,
    }: {
      visible: boolean;
      children: React.ReactNode;
    }) => (visible ? createElement(View, { testID: 'sheet' }, children) : null),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { ArrivalDateSheet } from '@/components/checklist/ArrivalDateSheet';

const TODAY = new Date(2026, 9, 23, 12, 0, 0);

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
    react: { useSuspense: false },
  });
});

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(TODAY);
});

afterEach(() => {
  jest.useRealTimers();
});

const renderSheet = (
  props: Partial<React.ComponentProps<typeof ArrivalDateSheet>> = {}
) => {
  const onSave = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    h(ArrivalDateSheet, {
      visible: true,
      arrivalDate: '2026-12-01',
      isSaving: false,
      onSave,
      onClose,
      ...props,
    })
  );
  return { ...utils, onSave, onClose };
};

const saveButton = () => screen.getByRole('button', { name: 'Save' });

describe('ArrivalDateSheet', () => {
  it('shows the title and presets the current arrival date', () => {
    renderSheet();
    expect(screen.getByText('Arrival date')).toBeTruthy();
    expect(
      screen.getByLabelText('December').props.accessibilityState.selected
    ).toBe(true);
    expect(
      screen.getByLabelText('2026').props.accessibilityState.selected
    ).toBe(true);
    expect(screen.getByLabelText('1').props.accessibilityState.selected).toBe(
      true
    );
  });

  it('keeps Save disabled until the date changes', () => {
    const { onSave } = renderSheet();
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('enables Save for a changed date and saves the picked day', () => {
    const { onSave } = renderSheet();
    fireEvent.press(screen.getByLabelText('15'));
    expect(saveButton().props.accessibilityState.disabled).toBe(false);
    fireEvent.press(saveButton());
    expect(onSave).toHaveBeenCalledWith('2026-12-15');
  });

  it('disables Save again when the date is changed back', () => {
    renderSheet();
    fireEvent.press(screen.getByLabelText('15'));
    fireEvent.press(screen.getByLabelText('1'));
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
  });

  it('disables Save while a save is in flight', () => {
    const { onSave } = renderSheet({ isSaving: true });
    fireEvent.press(screen.getByLabelText('15'));
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    expect(saveButton().props.accessibilityState.busy).toBe(true);
    fireEvent.press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('drops an unsaved pick when the sheet is closed and reopened', () => {
    const { rerender } = renderSheet();
    fireEvent.press(screen.getByLabelText('15'));
    const props = {
      arrivalDate: '2026-12-01',
      isSaving: false,
      onSave: jest.fn(),
      onClose: jest.fn(),
    };
    rerender(h(ArrivalDateSheet, { visible: false, ...props }));
    rerender(h(ArrivalDateSheet, { visible: true, ...props }));
    expect(screen.getByLabelText('1').props.accessibilityState.selected).toBe(
      true
    );
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
  });

  it('keeps the pick after a failed save so the user can retry', () => {
    const { rerender } = renderSheet();
    fireEvent.press(screen.getByLabelText('15'));
    const base = {
      visible: true,
      arrivalDate: '2026-12-01',
      onSave: jest.fn(),
      onClose: jest.fn(),
    };
    rerender(h(ArrivalDateSheet, { ...base, isSaving: true }));
    rerender(h(ArrivalDateSheet, { ...base, isSaving: false }));
    expect(screen.getByLabelText('15').props.accessibilityState.selected).toBe(
      true
    );
    expect(saveButton().props.accessibilityState.disabled).toBe(false);
  });

  it('offers no date outside 5 years back to 3 years ahead', () => {
    renderSheet();
    expect(screen.getByLabelText('2021')).toBeTruthy();
    expect(screen.getByLabelText('2029')).toBeTruthy();
    expect(screen.queryByLabelText('2020')).toBeNull();
    expect(screen.queryByLabelText('2030')).toBeNull();
  });

  it('shows the nearest allowed date when the saved date is out of range', () => {
    renderSheet({ arrivalDate: '2031-05-01' });
    expect(
      screen.getByLabelText('2029').props.accessibilityState.selected
    ).toBe(true);
    expect(
      screen.getByLabelText('October').props.accessibilityState.selected
    ).toBe(true);
    expect(saveButton().props.accessibilityState.disabled).toBe(false);
  });
});
