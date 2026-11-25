import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import {
  getPlanConfig,
  getStripeClient,
  type PlanTierId,
} from "@/lib/stripe";
import type { SubscriptionStatus } from "@prisma/client";

function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
    default:
      return "CANCELED";
  }
}

function resolvePlanFromMetadata(
  planId: string | undefined | null
): PlanTierId | undefined {
  if (
    planId === "FREE" ||
    planId === "INDEPENDIENTE" ||
    planId === "PYME" ||
    planId === "PRO"
  ) {
    return planId;
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  let event: Stripe.Event;

  try {
    if (stripe && webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else if (stripe && webhookSecret && !signature) {
      return NextResponse.json(
        { error: "Falta cabecera stripe-signature" },
        { status: 400 }
      );
    } else {
      // Modo desarrollo local sin STRIPE_WEBHOOK_SECRET
      event = JSON.parse(rawBody) as Stripe.Event;
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Firma Webhook inválida: ${err.message}`
            : "Payload Webhook inválido",
      },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.organizationId;
        const plan =
          resolvePlanFromMetadata(session.metadata?.planId) ?? "INDEPENDIENTE";
        const cfg = getPlanConfig(plan);

        if (orgId) {
          await prisma.organization.update({
            where: { id: orgId },
            data: {
              stripeCustomerId:
                typeof session.customer === "string"
                  ? session.customer
                  : session.customer?.id,
              stripeSubscriptionId:
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription?.id,
              plan,
              maxRfcs: cfg.maxRfcs,
              subscriptionStatus: "ACTIVE",
            },
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const orgId = sub.metadata?.organizationId;
        const plan = resolvePlanFromMetadata(sub.metadata?.planId);
        const mappedStatus = mapStripeStatus(sub.status);

        const targetOrg = orgId
          ? await prisma.organization.findUnique({ where: { id: orgId } })
          : await prisma.organization.findFirst({
              where: {
                OR: [
                  { stripeSubscriptionId: sub.id },
                  { stripeCustomerId: customerId },
                ],
              },
            });

        if (targetOrg) {
          const nextPlan = plan ?? targetOrg.plan;
          const cfg = getPlanConfig(nextPlan);
          await prisma.organization.update({
            where: { id: targetOrg.id },
            data: {
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub.id,
              plan: nextPlan,
              maxRfcs: cfg.maxRfcs,
              subscriptionStatus: mappedStatus,
            },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const orgId = sub.metadata?.organizationId;

        const targetOrg = orgId
          ? await prisma.organization.findUnique({ where: { id: orgId } })
          : await prisma.organization.findFirst({
              where: {
                OR: [
                  { stripeSubscriptionId: sub.id },
                  { stripeCustomerId: customerId },
                ],
              },
            });

        if (targetOrg) {
          await prisma.organization.update({
            where: { id: targetOrg.id },
            data: {
              plan: "FREE",
              maxRfcs: 3,
              subscriptionStatus: "CANCELED",
            },
          });
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true, type: event.type });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error al procesar evento webhook de Stripe",
      },
      { status: 500 }
    );
  }
}
