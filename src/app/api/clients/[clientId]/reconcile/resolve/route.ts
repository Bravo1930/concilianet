import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";

const resolveSchema = z.object({
  reconciliationIds: z.array(z.string().min(1)).min(1),
  action: z.enum(["APPROVE", "REJECT"]),
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
    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Solicitud inválida" },
        { status: 400 }
      );
    }

    const { reconciliationIds, action } = parsed.data;

    const targetRows = await prisma.reconciliation.findMany({
      where: {
        id: { in: reconciliationIds },
        clientId: client.id,
      },
    });

    if (targetRows.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron conciliaciones válidas para este cliente" },
        { status: 404 }
      );
    }

    if (action === "APPROVE") {
      await prisma.reconciliation.updateMany({
        where: {
          id: { in: targetRows.map((r) => r.id) },
          clientId: client.id,
        },
        data: { status: "APROBADO" },
      });

      return NextResponse.json({
        ok: true,
        action: "APPROVE",
        updatedCount: targetRows.length,
      });
    }

    // REJECT: eliminar la(s) conciliación(es) y recalcular estatus/saldoPendiente de CFDIs y BankTransactions
    const affectedCfdiIds = Array.from(new Set(targetRows.map((r) => r.cfdiId)));
    const affectedTxIds = Array.from(
      new Set(targetRows.map((r) => r.bankTransactionId))
    );

    await prisma.$transaction(async (txDb) => {
      await txDb.reconciliation.deleteMany({
        where: {
          id: { in: targetRows.map((r) => r.id) },
          clientId: client.id,
        },
      });

      for (const cfdiId of affectedCfdiIds) {
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

      for (const txId of affectedTxIds) {
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
      action: "REJECT",
      deletedCount: targetRows.length,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
