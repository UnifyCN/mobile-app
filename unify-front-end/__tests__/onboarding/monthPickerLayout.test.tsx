import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import MonthPicker from '@/components/onboarding/MonthPicker';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const layout = (y: number, height: number) => ({
  nativeEvent: { layout: { x: 0, y, width: 160, height } },
});

describe('MonthPicker measured scroll position', () => {
  let scroll: jest.SpyInstance;
  beforeEach(() => {
    scroll = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {})
      .mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  function open() {
    const screen = render(
      <MonthPicker
        value={new Date(2006, 0, 1)}
        onChange={jest.fn()}
        minimumDate={new Date(2000, 0, 1)}
        maximumDate={new Date(2030, 11, 1)}
      />
    );
    fireEvent.press(screen.getByText('January 2006'));
    return screen;
  }

  it('centers the selected year using its actual offset and height', () => {
    const screen = open();
    fireEvent(
      screen.getByTestId('month-picker-years'),
      'layout',
      layout(0, 220)
    );
    fireEvent(screen.getByText('2006'), 'layout', layout(900, 60));
    expect(scroll).toHaveBeenLastCalledWith({ y: 820, animated: false });
  });

  it('handles rows measured before the viewport and subsequent larger text', () => {
    const screen = open();
    fireEvent(screen.getByText('2006'), 'layout', layout(900, 60));
    expect(scroll).not.toHaveBeenCalled();
    fireEvent(
      screen.getByTestId('month-picker-years'),
      'layout',
      layout(0, 220)
    );
    expect(scroll).toHaveBeenLastCalledWith({ y: 820, animated: false });
    fireEvent(screen.getByText('2006'), 'layout', layout(1200, 90));
    expect(scroll).toHaveBeenLastCalledWith({ y: 1135, animated: false });
  });

  it('clamps the first month to the top', () => {
    const screen = open();
    fireEvent(
      screen.getByTestId('month-picker-months'),
      'layout',
      layout(0, 220)
    );
    fireEvent(screen.getByText('January'), 'layout', layout(0, 60));
    expect(scroll).toHaveBeenLastCalledWith({ y: 0, animated: false });
  });
});
