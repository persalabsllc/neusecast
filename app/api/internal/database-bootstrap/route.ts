import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await migrate(getDatabase(), { migrationsFolder: "./drizzle" });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("NeuseCast database migration failed", error);
    return Response.json({ ok: false, error: "Database migration failed" }, { status: 500 });
  }
}
