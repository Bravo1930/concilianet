import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkRfcLimit } from "@/lib/billing/guard";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";
import {
  createClientSchema,
  DEFAULT_BANK_MAPPINGS,
} from "@/lib/validators/sat";

export async function GET(req: NextRequest) {
  try {
    const { organization } = await requireAuthSession();
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    const [clients, limitStatus] = await Promise.all([
      prisma.client.findMany({
        where: {
          organizationId: organization.id,
          ...(q
            ? {
                OR: [
                  { rfc: { contains: q.toUpperCase() } },
                  { razonSocial: { contains: q } },
                ],
              }
            : {}),
        },
        include: {
          bankAccounts: {
            orderBy: { createdAt: "asc" },
          },
          _count: {
            select: {
              cfdis: true,
              bankTransactions: true,
              reconciliations: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      checkRfcLimit(organization.id),
    ]);

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        maxRfcs: organization.maxRfcs,
        usedRfcs: limitStatus.usedRfcs,
        subscriptionStatus: organization.subscriptionStatus,
      },
      limitStatus,
      clients,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { organization } = await requireAuthSession();
    const body = await req.json();
    const parsed = createClientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Datos de cliente inválidos",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const limitCheck = await checkRfcLimit(organization.id);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: limitCheck.message,
          code: limitCheck.reason,
          upgradeUrl: "/dashboard/billing",
          limitCheck,
        },
        { status: 403 }
      );
    }

    const { rfc, razonSocial, regimenFiscal, initialBankAccount } = parsed.data;

    const existing = await prisma.client.findUnique({
      where: {
        organizationId_rfc: {
          organizationId: organization.id,
          rfc,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `El RFC ${rfc} ya se encuentra registrado en tu despacho.` },
        { status: 409 }
      );
    }

    const mapping = initialBankAccount
      ? (initialBankAccount.columnMappingJson ??
        DEFAULT_BANK_MAPPINGS[initialBankAccount.bankName] ??
        undefined)
      : undefined;

    const created = await prisma.client.create({
      data: {
        organizationId: organization.id,
        rfc,
        razonSocial,
        regimenFiscal,
        ...(initialBankAccount
          ? {
              bankAccounts: {
                create: {
                  bankName: initialBankAccount.bankName,
                  last4Digits: initialBankAccount.last4Digits,
                  currency: initialBankAccount.currency,
                  columnMappingJson: mapping as Prisma.InputJsonValue | undefined,
                },
              },
            }
          : {}),
      },
      include: {
        bankAccounts: true,
        _count: {
          select: {
            cfdis: true,
            bankTransactions: true,
            reconciliations: true,
          },
        },
      },
    });

    return NextResponse.json({ client: created }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ya existe un contribuyente con ese RFC en este despacho." },
        { status: 409 }
      );
    }

    return authErrorResponse(err);
  }
}
