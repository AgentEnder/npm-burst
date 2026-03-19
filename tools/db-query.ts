import { Kysely, CompiledQuery, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';

const dbPath = process.env['D1_LOCAL_DB'] ?? 'apps/npm-burst/local.db';

const sql = process.argv.slice(2).join(' ');

if (!sql) {
  console.error('Usage: pnpm db:query "SELECT * FROM ..."');
  process.exit(1);
}

if (
  /\b(delete|drop|truncate|alter|insert|update)\b/i.test(sql) &&
  !/updated_at|created_at|deleted_at/i.test(sql)
) {
  console.error('Only SELECT queries are allowed.');
  process.exit(1);
}

if (!sql.trim().toLowerCase().startsWith('select')) {
  console.error('Only SELECT queries are allowed.');
  process.exit(1);
}

async function main() {
  const db = new Kysely<Record<string, unknown>>({
    dialect: new SqliteDialect({
      database: new Database(dbPath),
    }),
  });

  try {
    const result = await db.executeQuery(CompiledQuery.raw(sql));
    if (result.rows.length === 0) {
      console.log('No results.');
    } else {
      console.table(result.rows);
    }
  } catch (error) {
    console.error(
      'Query error:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

main();
