// The character references IRCC puts in its JSON text values, such as
// "People&rsquo;s" in a country name. It decodes references only: it never
// strips tags or changes any other character. A reference it does not know is
// left as written, so no text is lost.
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '\u2014',
  hellip: '…',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  auml: 'ä',
  aring: 'å',
  atilde: 'ã',
  ccedil: 'ç',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  iacute: 'í',
  igrave: 'ì',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  oacute: 'ó',
  ograve: 'ò',
  ocirc: 'ô',
  ouml: 'ö',
  oslash: 'ø',
  uacute: 'ú',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  Aacute: 'Á',
  Ccedil: 'Ç',
  Eacute: 'É',
  Egrave: 'È',
  Iacute: 'Í',
  Ntilde: 'Ñ',
  Oacute: 'Ó',
  Ocirc: 'Ô',
  Uacute: 'Ú',
};

function fromCodePoint(code: number, original: string): string {
  const valid =
    code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
  return valid ? String.fromCodePoint(code) : original;
}

/** One pass, so the text "&amp;rsquo;" becomes "&rsquo;" and stops there. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]*));/g,
    (original, decimal?: string, hex?: string, name?: string) => {
      if (decimal !== undefined)
        return fromCodePoint(parseInt(decimal, 10), original);
      if (hex !== undefined) return fromCodePoint(parseInt(hex, 16), original);
      return Object.hasOwn(NAMED, name!) ? NAMED[name!] : original;
    }
  );
}
