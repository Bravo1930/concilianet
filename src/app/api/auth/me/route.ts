import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";

export async function GET() {
  try {
    const { user, organization } = await requireAuthSession();
    const usedRfcs = await prisma.client.count({
      where: { organizationId: organization.id },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        maxRfcs: organization.maxRfcs,
        usedRfcs,
        subscriptionStatus: organization.subscriptionStatus,
        hasStripeCustomer: Boolean(organization.stripeCustomerId),
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
