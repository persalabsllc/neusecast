import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../drizzle/0011_broadcast_control.sql", import.meta.url);

test("the broadcast migration has no duplicate table columns", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const tables = [...migration.matchAll(/CREATE TABLE "([^"]+)" \(\n([\s\S]*?)\n\);/g)];

  assert.ok(tables.length >= 10, "expected the broadcast-control tables in migration 0011");
  for (const [, tableName, body] of tables) {
    const columns = body.split("\n").flatMap((line) => {
      const match = /^\s*"([^"]+)"\s/.exec(line);
      return match ? [match[1]] : [];
    });
    assert.equal(
      new Set(columns).size,
      columns.length,
      `migration 0011 declares a duplicate column in ${tableName}`,
    );
  }
});
