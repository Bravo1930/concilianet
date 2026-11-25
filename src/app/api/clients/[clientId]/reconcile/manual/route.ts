import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";

const manualLinkSchema = z.object({
  links: z
    .array(
      z.object({
        cfdiId: z.string().min(1),
        bankTransactionId: z.string().min(1),
        montoAplicado: z.number().positive(),
      })
    )
    .min(1, "Agrega al menos una vinculación CFDI ↔ Movimiento"),
});

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
    const parsed = manualLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Datos de enlace inválidos",
        },
        { status: 400 }
      );
    }

    const { links } = parsed.data;
    const cfdiIds = Array.from(new Set(links.map((l) => l.cfdiId)));
    const txIds = Array.from(new Set(links.map((l) => l.bankTransactionId)));

    const [validCfdis, validTxs] = await Promise.all([
      prisma.cfdi.findMany({
        where: { id: { in: cfdiIds }, clientId: client.id },
      }),
      prisma.bankTransaction.findMany({
        where: { id: { in: txIds }, clientId: client.id },
      }),
    ]);

    if (validCfdis.length !== cfdiIds.length) {
      return NextResponse.json(
        { error: "Uno o más CFDIs seleccionados no pertenecen al cliente." },
        { status: 400 }
      );
    }
    if (validTxs.length !== txIds.length) {
      return NextResponse.json(
        {
          error:
            "Uno o más movimientos bancarios seleccionados no pertenecen al cliente.",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (txDb) => {
      for (const link of links) {
        await txDb.reconciliation.upsert({
          where: {
            cfdiId_bankTransactionId: {
              cfdiId: link.cfdiId,
              bankTransactionId: link.bankTransactionId,
            },
          },
          update: {
            montoAplicado: Number(link.montoAplicado.toFixed(2)),
            matchType: "MANUAL",
            confidenceScore: 100,
            status: "APROBADO",
          },
          create: {
            clientId: client.id,
            cfdiId: link.cfdiId,
            bankTransactionId: link.bankTransactionId,
            montoAplicado: Number(link.montoAplicado.toFixed(2)),
            matchType: "MANUAL",
            confidenceScore: 100,
            status: "APROBADO",
          },
        });
      }

      for (const cfdiId of cfdiIds) {
        const cfdi = await txDb.cfdi.findUnique({
          where: { id: cfdiId },
          include: { reconciliations: true },
        });
        if (!cfdi) continue;

        const appliedSum = cfdi.reconciliations.reduce(
          (acc, r) => acc + Number(r.montoAplicado),
          0
        );
        const total = Number(cfdi.total);
        const nextSaldo = Math.max(0, Number((total - appliedSum).toFixed(2)));
        const nextStatus =
          appliedSum <= 0.01
            ? "PENDIENTE"
            : nextSaldo <= 0.01
              ? "CONCILIADO"
              : "PARCIAL";

        await txDb.cfdi.update({
          where: { id: cfdi.id },
          data: {
            saldoPendiente: nextSaldo,
            status: nextStatus,
          },
        });
      }

      for (const txId of txIds) {
        const bankTx = await txDb.bankTransaction.findUnique({
          where: { id: txId },
          include: { reconciliations: true },
        });
        if (!bankTx) continue;

        const appliedSum = bankTx.reconciliations.reduce(
          (acc, r) => acc + Number(r.montoAplicado),
          0
        );
        const monto = Number(bankTx.monto);
        const nextStatus =
          appliedSum <= 0.01
            ? "SIN_FACTURA"
            : monto - appliedSum <= 0.01
              ? "CONCILIADO"
              : "PARCIAL";

        await txDb.bankTransaction.update({
          where: { id: bankTx.id },
          data: { status: nextStatus },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      createdLinks: links.length,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
