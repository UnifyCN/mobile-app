# IRCC fixtures

Official public IRCC data, fetched 2026-10-24 with the ingest user agent. No
credentials and no cookies are stored. Each file is the real response, re-printed
with 1-space indentation, and cut where noted. They are the inputs of the
converter tests.

| Fixture | Official address | HTTP | Size | Last-Modified | Cut |
| --- | --- | --- | --- | --- | --- |
| ee_rounds_sample.json | https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json | 200 | 693170 bytes | Fri, 16 Oct 2026 13:27:07 GMT | 12 newest rounds (#439 to #450) and the oldest (#1) of 451, complete records |
| ptime_country.json | .../json/data-ptime-en.json | 200 | 59384 bytes | Tue, 20 Oct 2026 20:45:41 GMT | none |
| ptime_non_country.json | .../json/data-ptime-non-country-en.json | 200 | 894 bytes | Tue, 20 Oct 2026 20:45:41 GMT | none (all non-country keys) |
| country_names.json | .../json/data-country-name-en.json | 200 | 4763 bytes | Thu, 16 Jul 2026 15:06:26 GMT | none; keeps the byte order mark IRCC serves |
| refugees_private_nested.json | .../json/data-ptime-en.json | 200 | | | only `refugees_private`: the entries with a value, and AF, AL and GL |
| flpt_current.json | .../json/flpt-en.json | 200 | 496261 bytes | Fri, 09 Oct 2026 19:04:09 GMT | `wait-times` and `people-ahead` cut to 5 of 3656 keys each |
| flpt_by_week.json | .../json/flpt-by-week-en.json | 200 | 48818 bytes | Tue, 20 Oct 2026 15:41:15 GMT | `wait-times` and `people-ahead` cut to 5 of 396 keys each |
| newsroom_shape.json | https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=100 | 200 | 59875 bytes | n/a | items published 2026-08-15 or later (11 of 100) |

The address of each file appears in IRCC's own page source: `rounds-invitations.html`
names `ee_rounds_123_en.json` (jsonmanager `roundsofinvitation`), and
`check-processing-times.html` names the other four (jsonmanager `ptime`,
`ptime_country`, `ptime_flpt`, `ptime_trflpt`; the country names are read by the
page's country fragments). The news address is the all-types feed linked from
`news/rss.html`, without `format=atom`.
