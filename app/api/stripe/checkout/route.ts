import { auth } from "@clerk/nextjs/server";
import { BillingError, createCampaignCheckout } from "@/lib/billing";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { orderId?: unknown } | null;
  if (!body || typeof body.orderId !== "string" || !body.orderId) {
    return Response.json({ error: "A valid campaign order is required." }, { status: 400 });
  }

  try {
    const url = await createCampaignCheckout(body.orderId, userId);
    return Response.json({ url });
  } catch (error) {
    if (error instanceof BillingError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Unable to create NeuseCast checkout", error);
    return Response.json({ error: "Checkout is temporarily unavailable." }, { status: 500 });
  }
}

