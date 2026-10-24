/**
 * The arrival card, sheet and picker follow the shared typography roles, keep
 * user font scaling, grow their geometry with scaled text, and keep enabled
 * Save text at 4.5:1 contrast or better.
 */
import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { ScrollView, StyleSheet, Text } from 'react-native';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';
import { typography } from '@/constants/Typography';

const h = React.createElement;

let mockFontScale = 1;
let mockWindowHeight = 844;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 390,
    height: mockWindowHeight,
    scale: 3,
    fontScale: mockFontScale,
  }),
}));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
let mockSnapPoint: number | undefined;
jest.mock('@/components/common/BottomSheet', () => ({
  __esModule: true,
  default: ({
    visible,
    snapPoint,
    children,
  }: {
    visible: boolean;
    snapPoint?: number;
    children: React.ReactNode;
  }) => {
    mockSnapPoint = snapPoint;
    return visible ? children : null;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { ArrivalCountdownCard } from '@/components/checklist/ArrivalCountdownCard';
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
  mockFontScale = 1;
  mockWindowHeight = 844;
  jest.useFakeTimers().setSystemTime(TODAY);
});
afterEach(() => jest.useRealTimers());

const renderSheet = (arrivalDate = '2026-12-01') =>
  render(
    h(ArrivalDateSheet, {
      visible: true,
      arrivalDate,
      isSaving: false,
      onSave: jest.fn(),
      onClose: jest.fn(),
    })
  );

const flat = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

const expandHex = (hex: string) =>
  hex.length === 4 ? `#${[...hex.slice(1)].map(c => c + c).join('')}` : hex;

const luminance = (color: string) => {
  const hex = expandHex(color);
  const channels = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const role = (name: keyof typeof typography) => ({
  fontSize: typography[name].fontSize,
  lineHeight: typography[name].lineHeight,
  fontWeight: typography[name].fontWeight,
});

describe('typography roles', () => {
  it('uses cardTitle for the card title and keeps user font scaling', () => {
    render(
      h(ArrivalCountdownCard, {
        countdown: { state: 'pre_arrival', days: 40 },
        onPress: jest.fn(),
      })
    );
    const title = screen.getByText('40 days until you land');
    expect(flat(title)).toMatchObject(role('cardTitle'));
    expect(title.props.maxFontSizeMultiplier).toBeUndefined();
    expect(title.props.allowFontScaling).not.toBe(false);
  });

  it('uses section for the sheet title and button for Save', () => {
    renderSheet();
    const title = screen.getByText('Arrival date');
    expect(flat(title)).toMatchObject(role('section'));
    fireEvent.press(screen.getByLabelText('15'));
    const save = within(screen.getByRole('button', { name: 'Save' })).getByText(
      'Save'
    );
    expect(flat(save)).toMatchObject(role('button'));
    expect(save.props.maxFontSizeMultiplier).toBeUndefined();
  });

  it('uses body for picker rows and cardTitle weight for the selected row', () => {
    renderSheet();
    const selected = screen.getByText('December');
    const other = screen.getByText('November');
    expect(flat(selected)).toMatchObject(role('cardTitle'));
    expect(flat(other)).toMatchObject(role('body'));
  });

  it('sets no font-scaling cap on any text in the card, sheet or picker', () => {
    render(
      h(
        React.Fragment,
        null,
        h(ArrivalCountdownCard, {
          countdown: { state: 'first_30_days' },
          onPress: jest.fn(),
        }),
        h(ArrivalDateSheet, {
          visible: true,
          arrivalDate: '2026-12-01',
          isSaving: false,
          onSave: jest.fn(),
          onClose: jest.fn(),
        })
      )
    );
    const texts = screen.UNSAFE_getAllByType(Text);
    expect(texts.length).toBeGreaterThan(10);
    for (const text of texts) {
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
    }
  });
});

describe('sheet height with scaled text', () => {
  it.each([
    [1, 0.64],
    [1.3, 0.676],
    [2, 0.76],
    [3, 0.88],
    [5, 0.9],
  ])('at font scale %s the sheet covers %s of the screen', (scale, share) => {
    mockFontScale = scale;
    renderSheet();
    expect(mockSnapPoint).toBeCloseTo(share, 5);
  });

  it('scrolls its content, so Save stays reachable at any size', () => {
    renderSheet();
    const scrollers = screen.UNSAFE_getAllByType(ScrollView);
    // One for the sheet content, one for each picker column.
    expect(scrollers).toHaveLength(4);
    expect(
      within(scrollers[0]).getByRole('button', { name: 'Save' })
    ).toBeTruthy();
  });
});

describe('Save contrast', () => {
  it('keeps the enabled Save label at 4.5:1 or better', () => {
    renderSheet();
    fireEvent.press(screen.getByLabelText('15'));
    const button = screen.getByRole('button', { name: 'Save' });
    const label = within(button).getByText('Save');
    const ratio = contrast(
      String(flat(label).color),
      String(flat(button).backgroundColor)
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('picker geometry with scaled text', () => {
  const picker = () => screen.getByTestId('arrival-date-picker');
  const rowOf = (label: string) => screen.getByLabelText(label);

  it('keeps the 44-point rows at normal text size', () => {
    renderSheet();
    expect(flat(rowOf('December')).minHeight).toBe(44);
    expect(flat(picker()).height).toBe(44 * 5);
  });

  it.each([
    [1.3, 48, 240],
    [2, 64, 844 * 0.34],
    [3, 88, 844 * 0.34],
  ])(
    'at font scale %s the rows are at least %s points and the picker is %s',
    (scale, row, height) => {
      mockFontScale = scale;
      renderSheet();
      expect(flat(rowOf('December')).minHeight).toBe(row);
      expect(flat(picker()).height).toBeCloseTo(height, 5);
    }
  );

  it('shows fewer rows on a short screen, never fewer than three', () => {
    mockWindowHeight = 568;
    renderSheet();
    // 34% of 568 is 193: between three rows (132) and five rows (220).
    expect(flat(picker()).height).toBeCloseTo(568 * 0.34, 5);
  });

  it('keeps three whole rows at large text on a short screen', () => {
    mockWindowHeight = 500;
    mockFontScale = 2;
    renderSheet();
    // 34% of 500 is 170, below three rows of 64 points.
    expect(flat(picker()).height).toBe(64 * 3);
  });

  it('centres the selection band on the measured viewport and row', () => {
    mockFontScale = 2;
    renderSheet();
    fireEvent(picker(), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 300 } },
    });
    fireEvent(rowOf('December'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 400, width: 120, height: 90 } },
    });
    const band = flat(screen.getByTestId('arrival-date-picker-band'));
    expect(band.height).toBe(90);
    expect(band.top).toBe((300 - 90) / 2);
  });

  it('scrolls the selected row to the middle of the measured viewport', () => {
    mockFontScale = 2;
    renderSheet();
    fireEvent(picker(), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 300 } },
    });
    fireEvent(rowOf('December'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 400, width: 120, height: 64 } },
    });
    const calls = screen
      .UNSAFE_getAllByType(ScrollView)
      .flatMap(
        node =>
          (node.instance?.scrollTo as jest.Mock | undefined)?.mock?.calls ?? []
      );
    expect(calls).toContainEqual([
      { y: 400 + 64 / 2 - 300 / 2, animated: false },
    ]);
  });
});
