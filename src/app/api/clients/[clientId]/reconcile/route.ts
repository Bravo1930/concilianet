import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";
import { runClientReconciliation } from "@/lib/reconciliation/engine";

const reconcileBodySchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2035),
  bankAccountId: z.string().optional(),
  dateWindowDays: z.number().int().min(0).max(60).optional().default(5),
  amountTolerance: z.number().min(0).max(1000).optional().default(1.0),
});

function buildMatchReason(rec: {
  matchType: string;
  montoAplicado: unknown;
  cfdi: { total: unknown; moneda: string; tipoCambio: unknown };
  bankTransaction: { monto: unknown };
}): string {
  const bankAmt = Number(rec.bankTransaction.monto);
  const cfdiAmt = Number(rec.cfdi.total);
  const diff = Math.abs(bankAmt - cfdiAmt);

  switch (rec.matchType) {
    case "EXACT_PUE":
      return "Cruce exacto 1 a 1 PUE";
    case "REP_PPD":
      return "Complemento de Pago (REP 2.0) vinculado por UUID";
    case "SUBSET_SUM":
      return "Pago agrupado (Subset Sum)";
    case "TOLERANCE":
      if (rec.cfdi.moneda !== "MXN") {
        return `Divisa ${rec.cfdi.moneda} (TC ${Number(rec.cfdi.tipoCambio).toFixed(2)}, margen ±3%)`;
      }
      return `Diferencia por tolerancia $${diff.toFixed(2)} MXN`;
    case "MANUAL":
      return "Vinculación manual por contador";
    default:
      return rec.matchType;
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { clientId } = await context.params;

    const body = await req.json();
    const parsed = reconcileBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Parámetros de conciliación inválidos",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const result = await runClientReconciliation({
      clientId,
      organizationId: org.id,
      month: parsed.data.month,
      year: parsed.data.year,
      bankAccountId: parsed.data.bankAccountId || undefined,
      dateWindowDays: parsed.data.dateWindowDays,
      amountTolerance: parsed.data.amountTolerance,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no encontrado")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return authErrorResponse(err);
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { clientId } = await context.params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: org.id },
      include: {
        bankAccounts: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Cliente no encontrado en tu organización" },
        { status: 404 }
      );
    }

    const nowMonth = 11;
    const nowYear = 2026;
    const month = Number.parseInt(
      req.nextUrl.searchParams.get("month") ?? String(nowMonth),
      10
    );
    const year = Number.parseInt(
      req.nextUrl.searchParams.get("year") ?? String(nowYear),
      10
    );
    const bankAccountId =
      req.nextUrl.searchParams.get("bankAccountId")?.trim() || undefined;

    const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const [reconciliations, periodCfdis, periodTransactions] = await Promise.all([
      prisma.reconciliation.findMany({
        where: {
          clientId: client.id,
          bankTransaction: {
            fecha: { gte: periodStart, lte: periodEnd },
            ...(bankAccountId ? { bankAccountId } : {}),
          },
        },
        include: {
          cfdi: true,
          bankTransaction: {
            include: { bankAccount: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.cfdi.findMany({
        where: {
          clientId: client.id,
          fechaEmision: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { fechaEmision: "asc" },
      }),
      prisma.bankTransaction.findMany({
        where: {
          clientId: client.id,
          ...(bankAccountId ? { bankAccountId } : {}),
          fecha: { gte: periodStart, lte: periodEnd },
        },
        include: { bankAccount: true },
        orderBy: { fecha: "asc" },
      }),
    ]);

    const serializedReconciliations = reconciliations.map((rec) => ({
      id: rec.id,
      cfdiId: rec.cfdiId,
      bankTransactionId: rec.bankTransactionId,
      montoAplicado: Number(rec.montoAplicado),
      matchType: rec.matchType,
      confidenceScore: rec.confidenceScore,
      status: rec.status,
      reason: buildMatchReason(rec),
      cfdi: {
        id: rec.cfdi.id,
        uuid: rec.cfdi.uuid,
        tipoComprobante: rec.cfdi.tipoComprobante,
        metodoPago: rec.cfdi.metodoPago,
        fechaEmision: rec.cfdi.fechaEmision.toISOString(),
        rfcEmisor: rec.cfdi.rfcEmisor,
        nombreEmisor: rec.cfdi.nombreEmisor,
        rfcReceptor: rec.cfdi.rfcReceptor,
        nombreReceptor: rec.cfdi.nombreReceptor,
        total: Number(rec.cfdi.total),
        moneda: rec.cfdi.moneda,
        tipoCambio: Number(rec.cfdi.tipoCambio),
        saldoPendiente: Number(rec.cfdi.saldoPendiente),
        direccion: rec.cfdi.direccion,
        status: rec.cfdi.status,
      },
      bankTransaction: {
        id: rec.bankTransaction.id,
        fecha: rec.bankTransaction.fecha.toISOString(),
        concepto: rec.bankTransaction.concepto,
        monto: Number(rec.bankTransaction.monto),
        tipo: rec.bankTransaction.tipo,
        status: rec.bankTransaction.status,
        bankName: rec.bankTransaction.bankAccount.bankName,
        last4Digits: rec.bankTransaction.bankAccount.last4Digits,
      },
    }));

    const greenReconciliations = serializedReconciliations.filter(
      (r) => r.status === "AUTO" || r.status === "APROBADO"
    );
    const yellowReconciliations = serializedReconciliations.filter(
      (r) => r.status === "SUGERIDO"
    );

    const pendingCfdis = periodCfdis
      .filter((c) => c.status === "PENDIENTE" || c.status === "PARCIAL")
      .map((c) => ({
        id: c.id,
        uuid: c.uuid,
        tipoComprobante: c.tipoComprobante,
        metodoPago: c.metodoPago,
        fechaEmision: c.fechaEmision.toISOString(),
        rfcEmisor: c.rfcEmisor,
        nombreEmisor: c.nombreEmisor,
        rfcReceptor: c.rfcReceptor,
        nombreReceptor: c.nombreReceptor,
        total: Number(c.total),
        moneda: c.moneda,
        tipoCambio: Number(c.tipoCambio),
        saldoPendiente: Number(c.saldoPendiente),
        direccion: c.direccion,
        status: c.status,
      }));

    const partialPpdCfdis = pendingCfdis.filter(
      (c) => c.status === "PARCIAL" && c.metodoPago === "PPD"
    );

    const unbilledTransactions = periodTransactions
      .filter((t) => t.status === "SIN_FACTURA" || t.status === "PARCIAL")
      .map((t) => ({
        id: t.id,
        bankAccountId: t.bankAccountId,
        bankName: t.bankAccount.bankName,
        last4Digits: t.bankAccount.last4Digits,
        fecha: t.fecha.toISOString(),
        concepto: t.concepto,
        monto: Number(t.monto),
        tipo: t.tipo,
        status: t.status,
      }));

    // KPIs de Semáforo
    const greenUniqueTxIds = new Set(
      greenReconciliations.map((r) => r.bankTransactionId)
    );
    const greenAmount = Number(
      greenReconciliations
        .reduce((acc, r) => acc + r.montoAplicado, 0)
        .toFixed(2)
    );
    const totalPeriodTxCount = periodTransactions.length;
    const conciliatedTxCount = periodTransactions.filter(
      (t) => t.status === "CONCILIADO"
    ).length;
    const progressPct =
      totalPeriodTxCount > 0
        ? Math.round((conciliatedTxCount / totalPeriodTxCount) * 100)
        : periodCfdis.length > 0
          ? Math.round(
              (periodCfdis.filter((c) => c.status === "CONCILIADO").length /
                periodCfdis.length) *
                100
            )
          : 0;

    const yellowAmount = Number(
      (
        yellowReconciliations.reduce((acc, r) => acc + r.montoAplicado, 0) +
        partialPpdCfdis.reduce((acc, c) => acc + c.saldoPendiente, 0)
      ).toFixed(2)
    );

    const redPendingSatAmount = Number(
      pendingCfdis.reduce((acc, c) => acc + c.saldoPendiente, 0).toFixed(2)
    );

    const redUnbilledAmount = Number(
      unbilledTransactions.reduce((acc, t) => acc + t.monto, 0).toFixed(2)
    );

    return NextResponse.json({
      client: {
        id: client.id,
        rfc: client.rfc,
        razonSocial: client.razonSocial,
        regimenFiscal: client.regimenFiscal,
        bankAccounts: client.bankAccounts.map((b) => ({
          id: b.id,
          bankName: b.bankName,
          last4Digits: b.last4Digits,
          currency: b.currency,
        })),
      },
      period: { month, year },
      kpis: {
        green: {
          count: greenUniqueTxIds.size,
          reconciliationCount: greenReconciliations.length,
          totalAmount: greenAmount,
          percentage: progressPct,
        },
        yellow: {
          count: yellowReconciliations.length + partialPpdCfdis.length,
          suggestedCount: yellowReconciliations.length,
          partialPpdCount: partialPpdCfdis.length,
          totalAmount: yellowAmount,
        },
        redPendingSat: {
          count: pendingCfdis.length,
          totalAmount: redPendingSatAmount,
        },
        redUnbilledBank: {
          count: unbilledTransactions.length,
          totalAmount: redUnbilledAmount,
        },
      },
      reconciliations: serializedReconciliations,
      greenReconciliations,
      yellowReconciliations,
      partialPpdCfdis,
      pendingCfdis,
      unbilledTransactions,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
