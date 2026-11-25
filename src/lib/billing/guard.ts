import { prisma } from "@/lib/db";

export interface RfcLimitCheckResult {
  allowed: boolean;
  reason?: "SUBSCRIPTION_INACTIVE" | "PLAN_LIMIT_REACHED" | "ORG_NOT_FOUND";
  message?: string;
  usedRfcs: number;
  maxRfcs: number;
  plan: string;
  subscriptionStatus: string;
}

/**
 * Guard multi-tenant que valida si el despacho puede dar de alta nuevos RFCs
 * según su límite de plan (maxRfcs) y vigencia de suscripción Stripe.
 */
export async function checkRfcLimit(
  organizationId: string
): Promise<RfcLimitCheckResult> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      _count: { select: { clients: true } },
    },
  });

  if (!org) {
    return {
      allowed: false,
      reason: "ORG_NOT_FOUND",
      message: "Organización no encontrada.",
      usedRfcs: 0,
      maxRfcs: 0,
      plan: "FREE",
      subscriptionStatus: "CANCELED",
    };
  }

  const usedRfcs = org._count.clients;

  if (
    org.subscriptionStatus === "PAST_DUE" ||
    org.subscriptionStatus === "CANCELED"
  ) {
    return {
      allowed: false,
      reason: "SUBSCRIPTION_INACTIVE",
      message:
        org.subscriptionStatus === "PAST_DUE"
          ? "Tu suscripción tiene un pago vencido. Actualiza tu método de pago en Facturación para agregar nuevos RFCs."
          : "Tu suscripción fue cancelada. Reactiva o elige un plan para continuar agregando RFCs.",
      usedRfcs,
      maxRfcs: org.maxRfcs,
      plan: org.plan,
      subscriptionStatus: org.subscriptionStatus,
    };
  }

  if (usedRfcs >= org.maxRfcs) {
    return {
      allowed: false,
      reason: "PLAN_LIMIT_REACHED",
      message: `Has alcanzado el límite de ${org.maxRfcs} RFCs de tu plan ${org.plan}. Mejora tu plan para agregar más clientes.`,
      usedRfcs,
      maxRfcs: org.maxRfcs,
      plan: org.plan,
      subscriptionStatus: org.subscriptionStatus,
    };
  }

  return {
    allowed: true,
    usedRfcs,
    maxRfcs: org.maxRfcs,
    plan: org.plan,
    subscriptionStatus: org.subscriptionStatus,
  };
}
