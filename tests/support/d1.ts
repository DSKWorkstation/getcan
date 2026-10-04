import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type Value = string | number | null;

// A small D1 lookalike over node:sqlite, enough for the queries GetCan runs.
class Statement {
  constructor(private db: DatabaseSync, private sql: string, private values: Value[] = []) {}
  bind(...values: unknown[]) {
    return new Statement(this.db, this.sql, values.map(v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v as Value));
  }
  private returnsRows() { return /^\s*(SELECT|WITH)\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql); }
  execute() {
    const statement = this.db.prepare(this.sql);
    if (this.returnsRows()) {
      const results = statement.all(...this.values) as Record<string, unknown>[];
      const changes = /^\s*(SELECT|WITH)\b/i.test(this.sql) ? 0 : Number((this.db.prepare('SELECT changes() AS c').get() as { c: number }).c);
      return { results: results.map(row => ({ ...row })), success: true, meta: { changes } };
    }
    const result = statement.run(...this.values);
    return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async first<T>(column?: string): Promise<T | null> {
    const row = this.execute().results[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }
  async all<T>() { return this.execute() as unknown as { results: T[]; success: boolean; meta: { changes: number } }; }
  async run() { return this.execute(); }
}

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const dir = new URL('../../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter(name => name.endsWith('.sql')).sort())
    for (const sql of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')) if (sql.trim()) db.exec(sql);
  return {
    sqlite: db,
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: Statement[]) {
      db.exec('BEGIN');
      try { const results = statements.map(s => s.execute()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async exec(sql: string) { db.exec(sql); return { count: 1, duration: 0 }; },
  };
}
export type TestD1 = ReturnType<typeof createD1>;
