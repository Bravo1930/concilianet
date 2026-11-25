import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import type { BankColumnMapping } from "@/lib/validators/sat";

export interface BankPreviewResult {
  fileName: string;
  totalRows: number;
  headerRow: number; // 1-based
  headers: string[];
  previewRows: Array<Record<string, string>>;
  suggestedMapping: BankColumnMapping;
}

export interface ParsedBankMovement {
  fecha: Date;
  fechaIso: string;
  concepto: string;
  monto: number;
  tipo: "ABONO" | "CARGO";
  hashUnico: string;
}

export interface BankCommitParseResult {
  totalDataRows: number;
  movements: ParsedBankMovement[];
  errors: Array<{ rowNumber: number; error: string }>;
}

const SPANISH_MONTHS: Record<string, number> = {
  ene: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dic: 11,
};

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).trim();
}

function readSheetMatrix(buffer: Buffer, fileName: string): unknown[][] {
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(buffer.toString("utf-8"), { type: "string", raw: true })
    : XLSX.read(buffer, { type: "buffer", cellDates: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
  });
}

function detectHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const normalized = rows[i].map(normalizeHeader);
    const hasDate = normalized.some(
      (h) => h.includes("fecha") || h === "date" || h.includes("dia")
    );
    const hasConcept = normalized.some(
      (h) =>
        h.includes("concepto") ||
        h.includes("descripcion") ||
        h.includes("detalle") ||
        h.includes("movimiento") ||
        h.includes("description")
    );
    if (hasDate && hasConcept) return i;
  }
  return 0;
}

function buildHeadersList(headerCells: unknown[]): string[] {
  const seen = new Map<string, number>();
  return headerCells.map((cell, idx) => {
    const base = String(cell ?? "").trim() || `Columna_${idx + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function inferMappingFromHeaders(
  headers: string[],
  headerRow1Based: number,
  savedMapping?: BankColumnMapping | null
): BankColumnMapping {
  if (savedMapping) {
    const headerSet = new Set(headers);
    if (
      headerSet.has(savedMapping.columns.fecha) &&
      headerSet.has(savedMapping.columns.concepto)
    ) {
      return {
        ...savedMapping,
        headerRow: headerRow1Based,
      };
    }
  }

  const findHeader = (keywords: string[]) =>
    headers.find((h) =>
      keywords.some((kw) => normalizeHeader(h).includes(kw))
    ) ?? "";

  return {
    delimiter: ",",
    headerRow: headerRow1Based,
    dateFormat: "DD/MM/YYYY",
    columns: {
      fecha: findHeader(["fecha", "date", "dia"]) || headers[0] || "Fecha",
      concepto:
        findHeader([
          "concepto",
          "descripcion",
          "detalle",
          "movimiento",
          "description",
        ]) ||
        headers[1] ||
        "Concepto",
      cargo: findHeader(["cargo", "retiro", "debito", "egreso", "salida"]),
      abono: findHeader(["abono", "deposito", "credito", "ingreso", "entrada"]),
      monto: findHeader(["importe", "monto", "amount", "valor"]),
      referencia: findHeader(["referencia", "folio", "rastreo", "ref"]),
    },
  };
}

/**
 * Extrae las primeras 5 filas del archivo bancario (.csv / .xlsx) para vista previa
 * y propone un mapeo de columnas (reutilizando savedMapping si coincide).
 */
export function extractBankFilePreview(
  buffer: Buffer,
  fileName: string,
  options?: {
    headerRowOverride?: number;
    savedMapping?: BankColumnMapping | null;
  }
): BankPreviewResult {
  const rows = readSheetMatrix(buffer, fileName);
  if (rows.length === 0) {
    return {
      fileName,
      totalRows: 0,
      headerRow: 1,
      headers: [],
      previewRows: [],
      suggestedMapping: inferMappingFromHeaders([], 1, options?.savedMapping),
    };
  }

  let detectedIdx: number;
  if (options?.headerRowOverride && options.headerRowOverride >= 1) {
    detectedIdx = Math.min(options.headerRowOverride - 1, rows.length - 1);
  } else if (
    options?.savedMapping?.headerRow &&
    options.savedMapping.headerRow <= rows.length
  ) {
    const candidateIdx = options.savedMapping.headerRow - 1;
    const candidateHeaders = new Set(buildHeadersList(rows[candidateIdx] ?? []));
    if (
      candidateHeaders.has(options.savedMapping.columns.fecha) &&
      candidateHeaders.has(options.savedMapping.columns.concepto)
    ) {
      detectedIdx = candidateIdx;
    } else {
      detectedIdx = detectHeaderRowIndex(rows);
    }
  } else {
    detectedIdx = detectHeaderRowIndex(rows);
  }

  const headers = buildHeadersList(rows[detectedIdx] ?? []);
  const previewRows: Array<Record<string, string>> = [];

  for (
    let i = detectedIdx + 1;
    i < rows.length && previewRows.length < 5;
    i++
  ) {
    const row = rows[i];
    if (!row || row.every((c) => formatCellValue(c) === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, colIdx) => {
      obj[h] = formatCellValue(row[colIdx]);
    });
    previewRows.push(obj);
  }

  return {
    fileName,
    totalRows: Math.max(0, rows.length - detectedIdx - 1),
    headerRow: detectedIdx + 1,
    headers,
    previewRows,
    suggestedMapping: inferMappingFromHeaders(
      headers,
      detectedIdx + 1,
      options?.savedMapping
    ),
  };
}

function parseMonetary(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (val === null || val === undefined) return 0;
  let str = String(val).trim();
  if (!str || str === "-" || str === "--") return 0;
  const isParenNeg = /^\(.*\)$/.test(str);
  str = str.replace(/[()$,\sMXNUSD]/gi, "");
  const num = Number.parseFloat(str);
  if (!Number.isFinite(num)) return 0;
  return isParenNeg ? -Math.abs(num) : num;
}

function parseDateWithFormat(
  val: unknown,
  dateFormat: BankColumnMapping["dateFormat"]
): { date: Date; iso: string } | null {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const iso = val.toISOString().slice(0, 10);
    return { date: new Date(`${iso}T12:00:00.000Z`), iso };
  }

  if (typeof val === "number" && val > 20000 && val < 80000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      const iso = `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
      return { date: new Date(`${iso}T12:00:00.000Z`), iso };
    }
  }

  const raw = String(val ?? "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const iso = raw.slice(0, 10);
    return { date: new Date(`${iso}T12:00:00.000Z`), iso };
  }

  // DD-MMM-YYYY
  const dMonY = raw.match(/^(\d{1,2})[/-]([a-zA-Z]{3})[/-](\d{2,4})/);
  if (dMonY) {
    const mIdx = SPANISH_MONTHS[dMonY[2].toLowerCase()];
    if (mIdx !== undefined) {
      const year = dMonY[3].length === 2 ? `20${dMonY[3]}` : dMonY[3];
      const iso = `${year}-${String(mIdx + 1).padStart(2, "0")}-${dMonY[1].padStart(2, "0")}`;
      return { date: new Date(`${iso}T12:00:00.000Z`), iso };
    }
  }

  const slashParts = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (slashParts) {
    const year =
      slashParts[3].length === 2 ? `20${slashParts[3]}` : slashParts[3];
    let day = slashParts[1];
    let month = slashParts[2];
    if (dateFormat === "MM/DD/YYYY") {
      month = slashParts[1];
      day = slashParts[2];
    }
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const dt = new Date(`${iso}T12:00:00.000Z`);
    if (!Number.isNaN(dt.getTime())) return { date: dt, iso };
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) {
    const iso = fallback.toISOString().slice(0, 10);
    return { date: new Date(`${iso}T12:00:00.000Z`), iso };
  }
  return null;
}

/**
 * Genera hashUnico determinístico (SHA-256) con fecha + concepto + monto + bankAccountId
 * para evitar duplicar movimientos al subir el mismo estado de cuenta dos veces.
 */
export function computeBankTransactionHash(params: {
  fechaIso: string;
  concepto: string;
  monto: number;
  bankAccountId: string;
}): string {
  const normalizedConcepto = params.concepto
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  const seed = `${params.fechaIso}|${normalizedConcepto}|${params.monto.toFixed(2)}|${params.bankAccountId}`;
  return createHash("sha256").update(seed).digest("hex");
}

/**
 * Parsea todas las transacciones del archivo bancario aplicando el mapeo de columnas asignado.
 */
export function parseBankTransactionsWithMapping(
  buffer: Buffer,
  fileName: string,
  bankAccountId: string,
  mapping: BankColumnMapping
): BankCommitParseResult {
  const rows = readSheetMatrix(buffer, fileName);
  const headerIdx = Math.max(0, mapping.headerRow - 1);

  if (rows.length <= headerIdx + 1) {
    return {
      totalDataRows: 0,
      movements: [],
      errors: [
        {
          rowNumber: mapping.headerRow,
          error: "El archivo no contiene filas de movimientos después del encabezado.",
        },
      ],
    };
  }

  const headers = buildHeadersList(rows[headerIdx] ?? []);
  const colIndex = (name?: string) =>
    name ? headers.findIndex((h) => h === name) : -1;

  const idxFecha = colIndex(mapping.columns.fecha);
  const idxConcepto = colIndex(mapping.columns.concepto);
  const idxCargo = colIndex(mapping.columns.cargo);
  const idxAbono = colIndex(mapping.columns.abono);
  const idxMonto = colIndex(mapping.columns.monto);
  const idxRef = colIndex(mapping.columns.referencia);

  if (idxFecha === -1 || idxConcepto === -1) {
    return {
      totalDataRows: 0,
      movements: [],
      errors: [
        {
          rowNumber: mapping.headerRow,
          error: `No se encontraron las columnas '${mapping.columns.fecha}' o '${mapping.columns.concepto}'.`,
        },
      ],
    };
  }

  const movements: ParsedBankMovement[] = [];
  const errors: Array<{ rowNumber: number; error: string }> = [];
  let totalDataRows = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => formatCellValue(c) === "")) continue;
    totalDataRows++;

    const parsedDate = parseDateWithFormat(row[idxFecha], mapping.dateFormat);
    if (!parsedDate) {
      errors.push({
        rowNumber: i + 1,
        error: `Fecha ilegible '${formatCellValue(row[idxFecha])}'`,
      });
      continue;
    }

    const baseConcepto = formatCellValue(row[idxConcepto]);
    const refVal = idxRef >= 0 ? formatCellValue(row[idxRef]) : "";
    const concepto = refVal ? `${baseConcepto} [Ref: ${refVal}]` : baseConcepto;

    if (!baseConcepto) {
      errors.push({ rowNumber: i + 1, error: "Concepto bancario vacío" });
      continue;
    }

    let tipo: "ABONO" | "CARGO" | null = null;
    let monto = 0;

    const cargoVal = idxCargo >= 0 ? Math.abs(parseMonetary(row[idxCargo])) : 0;
    const abonoVal = idxAbono >= 0 ? Math.abs(parseMonetary(row[idxAbono])) : 0;

    if (abonoVal > 0 && cargoVal === 0) {
      tipo = "ABONO";
      monto = abonoVal;
    } else if (cargoVal > 0 && abonoVal === 0) {
      tipo = "CARGO";
      monto = cargoVal;
    } else if (idxMonto >= 0) {
      const signed = parseMonetary(row[idxMonto]);
      if (signed !== 0) {
        tipo = signed > 0 ? "ABONO" : "CARGO";
        monto = Math.abs(signed);
      }
    }

    if (!tipo || monto <= 0) {
      errors.push({
        rowNumber: i + 1,
        error: "No se pudo determinar monto/tipo (Cargo, Abono o Importe)",
      });
      continue;
    }

    const roundedMonto = Number(monto.toFixed(2));
    const hashUnico = computeBankTransactionHash({
      fechaIso: parsedDate.iso,
      concepto,
      monto: roundedMonto,
      bankAccountId,
    });

    movements.push({
      fecha: parsedDate.date,
      fechaIso: parsedDate.iso,
      concepto,
      monto: roundedMonto,
      tipo,
      hashUnico,
    });
  }

  return {
    totalDataRows,
    movements,
    errors,
  };
}
