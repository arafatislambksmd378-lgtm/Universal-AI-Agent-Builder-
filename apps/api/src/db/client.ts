/**
 * Thin typed helpers over the D1 prepared-statement API.
 * Everything is parameterised — no string interpolation of user input.
 */

export type Db = D1Database;

export async function queryOne<T>(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const row = await db.prepare(sql).bind(...params).first<T>();
  return row ?? null;
}

export async function queryAll<T>(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results ?? [];
}

export async function execute(db: Db, sql: string, params: unknown[] = []): Promise<void> {
  await db.prepare(sql).bind(...params).run();
}

export function toBool(value: number | string | boolean | null | undefined): boolean {
  return value === 1 || value === '1' || value === true;
}
