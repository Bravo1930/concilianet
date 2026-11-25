import ExcelJS from "exceljs";
import type { ReconciliationResult } from "@/lib/reconciliation/engine";

export interface ExportWorkbookMetadata {
  firmName: string;
  clientRfc: string;
  clientName: string;
  periodLabel: string;
}

const CURRENCY_FORMAT = "$#,##0.00";

function styleHeaderRow(row: ExcelJS.Row, fillHex = "FF0F172A") {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fillHex },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
}

/**
 * Genera un papel de trabajo en Excel (.xlsx) con 4 pestañas ejecutivas
 * listo para auditoría fiscal del SAT y cierre mensual del despacho.
 */
export async function buildReconciliationExcelBuffer(
  result: ReconciliationResult,
  meta: ExportWorkbookMetadata
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ConciliaSAT";
  workbook.created = new Date();

  // 1. Resumen Ejecutivo
  const summarySheet = workbook.addWorksheet("Resumen Ejecutivo");
  summarySheet.columns = [
    { header: "Concepto", key: "concepto", width: 42 },
    { header: "Valor", key: "valor", width: 28 },
  ];
  summarySheet.addRows([
    { concepto: "Despacho Contable", valor: meta.firmName },
    { concepto: "Contribuyente (Razón Social)", valor: meta.clientName },
    { concepto: "RFC del Contribuyente", valor: meta.clientRfc },
    { concepto: "Periodo Fiscal", valor: meta.periodLabel },
    { concepto: "", valor: "" },
    { concepto: "Total CFDIs Analizados", valor: result.summary.totalCfdis },
    { concepto: "Total Movimientos Bancarios", valor: result.summary.totalMovements },
    { concepto: "Conciliación Automática", valor: result.summary.autoMatchedCount },
    { concepto: "Conciliación Sugerida / PPD", valor: result.summary.suggestedCount },
    { concepto: "CFDIs sin Movimiento Bancario", valor: result.summary.unmatchedCfdiCount },
    { concepto: "Movimientos Bancarios sin CFDI", valor: result.summary.unmatchedBankCount },
    { concepto: "Tasa de Conciliación (%)", valor: `${result.summary.reconciliationRate}%` },
    { concepto: "Monto Conciliado (MXN)", valor: result.summary.matchedAmountMxn },
    { concepto: "IVA Trasladado Conciliado", valor: result.summary.ivaTrasladadoConciliado },
    { concepto: "IVA Acreditable Conciliado", valor: result.summary.ivaAcreditableConciliado },
    {
      concepto: "Alerta Fiscal: CFDIs PUE sin flujo bancario",
      valor: result.summary.pueSinFlujoCount,
    },
  ]);
  styleHeaderRow(summarySheet.getRow(1));
  for (const rowIdx of [14, 15, 16]) {
    summarySheet.getCell(`B${rowIdx}`).numFmt = CURRENCY_FORMAT;
  }

  // 2. Conciliación Detallada
  const matchesSheet = workbook.addWorksheet("Conciliación Detallada");
  matchesSheet.views = [{ state: "frozen", ySplit: 1 }];
  matchesSheet.columns = [
    { header: "Estatus", key: "status", width: 16 },
    { header: "Confianza %", key: "score", width: 12 },
    { header: "UUID SAT", key: "uuid", width: 38 },
    { header: "Tipo", key: "direction", width: 12 },
    { header: "Método Pago", key: "metodoPago", width: 12 },
    { header: "Fecha CFDI", key: "fechaCfdi", width: 14 },
    { header: "RFC Contrario", key: "rfcContrario", width: 16 },
    { header: "Razón Social", key: "razonSocial", width: 32 },
    { header: "Total CFDI", key: "totalCfdi", width: 16 },
    { header: "Fecha Banco", key: "fechaBanco", width: 14 },
    { header: "Descripción Bancaria", key: "descBanco", width: 36 },
    { header: "Monto Banco", key: "montoBanco", width: 16 },
    { header: "Diferencia", key: "diferencia", width: 14 },
    { header: "Criterio de Cruce", key: "motivo", width: 38 },
  ];

  for (const m of result.matches) {
    const isEmitido = m.cfdi.direction === "EMITIDO";
    matchesSheet.addRow({
      status: m.status,
      score: m.confidenceScore,
      uuid: m.cfdi.uuid,
      direction: m.cfdi.direction,
      metodoPago: m.cfdi.metodoPago ?? "N/A",
      fechaCfdi: m.cfdi.fecha.slice(0, 10),
      rfcContrario: isEmitido ? m.cfdi.rfcReceptor : m.cfdi.rfcEmisor,
      razonSocial: isEmitido ? m.cfdi.nombreReceptor : m.cfdi.nombreEmisor,
      totalCfdi: m.cfdi.total * m.cfdi.tipoCambio,
      fechaBanco: m.bankTransaction.date,
      descBanco: m.bankTransaction.description,
      montoBanco: m.bankTransaction.amount,
      diferencia: m.amountDifference,
      motivo: m.reasons.join(" · "),
    });
  }
  styleHeaderRow(matchesSheet.getRow(1), "FF0F766E");
  matchesSheet.getColumn("totalCfdi").numFmt = CURRENCY_FORMAT;
  matchesSheet.getColumn("montoBanco").numFmt = CURRENCY_FORMAT;
  matchesSheet.getColumn("diferencia").numFmt = CURRENCY_FORMAT;

  // 3. CFDIs sin Movimiento Bancario
  const pendingCfdiSheet = workbook.addWorksheet("CFDIs sin Banco");
  pendingCfdiSheet.views = [{ state: "frozen", ySplit: 1 }];
  pendingCfdiSheet.columns = [
    { header: "UUID SAT", key: "uuid", width: 38 },
    { header: "Dirección", key: "direction", width: 12 },
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Método Pago", key: "metodoPago", width: 12 },
    { header: "RFC Contrario", key: "rfc", width: 16 },
    { header: "Nombre / Razón Social", key: "nombre", width: 34 },
    { header: "IVA", key: "iva", width: 14 },
    { header: "Total MXN", key: "total", width: 16 },
    { header: "Observación Fiscal", key: "nota", width: 36 },
  ];
  for (const c of result.unmatchedCfdis) {
    const isEmitido = c.direction === "EMITIDO";
    pendingCfdiSheet.addRow({
      uuid: c.uuid,
      direction: c.direction,
      fecha: c.fecha.slice(0, 10),
      metodoPago: c.metodoPago ?? "N/A",
      rfc: isEmitido ? c.rfcReceptor : c.rfcEmisor,
      nombre: isEmitido ? c.nombreReceptor : c.nombreEmisor,
      iva: c.iva * c.tipoCambio,
      total: c.total * c.tipoCambio,
      nota:
        c.metodoPago === "PUE"
          ? "ALERTA: CFDI PUE sin flujo bancario identificado"
          : "Pendiente de cobro/pago o complemento PPD",
    });
  }
  styleHeaderRow(pendingCfdiSheet.getRow(1), "FFB45309");
  pendingCfdiSheet.getColumn("iva").numFmt = CURRENCY_FORMAT;
  pendingCfdiSheet.getColumn("total").numFmt = CURRENCY_FORMAT;

  // 4. Movimientos Bancarios sin CFDI
  const pendingBankSheet = workbook.addWorksheet("Movimientos sin CFDI");
  pendingBankSheet.views = [{ state: "frozen", ySplit: 1 }];
  pendingBankSheet.columns = [
    { header: "Fecha", key: "date", width: 14 },
    { header: "Tipo", key: "type", width: 10 },
    { header: "Referencia", key: "reference", width: 18 },
    { header: "Descripción", key: "description", width: 42 },
    { header: "Monto MXN", key: "amount", width: 16 },
    { header: "Banco", key: "bankName", width: 18 },
    { header: "Acción Sugerida", key: "accion", width: 36 },
  ];
  for (const t of result.unmatchedTransactions) {
    pendingBankSheet.addRow({
      date: t.date,
      type: t.type,
      reference: t.reference ?? "",
      description: t.description,
      amount: t.amount,
      bankName: t.bankName ?? "Banco",
      accion:
        t.type === "CARGO"
          ? "Solicitar factura al proveedor o clasificar como no deducible"
          : "Verificar si requiere emisión de CFDI de ingreso o REP",
    });
  }
  styleHeaderRow(pendingBankSheet.getRow(1), "FF991B1B");
  pendingBankSheet.getColumn("amount").numFmt = CURRENCY_FORMAT;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
