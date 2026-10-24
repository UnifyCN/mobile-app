import { getMorePartnersNoteProvince } from '@/utils/morePartnersNote';

describe('getMorePartnersNoteProvince', () => {
  it('shows the note, with the province name, for a known non-BC province', () => {
    expect(getMorePartnersNoteProvince('Ontario')).toBe('Ontario');
    expect(getMorePartnersNoteProvince('Nova Scotia')).toBe('Nova Scotia');
  });

  it('reads stored abbreviations the way the profile does', () => {
    expect(getMorePartnersNoteProvince('AB')).toBe('Alberta');
  });

  it('hides the note for British Columbia', () => {
    expect(getMorePartnersNoteProvince('British Columbia')).toBeNull();
    expect(getMorePartnersNoteProvince('BC')).toBeNull();
  });

  it('hides the note when there is no province or it is not recognized', () => {
    expect(getMorePartnersNoteProvince(null)).toBeNull();
    expect(getMorePartnersNoteProvince(undefined)).toBeNull();
    expect(getMorePartnersNoteProvince('')).toBeNull();
    expect(getMorePartnersNoteProvince('Somewhere Else')).toBeNull();
  });
});
