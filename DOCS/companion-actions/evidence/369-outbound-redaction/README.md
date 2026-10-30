# Outbound evidence redaction

GitHub rejected the first mobile push because unpublished local startup evidence contained a Supabase secret key. No push-protection bypass was used. No remote branch changed on that attempt.

The first redaction candidate removed six credential fields from one log. Independent review R1 rejected it because two other outgoing logs retained the original JWT secret and database URL. This revision also redacts those two values. The first candidate and its rejection remain locally preserved.

Each changed field now says `<REDACTED_LOCAL_FIELDNAME>` with its actual field name. Each log keeps its other bytes. These files are redacted evidence, not complete raw originals.

The original approved source remains at `f9c1b606d7f7afbe04184c7fb04a788da6c28511`. All eight original commits, raw logs, manifests, tests, and reviews remain in that source and in the local Git object database. Historical manifest hashes identify those original records. They do not identify the redacted outbound copies. The table below records both forms.

| Path | Changed fields | Original SHA-256 | Redacted SHA-256 |
| --- | --- | --- | --- |
| `DOCS/companion-actions/evidence/369-push-server-r1/startup.log` | JWT_SECRET | `8f64887c3268c5368a335e539ce4e5a43208b2d1620c371515fda893b1cd7fc4` | `ad6eb7a8af33cc59dac7d98f25ef8db4e50c0d78347b7695ceaacd7fd07e04fd` |
| `DOCS/companion-actions/evidence/369-server-corrections-r1/startup.log` | DB_URL, PUBLISHABLE_KEY, SECRET_KEY, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY | `d8e2dc4c86f993e11360abd1e893b22a4b264ca8407dc632925664dda1783bb8` | `46bb0e8bd9a638ff345f2d69e897ad741f3428da14e471c6d76229426d91d3ce` |
| `DOCS/companion-actions/evidence/369-mobile-corrections-r1/local-start.log` | DB_URL | `45a617fe850f183e0037dcd7c70838b7e24740ab964f388113dfc57cbbf2794d` | `1b0fba51e171c206f089848b9bab7684deb8fd1cdc0e247ba08ed51bd728df4a` |

The scan scope is the new outgoing object range after remote base `19c2d0d6ea9d7b90d1bb0b10ae345cf6f2cbe83c`. Previously published base evidence is unchanged. Independent R1 found inherited credential-value matches in three older blobs. This revision does not claim that all inherited history is credential-free. It removes the specified values and token forms from new outgoing objects only.

The outbound application, tests, SQL, contracts, dependencies, configuration, and instruction files match the approved candidate byte for byte. The only content differences are these three log redactions and this note. New descendant commit identifiers follow from the changed evidence trees. This step adds no new native, hosted, provider, ticket, or release proof.
