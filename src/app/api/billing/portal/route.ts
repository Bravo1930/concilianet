import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  try {
    const { user, organization } = await requireAuthSession();

    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo el administrador puede abrir el portal de facturación." },
        { status: 403 }
      );
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return NextResponse.json(
        {
          error:
            "STRIPE_SECRET_KEY no está configurada en .env para abrir el Customer Portal.",
        },
        { status: 400 }
      );
    }

    if (!organization.stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "Este despacho aún no tiene un cliente registrado en Stripe. Selecciona un plan primero.",
        },
        { status: 400 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: organization.stripeCustomerId,
      return_url: `${appUrl}/dashboard/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    return authErrorResponse(err);
  }
}
