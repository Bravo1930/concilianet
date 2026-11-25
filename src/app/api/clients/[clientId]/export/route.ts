import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";
import {
  generateClientCsvReport,
  generateClientExcelReport,
  type ClientPeriodReportData,
} from "@/lib/export/excelReport";

export async function loadClientPeriodReportData(params: {
  clientId: string;
  organizationId: string;
  firmName: string;
  month: number;
  year: number;
  bankAccountId?: string;
}): Promise<ClientPeriodReportData | null> {
  const client = await prisma.client.findFirst({
    where: { id: params.clientId, organizationId: params.organizationId },
  });

  if (!client) return null;

  const periodStart = new Date(
    Date.UTC(params.year, params.month - 1, 1, 0, 0, 0, 0)
  );
  const periodEnd = new Date(
    Date.UTC(params.year, params.month, 0, 23, 59, 59, 999)
  );

  const [reconciliations, pendingCfdis, unbilledTxs] = await Promise.all([
    prisma.reconciliation.findMany({
      where: {
        clientId: client.id,
        bankTransaction: {
          fecha: { gte: periodStart, lte: periodEnd },
          ...(params.bankAccountId
            ? { bankAccountId: params.bankAccountId }
            : {}),
        },
      },
      include: {
        cfdi: true,
        bankTransaction: { include: { bankAccount: true } },
      },
      orderBy: { bankTransaction: { fecha: "asc" } },
    }),
    prisma.cfdi.findMany({
      where: {
        clientId: client.id,
        fechaEmision: { gte: periodStart, lte: periodEnd },
        status: { in: ["PENDIENTE", "PARCIAL"] },
      },
      orderBy: { fechaEmision: "asc" },
    }),
    prisma.bankTransaction.findMany({
      where: {
        clientId: client.id,
        ...(params.bankAccountId
          ? { bankAccountId: params.bankAccountId }
          : {}),
        fecha: { gte: periodStart, lte: periodEnd },
        status: { in: ["SIN_FACTURA", "PARCIAL"] },
      },
      include: { bankAccount: true },
      orderBy: { fecha: "asc" },
    }),
  ]);

  return {
    client: {
      rfc: client.rfc,
      razonSocial: client.razonSocial,
      regimenFiscal: client.regimenFiscal,
      firmName: params.firmName,
    },
    month: params.month,
    year: params.year,
    conciliados: reconciliations.map((r) => {
      const isEmitido = r.cfdi.direccion === "EMITIDO";
      return {
        fechaPago: r.bankTransaction.fecha,
        conceptoBanco: r.bankTransaction.concepto,
        montoBanco: Number(r.bankTransaction.monto),
        uuid: r.cfdi.uuid,
        rfcTercero: isEmitido ? r.cfdi.rfcReceptor : r.cfdi.rfcEmisor,
        razonSocialTercero: isEmitido
          ? r.cfdi.nombreReceptor
          : r.cfdi.nombreEmisor,
        metodoPago: r.cfdi.metodoPago ?? r.cfdi.tipoComprobante,
        montoAplicado: Number(r.montoAplicado),
        tipoMatch: r.matchType,
        estatusMatch: r.status,
      };
    }),
    cfdisPendientes: pendingCfdis.map((c) => {
      const isEmitido = c.direccion === "EMITIDO";
      return {
        uuid: c.uuid,
        fechaEmision: c.fechaEmision,
        direccion: c.direccion,
        tipoComprobante: c.tipoComprobante,
        metodoPago: c.metodoPago ?? "N/A",
        rfcTercero: isEmitido ? c.rfcReceptor : c.rfcEmisor,
        razonSocialTercero: isEmitido ? c.nombreReceptor : c.nombreEmisor,
        moneda: c.moneda,
        total: Number(c.total),
        saldoPendiente: Number(c.saldoPendiente),
        estatus: c.status,
      };
    }),
    bancoSinFactura: unbilledTxs.map((t) => ({
      fecha: t.fecha,
      banco: t.bankAccount.bankName,
      cuenta: `•••• ${t.bankAccount.last4Digits}`,
      tipo: t.tipo,
      concepto: t.concepto,
      monto: Number(t.monto),
      estatus: t.status,
    })),
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { clientId } = await context.params;

    const month = Number.parseInt(
      req.nextUrl.searchParams.get("month") ?? "11",
      10
    );
    const year = Number.parseInt(
      req.nextUrl.searchParams.get("year") ?? "2026",
      10
    );
    const format = (
      req.nextUrl.searchParams.get("format") ?? "xlsx"
    ).toLowerCase();
    const bankAccountId =
      req.nextUrl.searchParams.get("bankAccountId")?.trim() || undefined;

    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year) ||
      year < 2000
    ) {
      return NextResponse.json(
        { error: "Parámetros month/year inválidos" },
        { status: 400 }
      );
    }

    if (format !== "xlsx" && format !== "csv") {
      return NextResponse.json(
        { error: "Formato no soportado. Usa format=xlsx o format=csv." },
        { status: 400 }
      );
    }

    const reportData = await loadClientPeriodReportData({
      clientId,
      organizationId: org.id,
      firmName: org.name,
      month,
      year,
      bankAccountId,
    });

    if (!reportData) {
      return NextResponse.json(
        { error: "Cliente no encontrado en tu organización" },
        { status: 404 }
      );
    }

    const periodTag = `${year}_${String(month).padStart(2, "0")}`;
    const baseFilename = `ConciliaSAT_${reportData.client.rfc}_${periodTag}`;

    if (format === "csv") {
      const csvBuf = generateClientCsvReport(reportData);
      return new NextResponse(new Uint8Array(csvBuf), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${baseFilename}.csv"`,
        },
      });
    }

    const xlsxBuf = await generateClientExcelReport(reportData);
    return new NextResponse(new Uint8Array(xlsxBuf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseFilename}.xlsx"`,
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
