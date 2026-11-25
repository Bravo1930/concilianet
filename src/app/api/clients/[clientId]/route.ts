import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";
import { updateClientSchema } from "@/lib/validators/sat";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { clientId } = await context.params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: org.id },
      include: {
        bankAccounts: { orderBy: { createdAt: "asc" } },
        _count: {
          select: {
            cfdis: true,
            bankTransactions: true,
            reconciliations: true,
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Cliente no encontrado en tu organización" },
        { status: 404 }
      );
    }

    return NextResponse.json({ client, organization: org });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { clientId } = await context.params;

    const existing = await prisma.client.findFirst({
      where: { id: clientId, organizationId: org.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cliente no encontrado en tu organización" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = updateClientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Datos inválidos",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.client.update({
      where: { id: existing.id },
      data: parsed.data,
      include: {
        bankAccounts: { orderBy: { createdAt: "asc" } },
        _count: {
          select: {
            cfdis: true,
            bankTransactions: true,
            reconciliations: true,
          },
        },
      },
    });

    return NextResponse.json({ client: updated });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ya existe otro cliente con ese RFC en tu despacho." },
        { status: 409 }
      );
    }

    return authErrorResponse(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { clientId } = await context.params;

    const existing = await prisma.client.findFirst({
      where: { id: clientId, organizationId: org.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cliente no encontrado en tu organización" },
        { status: 404 }
      );
    }

    await prisma.client.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
