#!/usr/bin/env node
// Asserts that all locale translation files have an identical key shape.
// Run via `npm run check-i18n` — exits non-zero if any locale is missing keys
// or has extras vs the EN baseline.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..', 'i18n', 'locales');
const LOCALES = ['en', 'vi', 'es', 'hi', 'ar', 'fr-CA', 'pa'];
const BASELINE = 'en';

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function load(lang) {
  const path = join(localesDir, lang, 'translation.json');
  try {
    return flatten(JSON.parse(readFileSync(path, 'utf8')));
  } catch (e) {
    throw new Error(`Failed to load locale '${lang}' from ${path}: ${e.message}`);
  }
}

// Extract {{name}} interpolation tokens; ignores i18next plural suffixes like {{count, number}}.
const PLACEHOLDER_RE = /\{\{\s*([\w.]+)(?:\s*,[^}]*)?\s*\}\}/g;
function extractPlaceholders(value) {
  if (typeof value !== 'string') return new Set();
  const tokens = new Set();
  let m;
  while ((m = PLACEHOLDER_RE.exec(value)) !== null) tokens.add(m[1]);
  return tokens;
}
function setEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// CLDR plural-category keys (`key_one`, `key_few`, ...) differ by language: en
// has one/other, ar has zero/one/two/few/many/other, vi has other only. They
// are compared by base key, every locale must define `_other`, and each form
// must keep the placeholders of the baseline `_other` form.
const PLURAL_CATEGORY_RE = /_(zero|one|two|few|many|other)$/;
const splitPlural = flat => {
  const plain = {};
  const bases = {};
  for (const [key, value] of Object.entries(flat)) {
    const m = PLURAL_CATEGORY_RE.exec(key);
    if (!m) {
      plain[key] = value;
      continue;
    }
    const base = key.slice(0, m.index);
    (bases[base] ??= {})[m[1]] = value;
  }
  return { plain, bases };
}

const baseline = load(BASELINE);
const baselineSplit = splitPlural(baseline);
let hasError = false;

for (const lang of LOCALES) {
  if (lang === BASELINE) continue;
  const full = load(lang);
  const { plain: other, bases: otherBases } = splitPlural(full);
  const missing = Object.keys(baselineSplit.plain).filter(k => !(k in other));
  const extra = Object.keys(other).filter(k => !(k in baselineSplit.plain));
  const placeholderMismatches = [];
  for (const key of Object.keys(baselineSplit.plain)) {
    if (!(key in other)) continue;
    const want = extractPlaceholders(baselineSplit.plain[key]);
    const got = extractPlaceholders(other[key]);
    if (!setEqual(want, got)) {
      placeholderMismatches.push({
        key,
        want: [...want].sort(),
        got: [...got].sort(),
      });
    }
  }
  for (const base of Object.keys(baselineSplit.bases)) {
    const forms = otherBases[base];
    if (!forms) {
      missing.push(`${base}_*`);
      continue;
    }
    if (!('other' in forms)) missing.push(`${base}_other`);
    // `count` may be spelled out ("one day") in forms that name the number.
    const want = extractPlaceholders(baselineSplit.bases[base].other);
    want.delete('count');
    for (const [category, value] of Object.entries(forms)) {
      const got = extractPlaceholders(value);
      got.delete('count');
      if (!setEqual(want, got)) {
        placeholderMismatches.push({
          key: `${base}_${category}`,
          want: [...want].sort(),
          got: [...got].sort(),
        });
      }
    }
  }
  for (const base of Object.keys(otherBases)) {
    if (!(base in baselineSplit.bases)) extra.push(`${base}_*`);
  }
  if (
    missing.length === 0 &&
    extra.length === 0 &&
    placeholderMismatches.length === 0
  ) {
    console.log(`✔ ${lang}: ${Object.keys(full).length} keys (matches ${BASELINE})`);
  } else {
    hasError = true;
    console.error(`✗ ${lang}: drift vs ${BASELINE}`);
    if (missing.length) {
      console.error(`  missing (${missing.length}): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`);
    }
    if (extra.length) {
      console.error(`  extra (${extra.length}): ${extra.slice(0, 10).join(', ')}${extra.length > 10 ? '...' : ''}`);
    }
    if (placeholderMismatches.length) {
      console.error(`  placeholder mismatch (${placeholderMismatches.length}):`);
      for (const m of placeholderMismatches.slice(0, 10)) {
        console.error(`    ${m.key}: want {${m.want.join(',')}} got {${m.got.join(',')}}`);
      }
      if (placeholderMismatches.length > 10) console.error('    ...');
    }
  }
}

if (hasError) {
  console.error('\ni18n parity check FAILED. Run translations to bring locales in sync.');
  process.exit(1);
}
console.log(`\ni18n parity OK: ${Object.keys(baselineSplit.plain).length + Object.keys(baselineSplit.bases).length} keys per locale.`);
