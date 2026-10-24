import { splitDescriptionLinks } from '../../utils/descriptionLinks';

const CFIA =
  'https://inspection.canada.ca/en/importing-food-plants-animals/pets';

describe('splitDescriptionLinks', () => {
  it('returns one text segment for a description with no URL', () => {
    const text = 'Why: Bring your passport. See page 3, section A.';
    expect(splitDescriptionLinks(text)).toEqual([{ kind: 'text', text }]);
  });

  it('splits out an https URL at the end of the text, unchanged', () => {
    expect(
      splitDescriptionLinks(`Check the official CFIA page: ${CFIA}`)
    ).toEqual([
      { kind: 'text', text: 'Check the official CFIA page: ' },
      { kind: 'link', text: CFIA, url: CFIA },
    ]);
  });

  it('keeps sentence punctuation after a URL out of the link', () => {
    expect(splitDescriptionLinks(`See ${CFIA}. Then call.`)).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'link', text: CFIA, url: CFIA },
      { kind: 'text', text: '. Then call.' },
    ]);
    expect(splitDescriptionLinks(`(see ${CFIA})`)).toEqual([
      { kind: 'text', text: '(see ' },
      { kind: 'link', text: CFIA, url: CFIA },
      { kind: 'text', text: ')' },
    ]);
  });

  it('never links a protocol other than http or https', () => {
    const text =
      'javascript:alert(1) mailto:a@b.ca tel:5551234 file:///etc/hosts ftp://x.ca/y intent://scan/#Intent;end';
    expect(splitDescriptionLinks(text)).toEqual([{ kind: 'text', text }]);
  });

  it('links several URLs and keeps the text between them', () => {
    const other = 'http://example.ca/a?b=1&c=2';
    const segments = splitDescriptionLinks(`A ${CFIA} B ${other}`);
    expect(segments.filter(s => s.kind === 'link').map(s => s.text)).toEqual([
      CFIA,
      other,
    ]);
    expect(segments.map(s => s.text).join('')).toBe(`A ${CFIA} B ${other}`);
  });
});
