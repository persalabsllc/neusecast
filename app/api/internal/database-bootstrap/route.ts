import { migrate } from "drizzle-orm/neon-http/migrator";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL is not configured." },
      { status: 503 },
    );
  }

  try {
    await migrate(getDatabase(), { migrationsFolder: "./drizzle" });

    const database = getDatabase();
    const result = await database.execute<{
      table_count: number;
    }>(
      "select count(*)::int as table_count from information_schema.tables where table_schema = 'public'",
    );

    return NextResponse.json({
      ok: true,
      initialized: true,
      tableCount: result.rows[0]?.table_count ?? 0,
    });
  } catch (error) {
    console.error("NeuseCast database bootstrap failed", error);

    return NextResponse.json(
      { ok: false, error: "Database initialization failed." },
      { status: 500 },
    );
  }
}
