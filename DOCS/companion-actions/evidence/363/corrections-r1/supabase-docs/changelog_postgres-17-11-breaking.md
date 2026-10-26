---
slug: postgres-15-19-17-11-breaking-changes
published: 2026-09-25
change_type: breaking-change
affected_products:
  - Database
page: https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes
---

# PostgreSQL 15.19 / 17.11 minor release — action may be required for ltree, pgcrypto, btree_gist, and custom operators

## What changed

We are rolling out the PostgreSQL **15.19 / 17.11** minor release (from 15.14 / 17.6).
It bundles five upstream security cycles and closes **44 CVEs**.
Four changes may require action, depending on how you use your database:

1. **ltree indexes may need reindexing** — a case-folding fix on multibyte/ICU databases, plus an integer-overflow fix for very deep `ltree` values (any encoding).
2. **pgcrypto stops decrypting legacy-cipher PGP data** (CVE-2026-14663) — data encrypted with `cipher-algo=bf`/`blowfish`/`cast5` was effectively stored unencrypted and fails to decrypt by default after the upgrade.
3. **btree_gist indexes on float columns** that may contain `NaN` need reindexing.
4. **Custom operators with non-built-in selectivity estimators** (CVE-2026-2004) — recreating them (dump/restore, branching) now requires superuser.

If none of the detection queries below return rows for your project, no action is needed.

## Why we made this change

This is an upstream PostgreSQL minor release.
Staying current closes 44 CVEs (including several rated High) and picks up correctness fixes in the `ltree` and `btree_gist` extensions.

## Who is affected

### 1. ltree indexes

#### Case-folding (multibyte/ICU)

After upgrading, indexes on `ltree` columns built under the previous version can silently return incomplete results on databases using a multibyte encoding (such as UTF-8) or a non-`libc` collation provider (ICU or builtin).
Check whether your database is affected:

```sql
select
  pg_encoding_to_char(encoding) as encoding,
  pg_encoding_max_length(encoding) as max_bytes_per_char, -- 1 = single-byte, >1 = multibyte
  datlocprovider as collation_provider, -- 'c' libc, 'i' icu, 'b' builtin
  (pg_encoding_max_length(encoding) > 1 or datlocprovider != 'c') as reindex_required
from pg_database
where datname = current_database();
```

If `reindex_required` is `true`, find the affected indexes:

```sql
select distinct
  n.nspname as schema_name,
  cls.relname as table_name,
  ic.relname as index_name
from pg_index idx
  join pg_class ic on idx.indexrelid = ic.oid
  join pg_class cls on idx.indrelid = cls.oid
  join pg_namespace n on ic.relnamespace = n.oid
  join lateral unnest(idx.indclass::oid[]) with ordinality as k(opclass, pos) on true
  join pg_opclass oc on oc.oid = k.opclass
  join pg_type ty on ty.oid = oc.opcintype
where
  k.pos <= idx.indnkeyatts -- key columns only, excludes INCLUDE
  and ty.typname in ('ltree', '_ltree');
```

#### Integer overflow (any encoding)

This release also fixes an integer overflow in `ltree` comparisons: values with more than about 14,653 labels could compare incorrectly, which can corrupt B-tree indexes built over them, regardless of your database encoding.
This query lists only the B-tree indexes that actually contain such values (an empty result means no action is needed):

```sql
select s.schema_name || '.' || s.index_name as index_to_reindex
from (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    ic.relname as index_name,
    min(pg_get_expr(i.indpred, i.indrelid)) as pred, -- partial-index predicate, if any
    string_agg('nlevel(' || pg_get_indexdef(i.indexrelid, k.pos::int, true) || ') > 14653', ' or ') as keys_cond
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_am am on am.oid = ic.relam
  join lateral generate_series(1, i.indnkeyatts) as k(pos) on true
  join pg_attribute ia on ia.attrelid = i.indexrelid and ia.attnum = k.pos
  join pg_type t on t.oid = ia.atttypid
  where am.amname = 'btree'
    and t.typname = 'ltree'
    and n.nspname not in ('pg_catalog', 'information_schema')
  group by n.nspname, c.relname, ic.relname
) s
where (xpath(
         '/row/cnt/text()',
         query_to_xml(
           format('select count(*) as cnt from %I.%I where %s(%s)',
                  s.schema_name,
                  s.table_name,
                  case when s.pred is not null then '(' || s.pred || ') and ' else '' end,
                  s.keys_cond),
           false,
           true,
           ''
         )
       ))[1]::text::bigint > 0
order by 1;
```

### 2. pgcrypto legacy ciphers (CVE-2026-14663)

If you call `pgp_sym_encrypt`/`pgp_pub_encrypt` (or their `_bytea` variants) with `cipher-algo=bf`, `cipher-algo=blowfish`, or `cipher-algo=cast5`, that data was effectively stored **unencrypted** — decryption succeeds even with the wrong key.
The default cipher (AES) and `3des` are not affected.
If you never passed a `cipher-algo` option, no action is needed.

To find affected rows, scan each stored value with a deliberately wrong passphrase: properly encrypted values raise an error, while affected values decrypt successfully even with the wrong key.
Run the helper and the scan in the same session (`pg_temp` functions are session-scoped):

```sql
create function pg_temp.affected_by_cve_2026_14663(msg bytea)
returns boolean
language plpgsql as $$
begin
  perform pgp_sym_decrypt_bytea(msg, 'deliberately-wrong-key');
  return true;
exception when others then
  return false;
end $$;

select <id_column>
from <your_table>
where <your_encrypted_column> is not null
  and pg_temp.affected_by_cve_2026_14663(<your_encrypted_column>);
```

Any rows returned hold affected values.
The scan covers symmetric (`pgp_sym_*`) messages.
The wrong-key probe does not apply to public-key (`pgp_pub_*`) messages.
If `pgp_pub_encrypt` was used with an affected `cipher-algo`, treat those values as affected and re-encrypt them the same way using `pgp_pub_decrypt` and `pgp_pub_encrypt` with the key pair.

### 3. btree_gist indexes on float columns

Indexes built under the previous version can return wrong results for rows containing `NaN` until reindexed.
Find `btree_gist` indexes on float columns:

```sql
select distinct
  n.nspname as schema_name,
  cls.relname as table_name,
  ic.relname as index_name
from pg_index idx
  join pg_class ic on idx.indexrelid = ic.oid
  join pg_am am on ic.relam = am.oid
  join pg_class cls on idx.indrelid = cls.oid
  join pg_namespace n on ic.relnamespace = n.oid
  join lateral unnest(idx.indclass::oid[]) with ordinality as k(opclass, pos) on true
  join pg_opclass oc on oc.oid = k.opclass
  join pg_type ty on ty.oid = oc.opcintype
where
  am.amname = 'gist'
  and k.pos <= idx.indnkeyatts
  and ty.typname in ('float4', 'float8');
```

You are affected only if indexes are returned and those columns may contain `NaN` values.

### 4. Custom operators (CVE-2026-2004)

Only superusers may now attach a non-built-in selectivity estimator to an operator.
Existing operators keep working.
Only re-creation (dump/restore, branching, major-version upgrade) fails.

Operators installed by extensions (PostGIS, intarray, etc.) are not affected.
Check for affected operators:

```sql
select
  n.nspname as schema, o.oprname as operator,
  o.oprrest::regproc as restrict_estimator,
  o.oprjoin::regproc as join_estimator
from pg_operator o
join pg_namespace n on o.oprnamespace = n.oid
where n.nspname not in ('pg_catalog', 'information_schema')
  and ((o.oprrest <> 0 and o.oprrest::oid >= 10000)
    or (o.oprjoin <> 0 and o.oprjoin::oid >= 10000))
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_operator'::regclass and d.objid = o.oid and d.deptype = 'e'
  );
```

## What happens if you take no action

- **ltree / btree_gist:** affected index searches may silently return wrong or incomplete results - no error is raised.
- **pgcrypto:** decryption of affected messages fails by default after the upgrade (recoverable with the `ignore-cipher-failure=1` decrypt option).
  The underlying data remains effectively unencrypted at rest until re-encrypted.
- **Custom operators:** a future dump/restore, branch, or major-version upgrade fails to recreate the operator.

## Migration steps

1. Run the detection queries above for each database.
2. After upgrading, reindex each affected ltree/btree_gist index using its schema-qualified name — `REINDEX INDEX CONCURRENTLY <schema_name>.<index_name>;` runs online with no downtime, but cannot run inside a transaction block.
3. For pgcrypto: re-encrypt affected values with a modern cipher (for example `cipher-algo=aes256`), before the upgrade or after it using `ignore-cipher-failure=1`, and consider rotating secrets stored this way.
4. For custom operators: recreate without the `RESTRICT`/`JOIN` clause (or with a built-in estimator), or contact support and we'll assist.

## Rollout timeline

| Date       | Milestone                                            | User action                       |
| ---------- | ---------------------------------------------------- | --------------------------------- |
| 2026-09-25 | Release announce (this entry)                        | Run detection queries             |
| 2026-09-28 | New projects created on 15.19 / 17.11                | —                                 |
| 2026-09-28 | [Upgrade](https://supabase.com/docs/guides/platform/upgrading) available in dashboard for existing projects | Upgrade, then reindex if affected |
