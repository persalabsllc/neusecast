import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";

const databaseUrl = process.env.DATABASE_URL;
// Migrations 0000-0004 were applied by Drizzle's timestamp-only runner, and
// some of those legacy files were later intentionally normalized. Preserve
// that established production baseline; migration 0005 and every subsequent
// migration must match its recorded hash exactly.
const STRICT_MIGRATION_HASH_FROM_MILLIS = 1787601972302;

if (!databaseUrl && process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production") {
  throw new Error("DATABASE_URL is required for a production deployment.");
} else if (!databaseUrl) {
  console.log("DATABASE_URL is not set; skipping database migrations for this build.");
} else if (process.env.VERCEL === "1" && process.env.VERCEL_ENV !== "production") {
  console.log("Skipping database migrations for a non-production Vercel deployment.");
} else {
  const client = neon(databaseUrl);
  const owner = randomUUID();
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  await client`
    CREATE TABLE IF NOT EXISTS "neusecast_migration_lock" (
      "id" integer PRIMARY KEY,
      "owner" text NOT NULL,
      "locked_until" timestamp with time zone NOT NULL
    )
  `;

  let acquired = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const rows = await client`
      INSERT INTO "neusecast_migration_lock" ("id", "owner", "locked_until")
      VALUES (1, ${owner}, now() + interval '5 minutes')
      ON CONFLICT ("id") DO UPDATE
      SET "owner" = EXCLUDED."owner", "locked_until" = EXCLUDED."locked_until"
      WHERE "neusecast_migration_lock"."locked_until" <= now()
      RETURNING "owner"
    `;
    if (rows[0]?.owner === owner) {
      acquired = true;
      break;
    }
    await sleep(2_000);
  }

  if (!acquired) {
    throw new Error("Another deployment is applying database migrations. Retry this build after it finishes.");
  }

  try {
    console.log("Applying NeuseCast database migrations...");
    await client`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
    await client`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        "id" serial PRIMARY KEY,
        "hash" text NOT NULL,
        "created_at" bigint
      )
    `;

    const appliedRows = await client`
      SELECT "hash", "created_at"
      FROM "drizzle"."__drizzle_migrations"
    `;
    const appliedByTimestamp = new Map(
      appliedRows.map((row) => [Number(row.created_at), row.hash]),
    );
    const migrationFiles = readMigrationFiles({ migrationsFolder: "./drizzle" });

    for (const migration of migrationFiles) {
      const appliedHash = appliedByTimestamp.get(migration.folderMillis);
      if (appliedHash === migration.hash) continue;
      if (appliedHash) {
        if (migration.folderMillis < STRICT_MIGRATION_HASH_FROM_MILLIS) {
          console.warn(
            `Skipping legacy migration ${migration.folderMillis} with its previously recorded hash.`,
          );
          continue;
        }
        throw new Error(`Migration ${migration.folderMillis} was already recorded with a different hash.`);
      }

      const statements = migration.sql.map((statement) => statement.trim()).filter(Boolean);
      const renewed = await client`
        UPDATE "neusecast_migration_lock"
        SET "locked_until" = now() + interval '5 minutes'
        WHERE "id" = 1 AND "owner" = ${owner}
        RETURNING "owner"
      `;
      if (renewed[0]?.owner !== owner) {
        throw new Error("The database migration lease expired before the next migration could start.");
      }

      // Every migration and its journal record commit together. If a deployment
      // stops midway through DDL, Postgres rolls back that migration so the next
      // deployment can retry safely instead of finding a partially applied file.
      await client.transaction((transaction) => [
        ...statements.map((statement) => transaction.query(statement)),
        transaction`
          INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
          VALUES (${migration.hash}, ${migration.folderMillis})
        `,
      ]);
      appliedByTimestamp.set(migration.folderMillis, migration.hash);
    }
    console.log("NeuseCast database migrations are current.");
  } finally {
    await client`
      DELETE FROM "neusecast_migration_lock"
      WHERE "id" = 1 AND "owner" = ${owner}
    `;
  }
}
