import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';

let mockProvince: string | null | undefined;
let mockUserLoading = false;
let mockSlug = '';
const mockTrackOpened = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ slug: mockSlug }),
  useNavigation: () => ({ addListener: () => () => {} }),
  useRouter: () => ({ back: jest.fn(), navigate: jest.fn(), push: jest.fn() }),
}));

jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({
    currentUser: mockUserLoading ? null : { province: mockProvince },
    isLoading: mockUserLoading,
  }),
}));

jest.mock('@/utils/analytics', () => {
  const analytics = {
    trackResourcesPartnerOpened: (...args: unknown[]) =>
      mockTrackOpened(...args),
    trackResourcesPartnerWebsiteClicked: jest.fn(),
    trackResourcesProgramClicked: jest.fn(),
    trackResourcesLinkFailed: jest.fn(),
  };
  return { useAnalytics: () => analytics };
});

jest.mock('@/components/home/HomeHeader', () => () => null);
jest.mock('expo-web-browser', () => ({}));

import PartnerDetail from '@/app/(tabs)/Learn/resources/[slug]';
import { getActivePartners } from '@/constants/Partners';

const i18n = i18next.createInstance();
i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  initImmediate: false,
});

// A listing tagged British Columbia, and one that serves all of Canada.
const BC_SLUG = 'diversecity';
const NATIONAL_SLUG = getActivePartners('Ontario').find(
  p => !p.provinces || p.provinces.length === 0
)!.slug;

const notFound = en.learn.resources.notFound;

function renderRoute(slug: string) {
  mockSlug = slug;
  return render(
    <I18nextProvider i18n={i18n}>
      <PartnerDetail />
    </I18nextProvider>
  );
}

describe('Partner detail route for a user in a province', () => {
  beforeEach(() => {
    mockProvince = undefined;
    mockUserLoading = false;
    mockTrackOpened.mockReset();
  });

  it.each([
    ['an Ontario user', 'Ontario'],
    ['a user with no province', null],
    ['a user with unmatched free text', 'Somewhere Else'],
  ])('shows %s the not-found state for a BC-only partner', (_label, province) => {
    mockProvince = province;
    renderRoute(BC_SLUG);
    expect(screen.getByText(notFound)).toBeTruthy();
    expect(mockTrackOpened).not.toHaveBeenCalled();
  });

  it('shows a BC user the BC partner', () => {
    mockProvince = 'British Columbia';
    renderRoute(BC_SLUG);
    expect(screen.queryByText(notFound)).toBeNull();
    expect(mockTrackOpened.mock.calls[0][0]).toBe(BC_SLUG);
  });

  it('shows an Ontario user a national partner', () => {
    mockProvince = 'Ontario';
    renderRoute(NATIONAL_SLUG);
    expect(screen.queryByText(notFound)).toBeNull();
    expect(mockTrackOpened).toHaveBeenCalled();
  });

  it('does not decide about a BC-only partner before the profile loads', async () => {
    mockUserLoading = true;
    renderRoute(BC_SLUG);
    await act(async () => {});
    expect(screen.queryByText(notFound)).toBeNull();
    expect(mockTrackOpened).not.toHaveBeenCalled();
  });
});
