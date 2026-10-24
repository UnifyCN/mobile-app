import {
  PROVINCES,
  isVisibleForProvince,
  toKnownProvince,
} from '@/supabase/functions/_shared/province';
import {
  CANADIAN_PROVINCES,
  resolveUserProvince,
} from '@/constants/LocationData';

describe('province list', () => {
  it('is the same 13 names the app already uses', () => {
    expect([...PROVINCES]).toEqual(CANADIAN_PROVINCES);
    expect(PROVINCES).toHaveLength(13);
  });
});

describe('toKnownProvince', () => {
  it('keeps one of the 13 names', () => {
    for (const province of PROVINCES) {
      expect(toKnownProvince(province)).toBe(province);
    }
  });

  it('treats null, blank and unmatched free text as no province', () => {
    expect(toKnownProvince(null)).toBeNull();
    expect(toKnownProvince(undefined)).toBeNull();
    expect(toKnownProvince('')).toBeNull();
    expect(toKnownProvince('Somewhere Else')).toBeNull();
    expect(toKnownProvince('ontario')).toBeNull();
  });
});

describe('resolveUserProvince (profile value to province)', () => {
  it('normalizes stored spellings to a province', () => {
    expect(resolveUserProvince('ON')).toBe('Ontario');
    expect(resolveUserProvince('  british  columbia ')).toBe(
      'British Columbia'
    );
  });

  it('gives no province for null, blank or free text', () => {
    expect(resolveUserProvince(null)).toBeNull();
    expect(resolveUserProvince('   ')).toBeNull();
    expect(resolveUserProvince('Somewhere Else')).toBeNull();
  });
});

describe('isVisibleForProvince', () => {
  it('shows a national item (no province) to everyone, including no province', () => {
    for (const national of [undefined, null, '', []]) {
      expect(isVisibleForProvince(national, 'Ontario')).toBe(true);
      expect(isVisibleForProvince(national, 'British Columbia')).toBe(true);
      expect(isVisibleForProvince(national, null)).toBe(true);
      expect(isVisibleForProvince(national, 'Somewhere Else')).toBe(true);
    }
  });

  it('shows a single-province item only to that province', () => {
    expect(isVisibleForProvince('British Columbia', 'British Columbia')).toBe(
      true
    );
    expect(isVisibleForProvince('British Columbia', 'Ontario')).toBe(false);
    expect(isVisibleForProvince('British Columbia', 'Alberta')).toBe(false);
  });

  it('shows a list item to every province in the list and no other', () => {
    const list = ['British Columbia', 'Alberta'];
    expect(isVisibleForProvince(list, 'Alberta')).toBe(true);
    expect(isVisibleForProvince(list, 'British Columbia')).toBe(true);
    expect(isVisibleForProvince(list, 'Ontario')).toBe(false);
  });

  it('shows a user with no province national items only', () => {
    expect(isVisibleForProvince('British Columbia', null)).toBe(false);
    expect(isVisibleForProvince('British Columbia', undefined)).toBe(false);
    expect(isVisibleForProvince('British Columbia', '')).toBe(false);
    expect(isVisibleForProvince(['British Columbia', 'Alberta'], null)).toBe(
      false
    );
  });

  it('counts unmatched free text as no province', () => {
    expect(isVisibleForProvince('British Columbia', 'Somewhere Else')).toBe(
      false
    );
    expect(isVisibleForProvince(['Ontario'], 'Ont')).toBe(false);
  });
});
