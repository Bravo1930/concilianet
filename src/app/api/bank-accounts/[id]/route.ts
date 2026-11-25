import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";
import { bankAccountInputSchema } from "@/lib/validators/sat";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { id } = await context.params;

    const existing = await prisma.bankAccount.findFirst({
      where: {
        id,
        client: { organizationId: org.id },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cuenta bancaria no encontrada en tu organización" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = bankAccountInputSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Datos inválidos para actualizar cuenta",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.bankAccount.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.bankName ? { bankName: parsed.data.bankName } : {}),
        ...(parsed.data.last4Digits
          ? { last4Digits: parsed.data.last4Digits }
          : {}),
        ...(parsed.data.currency ? { currency: parsed.data.currency } : {}),
        ...(parsed.data.columnMappingJson !== undefined
          ? {
              columnMappingJson:
                parsed.data.columnMappingJson === null
                  ? Prisma.DbNull
                  : (parsed.data.columnMappingJson as Prisma.InputJsonValue),
            }
          : {}),
      },
    });

    return NextResponse.json({ bankAccount: updated });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { id } = await context.params;

    const existing = await prisma.bankAccount.findFirst({
      where: {
        id,
        client: { organizationId: org.id },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cuenta bancaria no encontrada en tu organización" },
        { status: 404 }
      );
    }

    await prisma.bankAccount.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
