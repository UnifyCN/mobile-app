import React from 'react';

const h = React.createElement;
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ArrivalDatePicker } from '@/components/checklist/ArrivalDatePicker';
import { getArrivalDateRange } from '@/helpers/arrivalDatePicker';
import { formatLocalDate } from '@/helpers/arrivalDate';

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
