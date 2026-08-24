import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { screens } from "@/lib/db/schema";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ playerKey: string }> },
) {
  const { playerKey } = await params;
  const [screen] = await getDatabase()
    .update(screens)
    .set({ status: "online", lastSeenAt: new Date(), updatedAt: new Date() })
    .where(and(eq(screens.provider, "neusecast"), eq(screens.providerScreenId, playerKey), eq(screens.active, true)))
    .returning({ id: screens.id });

  if (!screen) return Response.json({ error: "Screen not found" }, { status: 404 });
  return Response.json({ ok: true });
}
