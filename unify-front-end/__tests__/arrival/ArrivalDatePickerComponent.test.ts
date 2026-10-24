import React from 'react';

const h = React.createElement;
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { typography } from '@/constants/Typography';

import { ArrivalDatePicker } from '@/components/checklist/ArrivalDatePicker';
import { getArrivalDateRange } from '@/helpers/arrivalDatePicker';
import { formatLocalDate } from '@/helpers/arrivalDate';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockDimensions = useWindowDimensions as jest.Mock;

beforeEach(() => {
  mockDimensions.mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  });
});

const TODAY = new Date(2026, 9, 23, 12, 0, 0);
const range = getArrivalDateRange(TODAY);
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d);

const setup = (value: Date, onChange = jest.fn()) => {
  render(
    h(ArrivalDatePicker, {
      value,
      min: range.min,
      max: range.max,
      language: 'en',
      onChange,
    })
  );
  return onChange;
};

describe('ArrivalDatePicker', () => {
  it('marks the preset year, month, and day as selected', () => {
    setup(at(2026, 12, 1));
    expect(
      screen.getByLabelText('2026').props.accessibilityState.selected
    ).toBe(true);
    expect(
      screen.getByLabelText('December').props.accessibilityState.selected
    ).toBe(true);
    expect(screen.getByLabelText('1').props.accessibilityState.selected).toBe(
      true
    );
  });

  it('offers exactly the years from 5 back to 3 ahead', () => {
    setup(at(2026, 12, 1));
    for (const year of [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029]) {
      expect(screen.getByLabelText(String(year))).toBeTruthy();
    }
    expect(screen.queryByLabelText('2020')).toBeNull();
    expect(screen.queryByLabelText('2030')).toBeNull();
  });

  it('hides months and days outside the range at the edges', () => {
    setup(at(2021, 10, 25));
    expect(screen.queryByLabelText('September')).toBeNull();
    expect(screen.getByLabelText('October')).toBeTruthy();
    expect(screen.queryByLabelText('22')).toBeNull();
    expect(screen.getByLabelText('23')).toBeTruthy();
  });

  it('reports a new day', () => {
    const onChange = setup(at(2026, 12, 1));
    fireEvent.press(screen.getByLabelText('15'));
    expect(formatLocalDate(onChange.mock.calls[0][0])).toBe('2026-12-15');
  });

  it('keeps the day inside a shorter month', () => {
    const onChange = setup(at(2026, 1, 31));
    fireEvent.press(screen.getByLabelText('February'));
    expect(formatLocalDate(onChange.mock.calls[0][0])).toBe('2026-02-28');
  });

  it('clamps into range when the year changes', () => {
    const onChange = setup(at(2026, 3, 5));
    fireEvent.press(screen.getByLabelText('2021'));
    expect(formatLocalDate(onChange.mock.calls[0][0])).toBe('2021-10-23');
  });
});

describe('ArrivalDatePicker at large text on a small phone', () => {
  const SHEET_WIDTH = 272; // 320 pt phone less the sheet padding

  const renderAt = (fontScale: number, language = 'en') => {
    mockDimensions.mockReturnValue({
      width: 320,
      height: 568,
      scale: 2,
      fontScale,
    });
    const onChange = jest.fn();
    render(
      h(ArrivalDatePicker, {
        value: at(2026, 12, 15),
        min: range.min,
        max: range.max,
        language,
        onChange,
      })
    );
    fireEvent(screen.getByTestId('arrival-date-picker'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: SHEET_WIDTH, height: 400 } },
    });
    return onChange;
  };

  it('keeps month, day, and year in one row at normal text size', () => {
    renderAt(1);
    expect(screen.queryByTestId('arrival-date-picker-group-1')).toBeNull();
    const group = screen.getByTestId('arrival-date-picker-group-0');
    for (const label of ['December', '15', '2026']) {
      expect(within(group).getByLabelText(label)).toBeTruthy();
    }
  });

  it.each([2, 3])(
    'puts the month in its own row at text scale %s',
    fontScale => {
      renderAt(fontScale);
      const first = screen.getByTestId('arrival-date-picker-group-0');
      const second = screen.getByTestId('arrival-date-picker-group-1');
      expect(within(first).getByLabelText('December')).toBeTruthy();
      expect(within(first).queryByLabelText('15')).toBeNull();
      expect(within(second).getByLabelText('15')).toBeTruthy();
      expect(within(second).getByLabelText('2026')).toBeTruthy();
      expect(within(second).queryByLabelText('December')).toBeNull();
    }
  );

  it('gives each row its own selection band', () => {
    renderAt(3);
    expect(screen.getByTestId('arrival-date-picker-band-0')).toBeTruthy();
    expect(screen.getByTestId('arrival-date-picker-band-1')).toBeTruthy();
  });

  it('still reports a pick made in the stacked layout', () => {
    const onChange = renderAt(3);
    fireEvent.press(screen.getByLabelText('January'));
    fireEvent.press(screen.getByLabelText('2027'));
    expect(formatLocalDate(onChange.mock.calls[0][0])).toBe('2026-01-15');
    expect(formatLocalDate(onChange.mock.calls[1][0])).toBe('2027-12-15');
  });

  it('keeps the shared text roles and does not cap or shrink font scaling', () => {
    renderAt(3);
    const text = screen.getByText('December');
    const style = StyleSheet.flatten(text.props.style);
    expect(style.fontSize).toBe(typography.cardTitle.fontSize);
    expect(style.lineHeight).toBe(typography.cardTitle.lineHeight);
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(text.props.maxFontSizeMultiplier).toBeUndefined();
    expect(text.props.adjustsFontSizeToFit).toBeUndefined();
    expect(text.props.numberOfLines).toBeUndefined();
  });
});
