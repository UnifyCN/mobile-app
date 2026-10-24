// A stand-in for the supabase-js query builder over a local Postgres. Test
// support only, not production code.
//
// The ingest store is written against supabase-js, and no PostgREST server runs
// in CI. This shim keeps the real store code and the real schema in the test
// and replaces only the HTTP hop. It is strict where PostgREST and Supabase are:
//   * a column that does not exist is an error (42703), as PostgREST answers;
//   * UPDATE and DELETE without a filter are refused, as Supabase's pg_safeupdate
//     does;
//   * .single() and .maybeSingle() fail on the wrong row count (PGRST116 for
//     more than one row, and for none with .single());
//   * rows come back as JSON would: timestamps as ISO strings, bigint as number.
//   * rpc() calls a function by named arguments, as PostgREST does, and a
//     raised exception comes back as an error with its SQLSTATE.
// What it does not prove: PostgREST's own URL parsing, row-level security, or
// request size limits. Those are noted in the report.
import type { Db } from './sharedDb.ts';

interface Filter {
  op: 'eq' | 'lt' | 'in';
  column: string;
  value: unknown;
}

export interface RequestLog {
  table: string;
  action: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
  filters: string[];
  /** Largest value list in an `in` filter. */
  largestInList: number;
  rowCount: number;
}

interface ApiError {
  code: string;
  message: string;
}

const COLUMN_TYPE_CACHE = new WeakMap<Db, Map<string, Map<string, string>>>();

async function columnTypes(
  db: Db,
  table: string
): Promise<Map<string, string>> {
  const perDb = COLUMN_TYPE_CACHE.get(db) ?? new Map();
  COLUMN_TYPE_CACHE.set(db, perDb);
  // Not cached across calls: a migration can add a column between requests.
  const result = await db.query<{ column_name: string; udt_name: string }>(
    `select column_name, udt_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table]
  );
  const types = new Map(result.rows.map(r => [r.column_name, r.udt_name]));
  perDb.set(table, types);
  return types;
}

function sqlType(udt: string): string {
  return udt.startsWith('_') ? `${udt.slice(1)}[]` : udt;
}

function param(value: unknown, udt: string): unknown {
  if (value === null || value === undefined) return null;
  if (udt === 'vector' && Array.isArray(value)) return `[${value.join(',')}]`;
  if ((udt === 'jsonb' || udt === 'json') && typeof value !== 'string') {
    return JSON.stringify(value);
  }
  return value;
}

function jsonRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toISOString()
        : typeof value === 'bigint'
          ? Number(value)
          : value,
    ])
  );
}

class Query implements PromiseLike<{ data: unknown; error: ApiError | null }> {
  private action: RequestLog['action'] = 'select';
  private columns = '*';
  private payload: Record<string, unknown>[] = [];
  private filters: Filter[] = [];
  private returning: string | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';

  constructor(
    private db: Db,
    private table: string,
    private log: RequestLog[]
  ) {}

  select(columns = '*') {
    if (this.action === 'select') this.columns = columns;
    else this.returning = columns;
    return this;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.action = 'update';
    this.payload = [patch];
    return this;
  }
  delete() {
    this.action = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push({ op: 'lt', column, value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ op: 'in', column, value });
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }

  then<R1, R2>(
    onfulfilled?:
      | ((v: { data: unknown; error: ApiError | null }) => R1 | PromiseLike<R1>)
      | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<{ data: unknown; error: ApiError | null }> {
    const types = await columnTypes(this.db, this.table);
    if (types.size === 0) {
      return fail('42P01', `relation "public.${this.table}" does not exist`);
    }
    const wanted = new Set<string>();
    const selected = (
      this.returning ?? (this.action === 'select' ? this.columns : null)
    )
      ?.split(',')
      .map(c => c.trim())
      .filter(c => c !== '*' && c !== '');
    for (const c of selected ?? []) wanted.add(c);
    for (const f of this.filters) wanted.add(f.column);
    for (const row of this.payload)
      for (const c of Object.keys(row)) wanted.add(c);
    for (const c of wanted) {
      if (!types.has(c)) {
        return fail('42703', `column ${this.table}.${c} does not exist`);
      }
    }
    if (
      (this.action === 'update' || this.action === 'delete') &&
      this.filters.length === 0
    ) {
      return fail(
        '21000',
        `${this.action.toUpperCase()} requires a WHERE clause`
      );
    }

    const params: unknown[] = [];
    const bind = (value: unknown, udt: string, array = false) => {
      params.push(array ? value : param(value, udt));
      return array
        ? `$${params.length}::${sqlType(udt)}[]`
        : `$${params.length}::${sqlType(udt)}`;
    };
    const where =
      this.filters.length === 0
        ? ''
        : ' where ' +
          this.filters
            .map(f => {
              const udt = types.get(f.column)!;
              if (f.op === 'in')
                return `"${f.column}" = any(${bind(f.value, udt, true)})`;
              return `"${f.column}" ${f.op === 'eq' ? '=' : '<'} ${bind(f.value, udt)}`;
            })
            .join(' and ');
    const projection =
      selected && selected.length > 0
        ? selected.map(c => `"${c}"`).join(', ')
        : '*';

    let sql: string;
    if (this.action === 'insert') {
      const keys = [...new Set(this.payload.flatMap(r => Object.keys(r)))];
      const tuples = this.payload.map(
        row =>
          '(' +
          keys
            .map(k => (k in row ? bind(row[k], types.get(k)!) : 'default'))
            .join(', ') +
          ')'
      );
      sql =
        `insert into public."${this.table}" (${keys.map(k => `"${k}"`).join(', ')}) values ${tuples.join(', ')}` +
        (this.returning ? ` returning ${projection}` : '');
    } else if (this.action === 'update') {
      const patch = this.payload[0];
      const sets = Object.keys(patch).map(
        k => `"${k}" = ${bind(patch[k], types.get(k)!)}`
      );
      sql =
        `update public."${this.table}" set ${sets.join(', ')}${where}` +
        (this.returning ? ` returning ${projection}` : '');
    } else if (this.action === 'delete') {
      sql =
        `delete from public."${this.table}"${where}` +
        (this.returning ? ` returning ${projection}` : '');
    } else {
      sql = `select ${projection} from public."${this.table}"${where}`;
    }

    let rows: Record<string, unknown>[];
    let affected = 0;
    try {
      const result = await this.db.query<Record<string, unknown>>(sql, params);
      rows = result.rows.map(jsonRow);
      affected = result.affectedRows ?? rows.length;
    } catch (error) {
      const e = error as { code?: string; message?: string };
      return fail(e.code ?? 'XX000', e.message ?? String(error));
    }
    this.log.push({
      table: this.table,
      action: this.action,
      filters: this.filters.map(f => `${f.op}:${f.column}`),
      largestInList: Math.max(
        0,
        ...this.filters
          .filter(f => f.op === 'in')
          .map(f => (f.value as unknown[]).length)
      ),
      rowCount: affected,
    });

    const returnsRows = this.action === 'select' || this.returning !== null;
    if (!returnsRows) return { data: null, error: null };
    if (this.mode === 'many') return { data: rows, error: null };
    if (rows.length > 1) {
      return fail(
        'PGRST116',
        'JSON object requested, multiple (or no) rows returned'
      );
    }
    if (rows.length === 0) {
      return this.mode === 'single'
        ? fail(
            'PGRST116',
            'JSON object requested, multiple (or no) rows returned'
          )
        : { data: null, error: null };
    }
    return { data: rows[0], error: null };
  }
}

function fail(code: string, message: string) {
  return { data: null, error: { code, message } as ApiError };
}

/**
 * Calls public.<fn> with named arguments. The overload is the one whose
 * argument names are exactly the given keys, as PostgREST chooses. A scalar
 * result comes back as the value, a void result as null.
 */
async function rpc(
  db: Db,
  fn: string,
  args: Record<string, unknown>,
  log: RequestLog[]
): Promise<{ data: unknown; error: ApiError | null }> {
  const overloads = await db.query<{
    names: string[] | null;
    types: string[];
    returns: string;
  }>(
    `select p.proargnames as names,
            array(select format_type(t, null) from unnest(p.proargtypes) t) as types,
            format_type(p.prorettype, null) as returns
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [fn]
  );
  const keys = Object.keys(args).sort();
  const match = overloads.rows.find(
    o => JSON.stringify([...(o.names ?? [])].sort()) === JSON.stringify(keys)
  );
  if (!match) {
    return fail('PGRST202', `Could not find the function public.${fn}`);
  }
  const params: unknown[] = [];
  const named = (match.names ?? []).map((name, i) => {
    const type = match.types[i];
    const value = args[name];
    params.push(
      value === null || value === undefined
        ? null
        : type === 'jsonb' || type === 'json'
          ? JSON.stringify(value)
          : value
    );
    return `"${name}" => $${params.length}::${type}`;
  });
  try {
    const result = await db.query<{ result: unknown }>(
      `select public."${fn}"(${named.join(', ')}) as result`,
      params
    );
    log.push({
      table: fn,
      action: 'rpc',
      filters: [],
      largestInList: 0,
      rowCount: result.rows.length,
    });
    const value = result.rows[0]?.result;
    return {
      data:
        match.returns === 'void'
          ? null
          : typeof value === 'bigint'
            ? Number(value)
            : value,
      error: null,
    };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return fail(e.code ?? 'XX000', e.message ?? String(error));
  }
}

export function postgrestShim(db: Db) {
  const requests: RequestLog[] = [];
  return {
    client: {
      from: (table: string) => new Query(db, table, requests),
      rpc: (fn: string, args: Record<string, unknown> = {}) =>
        rpc(db, fn, args, requests),
    },
    requests,
  };
}
