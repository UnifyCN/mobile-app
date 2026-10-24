// Fixture loaders for converter tests. Not imported by production code.
import type { ProcessingTimeFiles } from './processingTimes.ts';

export function readFixture(name: string): unknown {
  const text = Deno.readTextFileSync(
    new URL(`../fixtures/ircc/${name}`, import.meta.url)
  );
  // The country-name file starts with a byte order mark, as IRCC serves it.
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

export function processingFiles(): ProcessingTimeFiles {
  return {
    countryTimes: readFixture('ptime_country.json'),
    nonCountryTimes: readFixture('ptime_non_country.json'),
    countryNames: readFixture('country_names.json'),
    flpt: readFixture('flpt_current.json'),
    flptByWeek: readFixture('flpt_by_week.json'),
  };
}
