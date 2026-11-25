import ExcelJS from "exceljs";

export interface ReportClientInfo {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  firmName: string;
}

export interface ReportConciliadoRow {
  fechaPago: Date;
  conceptoBanco: string;
  montoBanco: number;
  uuid: string;
  rfcTercero: string;
  razonSocialTercero: string;
  metodoPago: string;
  montoAplicado: number;
  tipoMatch: string;
  estatusMatch: string;
}

export interface ReportCfdiPendienteRow {
  uuid: string;
  fechaEmision: Date;
  direccion: "EMITIDO" | "RECIBIDO";
  tipoComprobante: string;
  metodoPago: string;
  rfcTercero: string;
  razonSocialTercero: string;
  moneda: string;
  total: number;
  saldoPendiente: number;
  estatus: string;
}

export interface ReportBancoSinFacturaRow {
  fecha: Date;
  banco: string;
  cuenta: string;
  tipo: "ABONO" | "CARGO";
  concepto: string;
  monto: number;
  estatus: string;
}

export interface ClientPeriodReportData {
  client: ReportClientInfo;
  month: number;
  year: number;
  conciliados: ReportConciliadoRow[];
  cfdisPendientes: ReportCfdiPendienteRow[];
  bancoSinFactura: ReportBancoSinFacturaRow[];
}

const CURRENCY_FMT = "$#,##0.00";

function styleSheetHeader(row: ExcelJS.Row, fgArgb = "FF0F172A") {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fgArgb },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
}

function autoFitColumns(
  worksheet: ExcelJS.Worksheet,
  minWidth = 12,
  maxWidth = 50
) {
  worksheet.columns.forEach((column) => {
    if (!column || !column.eachCell) return;
    let maxLen = minWidth;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const val = cell.value;
      const text =
        val === null || val === undefined
          ? ""
          : typeof val === "object" && "richText" in val
            ? val.richText.map((r) => r.text).join("")
            : String(val);
      const len = text.length + 3;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.min(maxWidth, maxLen);
  });
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Genera el libro Excel (.xlsx) con 4 pestañas formateadas profesionalmente:
 * 1. "Resumen Ejecutivo"
 * 2. "Conciliados"
 * 3. "CFDIs Pendientes"
 * 4. "Banco Sin Factura"
 */
export async function generateClientExcelReport(
  data: ClientPeriodReportData
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ConciliaSAT";
  workbook.created = new Date();

  const periodLabel = `${String(data.month).padStart(2, "0")}/${data.year}`;

  const totalConciliadoMxn = round2(
    data.conciliados.reduce((acc, r) => acc + r.montoAplicado, 0)
  );
  const cxcPendientes = data.cfdisPendientes.filter(
    (c) => c.direccion === "EMITIDO"
  );
  const cxpPendientes = data.cfdisPendientes.filter(
    (c) => c.direccion === "RECIBIDO"
  );
  const totalCxcPendiente = round2(
    cxcPendientes.reduce((acc, c) => acc + c.saldoPendiente, 0)
  );
  const totalCxpPendiente = round2(
    cxpPendientes.reduce((acc, c) => acc + c.saldoPendiente, 0)
  );
  const cargosSinFactura = data.bancoSinFactura.filter(
    (t) => t.tipo === "CARGO"
  );
  const abonosSinFactura = data.bancoSinFactura.filter(
    (t) => t.tipo === "ABONO"
  );
  const totalGastosSinFactura = round2(
    cargosSinFactura.reduce((acc, t) => acc + t.monto, 0)
  );
  const totalAbonosSinFactura = round2(
    abonosSinFactura.reduce((acc, t) => acc + t.monto, 0)
  );

  // ==========================================================================
  // 1. Resumen Ejecutivo
  // ==========================================================================
  const summarySheet = workbook.addWorksheet("Resumen Ejecutivo");
  summarySheet.views = [{ state: "frozen", ySplit: 1 }];
  summarySheet.columns = [
    { header: "Concepto / Indicador Fiscal", key: "concepto" },
    { header: "Detalle / Valor", key: "valor" },
  ];

  summarySheet.addRows([
    { concepto: "Despacho Contable", valor: data.client.firmName },
    { concepto: "RFC del Contribuyente", valor: data.client.rfc },
    { concepto: "Razón Social", valor: data.client.razonSocial },
    { concepto: "Régimen Fiscal SAT", valor: data.client.regimenFiscal },
    { concepto: "Periodo Conciliado", valor: periodLabel },
    { concepto: "", valor: "" },
    {
      concepto: "Movimientos / Vínculos Conciliados (Cantidad)",
      valor: data.conciliados.length,
    },
    {
      concepto: "Total Conciliado Aplicado (MXN)",
      valor: totalConciliadoMxn,
    },
    {
      concepto: "CFDIs Pendientes de Cobro - CxC (Cantidad)",
      valor: cxcPendientes.length,
    },
    {
      concepto: "Saldo Pendiente de Cobro - CxC (MXN)",
      valor: totalCxcPendiente,
    },
    {
      concepto: "CFDIs Pendientes de Pago - CxP (Cantidad)",
      valor: cxpPendientes.length,
    },
    {
      concepto: "Saldo Pendiente de Pago - CxP (MXN)",
      valor: totalCxpPendiente,
    },
    {
      concepto: "Gastos Bancarios sin Factura - No Deducibles (Cantidad)",
      valor: cargosSinFactura.length,
    },
    {
      concepto: "Total Gastos sin Factura (MXN)",
      valor: totalGastosSinFactura,
    },
    {
      concepto: "Depósitos Bancarios sin CFDI (Cantidad)",
      valor: abonosSinFactura.length,
    },
    {
      concepto: "Total Depósitos sin CFDI (MXN)",
      valor: totalAbonosSinFactura,
    },
  ]);

  styleSheetHeader(summarySheet.getRow(1), "FF0F172A");
  for (const rowIdx of [9, 11, 13, 15, 17]) {
    const cell = summarySheet.getCell(`B${rowIdx}`);
    cell.numFmt = CURRENCY_FMT;
    cell.font = { bold: true };
  }
  autoFitColumns(summarySheet, 20, 56);

  // ==========================================================================
  // 2. Conciliados
  // ==========================================================================
  const conciliadosSheet = workbook.addWorksheet("Conciliados");
  conciliadosSheet.views = [{ state: "frozen", ySplit: 1 }];
  conciliadosSheet.columns = [
    { header: "Fecha pago", key: "fechaPago" },
    { header: "Concepto banco", key: "conceptoBanco" },
    { header: "Monto banco", key: "montoBanco" },
    { header: "UUID", key: "uuid" },
    { header: "RFC Tercero", key: "rfcTercero" },
    { header: "Razón Social", key: "razonSocial" },
    { header: "Método Pago", key: "metodoPago" },
    { header: "Monto Aplicado", key: "montoAplicado" },
    { header: "Tipo de Match", key: "tipoMatch" },
    { header: "Estatus", key: "estatus" },
  ];

  for (const r of data.conciliados) {
    conciliadosSheet.addRow({
      fechaPago: r.fechaPago.toISOString().slice(0, 10),
      conceptoBanco: r.conceptoBanco,
      montoBanco: r.montoBanco,
      uuid: r.uuid,
      rfcTercero: r.rfcTercero,
      razonSocial: r.razonSocialTercero,
      metodoPago: r.metodoPago,
      montoAplicado: r.montoAplicado,
      tipoMatch: r.tipoMatch,
      estatus: r.estatusMatch,
    });
  }

  styleSheetHeader(conciliadosSheet.getRow(1), "FF0F766E");
  conciliadosSheet.getColumn("montoBanco").numFmt = CURRENCY_FMT;
  conciliadosSheet.getColumn("montoAplicado").numFmt = CURRENCY_FMT;
  autoFitColumns(conciliadosSheet);

  // ==========================================================================
  // 3. CFDIs Pendientes
  // ==========================================================================
  const pendientesSheet = workbook.addWorksheet("CFDIs Pendientes");
  pendientesSheet.views = [{ state: "frozen", ySplit: 1 }];
  pendientesSheet.columns = [
    { header: "UUID", key: "uuid" },
    { header: "Fecha Emisión", key: "fechaEmision" },
    { header: "Dirección", key: "direccion" },
    { header: "Cuenta", key: "clasificacion" },
    { header: "Tipo CFDI", key: "tipoComprobante" },
    { header: "Método Pago", key: "metodoPago" },
    { header: "RFC Tercero", key: "rfcTercero" },
    { header: "Razón Social", key: "razonSocial" },
    { header: "Moneda", key: "moneda" },
    { header: "Total", key: "total" },
    { header: "Saldo Pendiente", key: "saldoPendiente" },
    { header: "Estatus", key: "estatus" },
  ];

  for (const c of data.cfdisPendientes) {
    pendientesSheet.addRow({
      uuid: c.uuid,
      fechaEmision: c.fechaEmision.toISOString().slice(0, 10),
      direccion: c.direccion,
      clasificacion:
        c.direccion === "EMITIDO" ? "Por Cobrar (CxC)" : "Por Pagar (CxP)",
      tipoComprobante: c.tipoComprobante,
      metodoPago: c.metodoPago,
      rfcTercero: c.rfcTercero,
      razonSocial: c.razonSocialTercero,
      moneda: c.moneda,
      total: c.total,
      saldoPendiente: c.saldoPendiente,
      estatus: c.estatus,
    });
  }

  styleSheetHeader(pendientesSheet.getRow(1), "FFB45309");
  pendientesSheet.getColumn("total").numFmt = CURRENCY_FMT;
  pendientesSheet.getColumn("saldoPendiente").numFmt = CURRENCY_FMT;
  autoFitColumns(pendientesSheet);

  // ==========================================================================
  // 4. Banco Sin Factura
  // ==========================================================================
  const bankSheet = workbook.addWorksheet("Banco Sin Factura");
  bankSheet.views = [{ state: "frozen", ySplit: 1 }];
  bankSheet.columns = [
    { header: "Fecha", key: "fecha" },
    { header: "Banco", key: "banco" },
    { header: "Cuenta", key: "cuenta" },
    { header: "Tipo", key: "tipo" },
    { header: "Concepto", key: "concepto" },
    { header: "Monto", key: "monto" },
    { header: "Estatus", key: "estatus" },
  ];

  for (const t of data.bancoSinFactura) {
    bankSheet.addRow({
      fecha: t.fecha.toISOString().slice(0, 10),
      banco: t.banco,
      cuenta: t.cuenta,
      tipo: t.tipo,
      concepto: t.concepto,
      monto: t.monto,
      estatus: t.estatus,
    });
  }

  styleSheetHeader(bankSheet.getRow(1), "FF991B1B");
  bankSheet.getColumn("monto").numFmt = CURRENCY_FMT;
  autoFitColumns(bankSheet);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function escapeCsvField(val: string | number): string {
  const s = String(val ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Genera un reporte CSV unificado (UTF-8 con BOM para Excel) con las secciones
 * del periodo: Conciliados, CFDIs Pendientes y Banco Sin Factura.
 */
export function generateClientCsvReport(data: ClientPeriodReportData): Buffer {
  const lines: string[] = [];
  const row = (cols: Array<string | number>) =>
    lines.push(cols.map(escapeCsvField).join(","));

  row([
    "Sección",
    "Fecha",
    "UUID / Referencia",
    "RFC Tercero",
    "Razón Social / Banco",
    "Concepto / Método",
    "Tipo / Match",
    "Monto / Total",
    "Saldo / Aplicado",
    "Estatus",
  ]);

  for (const c of data.conciliados) {
    row([
      "CONCILIADO",
      c.fechaPago.toISOString().slice(0, 10),
      c.uuid,
      c.rfcTercero,
      c.razonSocialTercero,
      `${c.conceptoBanco} (${c.metodoPago})`,
      c.tipoMatch,
      c.montoBanco.toFixed(2),
      c.montoAplicado.toFixed(2),
      c.estatusMatch,
    ]);
  }

  for (const p of data.cfdisPendientes) {
    row([
      "CFDI_PENDIENTE",
      p.fechaEmision.toISOString().slice(0, 10),
      p.uuid,
      p.rfcTercero,
      p.razonSocialTercero,
      `${p.direccion} · ${p.metodoPago}`,
      p.tipoComprobante,
      p.total.toFixed(2),
      p.saldoPendiente.toFixed(2),
      p.estatus,
    ]);
  }

  for (const b of data.bancoSinFactura) {
    row([
      "BANCO_SIN_FACTURA",
      b.fecha.toISOString().slice(0, 10),
      b.cuenta,
      "",
      b.banco,
      b.concepto,
      b.tipo,
      b.monto.toFixed(2),
      b.monto.toFixed(2),
      b.estatus,
    ]);
  }

  // BOM UTF-8 para compatibilidad directa con Excel en español
  return Buffer.from("\uFEFF" + lines.join("\r\n"), "utf-8");
}
