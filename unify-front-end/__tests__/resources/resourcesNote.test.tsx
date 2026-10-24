import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';

let mockProvince: string | null | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({
    currentUser: mockProvince === undefined ? null : { province: mockProvince },
    isLoading: false,
  }),
}));

// The sheet is a Reanimated overlay with no bearing on the note.
jest.mock('@/components/learn/Resources/HowWeChooseSheet', () => () => null);

// SVG assets are Metro-transformed components; Jest has no transformer.
jest.mock('@/components/learn/Resources/CategoryIcon', () => () => null);

jest.mock('@/utils/analytics', () => {
  const track = {
    trackResourcesViewed: jest.fn(),
    trackResourcesCategoryOpened: jest.fn(),
    trackPartnerSpotlightShown: jest.fn(),
  };
  return { useAnalytics: () => track };
});

import ResourcesView from '@/components/learn/Resources/ResourcesView';
import CategoryDetail from '@/components/learn/Resources/CategoryDetail';

const i18n = i18next.createInstance();
i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  initImmediate: false,
});

const note = (province: string) =>
  `More partners in ${province} are coming soon.`;

function renderResources() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ResourcesView />
    </I18nextProvider>
  );
}

describe('Resources "more partners are coming" note', () => {
  it('shows the note for an Ontario user', () => {
    mockProvince = 'Ontario';
    renderResources();
    expect(screen.getByText(note('Ontario'))).toBeTruthy();
  });

  it('shows the note for a user whose profile stored an abbreviation', () => {
    mockProvince = 'AB';
    renderResources();
    expect(screen.getByText(note('Alberta'))).toBeTruthy();
  });

  it.each([
    ['a BC user', 'British Columbia'],
    ['a user with no province saved', null],
    ['a user with unmatched free text', 'Somewhere Else'],
  ])('hides the note for %s', (_label, province) => {
    mockProvince = province;
    renderResources();
    expect(screen.queryByText(/are coming soon/)).toBeNull();
  });

  it('keeps the note while an Ontario user searches with results', () => {
    mockProvince = 'Ontario';
    renderResources();
    fireEvent.changeText(
      screen.getByPlaceholderText(en.learn.resources.searchPlaceholder),
      'shaws'
    );
    expect(screen.getByText(note('Ontario'))).toBeTruthy();
    expect(screen.queryByText(en.learn.resources.noSearchResultsTitle)).toBeNull();
  });

  it('keeps the note when an Ontario search finds nothing', () => {
    mockProvince = 'Ontario';
    renderResources();
    fireEvent.changeText(
      screen.getByPlaceholderText(en.learn.resources.searchPlaceholder),
      'zzzzqqqq'
    );
    expect(
      screen.getByText(en.learn.resources.noSearchResultsTitle)
    ).toBeTruthy();
    expect(screen.getByText(note('Ontario'))).toBeTruthy();
  });

  it('keeps the note above a category list an Ontario user opens', () => {
    mockProvince = 'Ontario';
    renderResources();
    fireEvent.press(
      screen.getByLabelText(
        new RegExp(`^${en.learn.resources.category.findWork.label},`)
      )
    );    expect(screen.getByLabelText(en.learn.resources.backToCategories)).toBeTruthy();
    expect(screen.getByText(note('Ontario'))).toBeTruthy();
  });

  it('keeps the note on a category with no partners in the province', () => {
    mockProvince = 'Nova Scotia';
    render(
      <I18nextProvider i18n={i18n}>
        <CategoryDetail category='money' onBack={() => {}} />
      </I18nextProvider>
    );
    expect(
      screen.getByText(en.learn.resources.noPartnersInCategory)
    ).toBeTruthy();
    expect(screen.getByText(note('Nova Scotia'))).toBeTruthy();
  });

  it('shows no note on a category list for a BC user', () => {
    mockProvince = 'British Columbia';
    render(
      <I18nextProvider i18n={i18n}>
        <CategoryDetail category='gettingSettled' onBack={() => {}} />
      </I18nextProvider>
    );
    expect(screen.queryByText(/are coming soon/)).toBeNull();
  });
});
