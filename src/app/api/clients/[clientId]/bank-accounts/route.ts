import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";
import {
  bankAccountInputSchema,
  DEFAULT_BANK_MAPPINGS,
} from "@/lib/validators/sat";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { clientId } = await context.params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: org.id },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Cliente no encontrado en tu organización" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = bankAccountInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Datos de cuenta bancaria inválidos",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const mapping =
      parsed.data.columnMappingJson ??
      DEFAULT_BANK_MAPPINGS[parsed.data.bankName] ??
      undefined;

    const account = await prisma.bankAccount.create({
      data: {
        clientId: client.id,
        bankName: parsed.data.bankName,
        last4Digits: parsed.data.last4Digits,
        currency: parsed.data.currency,
        columnMappingJson: mapping as Prisma.InputJsonValue | undefined,
      },
    });

    return NextResponse.json({ bankAccount: account }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}
