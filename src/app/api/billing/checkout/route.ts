import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CONCILIASAT_PLANS, getStripeClient } from "@/lib/stripe";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";

const checkoutSchema = z.object({
  planId: z.enum(["INDEPENDIENTE", "PYME", "PRO"]),
  simulateDemo: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const { user, organization } = await requireAuthSession();

    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo el administrador del despacho puede gestionar el plan." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Plan inválido" },
        { status: 400 }
      );
    }

    const planDef = CONCILIASAT_PLANS.find((p) => p.id === parsed.data.planId);
    if (!planDef) {
      return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
    }

    const stripe = getStripeClient();
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;

    if (!stripe) {
      if (parsed.data.simulateDemo) {
        const updated = await prisma.organization.update({
          where: { id: organization.id },
          data: {
            plan: planDef.id,
            maxRfcs: planDef.maxRfcs,
            subscriptionStatus: "ACTIVE",
          },
        });
        return NextResponse.json({
          mode: "demo",
          organization: updated,
          message: `Plan actualizado a ${planDef.name} (modo local sin STRIPE_SECRET_KEY).`,
        });
      }

      return NextResponse.json(
        {
          mode: "unconfigured",
          error:
            "STRIPE_SECRET_KEY no está configurada en .env. Usa el modo de activación local para probar límites o configura Stripe.",
        },
        { status: 400 }
      );
    }

    let customerId = organization.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: organization.name,
        email: user.email,
        metadata: {
          organizationId: organization.id,
        },
      });
      customerId = customer.id;
      await prisma.organization.update({
        where: { id: organization.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const configuredPriceId = process.env[planDef.stripePriceEnvKey]?.trim();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      success_url: `${appUrl}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard/billing?checkout=canceled`,
      metadata: {
        organizationId: organization.id,
        planId: planDef.id,
      },
      subscription_data: {
        metadata: {
          organizationId: organization.id,
          planId: planDef.id,
        },
      },
      line_items: [
        configuredPriceId
          ? { price: configuredPriceId, quantity: 1 }
          : {
              price_data: {
                currency: "mxn",
                product_data: {
                  name: `ConciliaSAT - ${planDef.name}`,
                  description: `${planDef.maxRfcs} RFCs activos · ${planDef.tagline}`,
                },
                unit_amount: planDef.monthlyPriceMxn * 100,
                recurring: { interval: "month" },
              },
              quantity: 1,
            },
      ],
    });

    return NextResponse.json({
      mode: "stripe",
      url: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
