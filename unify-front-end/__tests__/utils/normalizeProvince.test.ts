import {
  CANADIAN_PROVINCES,
  normalizeProvince,
  resolveUserProvince,
} from '@/constants/LocationData';

describe('normalizeProvince', () => {
  it('returns canonical names unchanged', () => {
    for (const province of CANADIAN_PROVINCES) {
      expect(normalizeProvince(province)).toBe(province);
    }
  });

  it('expands the postal abbreviations seen in production', () => {
    expect(normalizeProvince('ON')).toBe('Ontario');
    expect(normalizeProvince('BC')).toBe('British Columbia');
    expect(normalizeProvince('AB')).toBe('Alberta');
    expect(normalizeProvince('QC')).toBe('Quebec');
    expect(normalizeProvince('NL')).toBe('Newfoundland and Labrador');
    expect(normalizeProvince('PEI')).toBe('Prince Edward Island');
    expect(normalizeProvince('NWT')).toBe('Northwest Territories');
  });

  it('reads B.C. and B.C as British Columbia', () => {
    expect(normalizeProvince('B.C.')).toBe('British Columbia');
    expect(normalizeProvince('b.c.')).toBe('British Columbia');
    expect(normalizeProvince(' B.C ')).toBe('British Columbia');
    expect(resolveUserProvince('B.C.')).toBe('British Columbia');
  });

  it('is case and whitespace insensitive', () => {
    expect(normalizeProvince('  ontario ')).toBe('Ontario');
    expect(normalizeProvince('british  columbia')).toBe('British Columbia');
    expect(normalizeProvince('bc')).toBe('British Columbia');
    expect(normalizeProvince('Ont.')).toBe('Ontario');
    expect(normalizeProvince('Québec')).toBe('Quebec');
  });

  it('keeps unknown free-text values so user input is never dropped', () => {
    expect(normalizeProvince('Somewhere Else')).toBe('Somewhere Else');
  });

  it('maps null, undefined, and blank to null', () => {
    expect(normalizeProvince(null)).toBeNull();
    expect(normalizeProvince(undefined)).toBeNull();
    expect(normalizeProvince('   ')).toBeNull();
  });
});
