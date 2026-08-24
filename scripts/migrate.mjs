import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("DATABASE_URL is not set; skipping database migrations for this build.");
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
    const database = drizzle(client);
    await migrate(database, { migrationsFolder: "./drizzle" });
    console.log("NeuseCast database migrations are current.");
  } finally {
    await client`
      DELETE FROM "neusecast_migration_lock"
      WHERE "id" = 1 AND "owner" = ${owner}
    `;
  }
}
