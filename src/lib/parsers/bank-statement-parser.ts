import * as XLSX from "xlsx";
import {
  parsedBankTransactionSchema,
  type ParsedBankTransaction,
} from "@/lib/validators/sat";

export interface BankParseOutput {
  transactions: ParsedBankTransaction[];
  detectedBank: string;
  skippedRows: number;
  warnings: string[];
}

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseMonetary(val: unknown): number {
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : 0;
  }
  if (val === null || val === undefined) return 0;
  let str = String(val).trim();
  if (!str || str === "-" || str === "--") return 0;
  const isNegativeParens = /^\(.*\)$/.test(str);
  str = str.replace(/[()$,\sMXNUSD]/gi, "");
  const num = Number.parseFloat(str);
  if (!Number.isFinite(num)) return 0;
  return isNegativeParens ? -Math.abs(num) : num;
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

function parseMexicanDate(val: unknown): string | null {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === "number" && val > 20000 && val < 80000) {
    // Número de serie de fecha en Excel
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${m}-${d}`;
    }
  }

  const raw = String(val ?? "").trim();
  if (!raw) return null;

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${month}-${day}`;
  }

  // DD-MMM-YYYY (ej. 14-Nov-2026 usado por BBVA / Banorte)
  const dMonY = raw.match(/^(\d{1,2})[/-]([a-zA-Z]{3})[/-](\d{2,4})/);
  if (dMonY) {
    const mIdx = SPANISH_MONTHS[dMonY[2].toLowerCase()];
    if (mIdx !== undefined) {
      const day = dMonY[1].padStart(2, "0");
      const month = String(mIdx + 1).padStart(2, "0");
      const year = dMonY[3].length === 2 ? `20${dMonY[3]}` : dMonY[3];
      return `${year}-${month}-${day}`;
    }
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }

  return null;
}

function detectBankName(rows: unknown[][]): string {
  const sampleText = rows
    .slice(0, 12)
    .flat()
    .map((c) => String(c ?? "").toLowerCase())
    .join(" ");

  if (sampleText.includes("bbva") || sampleText.includes("bancomer")) return "BBVA México";
  if (sampleText.includes("santander")) return "Santander México";
  if (sampleText.includes("banorte")) return "Banorte";
  if (sampleText.includes("banamex") || sampleText.includes("citibanamex")) return "Citibanamex";
  if (sampleText.includes("hsbc")) return "HSBC México";
  if (sampleText.includes("scotiabank")) return "Scotiabank";
  return "Banco Genérico";
}

function buildDeterministicHash(
  index: number,
  date: string,
  description: string,
  type: string,
  amount: number
): string {
  const input = `${index}|${date}|${type}|${amount.toFixed(2)}|${description}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mov_${(hash >>> 0).toString(16)}`;
}

/**
 * Parsea estados de cuenta bancarios en formato CSV, XLSX o XLS usando SheetJS (xlsx).
 * Detecta automáticamente encabezados de bancos mexicanos (BBVA, Santander, Banorte, etc.).
 */
export function parseBankStatement(
  input: ArrayBuffer | Buffer | string,
  bankHint?: string
): BankParseOutput {
  const workbook =
    typeof input === "string"
      ? XLSX.read(input, { type: "string", raw: false })
      : XLSX.read(input, { type: "buffer", cellDates: true });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      transactions: [],
      detectedBank: bankHint ?? "Desconocido",
      skippedRows: 0,
      warnings: ["El archivo no contiene hojas de cálculo legibles."],
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  const detectedBank = bankHint ?? detectBankName(rows);

  // Buscar fila de encabezados dentro de las primeras 20 filas
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const normalized = rows[i].map(normalizeHeader);
    const hasDate = normalized.some(
      (h) => h.includes("fecha") || h === "date" || h.includes("dia")
    );
    const hasDesc = normalized.some(
      (h) =>
        h.includes("concepto") ||
        h.includes("descripcion") ||
        h.includes("detalle") ||
        h.includes("movimiento") ||
        h.includes("description")
    );
    if (hasDate && hasDesc) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      transactions: [],
      detectedBank,
      skippedRows: rows.length,
      warnings: [
        "No se localizó una fila de encabezados válida (Fecha + Concepto/Descripción).",
      ],
    };
  }

  const headers = rows[headerRowIdx].map(normalizeHeader);
  const findCol = (keywords: string[]) =>
    headers.findIndex((h) => keywords.some((kw) => h.includes(kw)));

  const colDate = findCol(["fecha", "date", "dia"]);
  const colDesc = findCol(["concepto", "descripcion", "detalle", "movimiento", "description"]);
  const colRef = findCol(["referencia", "folio", "rastreo", "ref", "documento"]);
  const colCargo = findCol(["cargo", "retiro", "debito", "egreso", "salida"]);
  const colAbono = findCol(["abono", "deposito", "credito", "ingreso", "entrada"]);
  const colAmount = findCol(["importe", "monto", "amount", "valor"]);
  const colType = findCol(["tipo", "naturaleza"]);
  const colBalance = findCol(["saldo", "balance"]);

  const transactions: ParsedBankTransaction[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;

    const date = parseMexicanDate(row[colDate]);
    const description = String(row[colDesc] ?? "").trim();

    if (!date || !description) {
      skippedRows++;
      continue;
    }

    let cargo = colCargo >= 0 ? Math.abs(parseMonetary(row[colCargo])) : 0;
    let abono = colAbono >= 0 ? Math.abs(parseMonetary(row[colAbono])) : 0;

    if (cargo === 0 && abono === 0 && colAmount >= 0) {
      const rawAmount = parseMonetary(row[colAmount]);
      const rawType = colType >= 0 ? normalizeHeader(row[colType]) : "";
      const isDebit =
        rawAmount < 0 ||
        rawType.includes("cargo") ||
        rawType.includes("retiro") ||
        rawType.includes("dr");
      if (isDebit) {
        cargo = Math.abs(rawAmount);
      } else {
        abono = Math.abs(rawAmount);
      }
    }

    const amount = Number(Math.max(cargo, abono).toFixed(2));
    if (amount <= 0) {
      skippedRows++;
      continue;
    }

    const type: "ABONO" | "CARGO" = abono > 0 ? "ABONO" : "CARGO";
    const reference =
      colRef >= 0 && String(row[colRef] ?? "").trim()
        ? String(row[colRef]).trim()
        : undefined;
    const balance =
      colBalance >= 0 && String(row[colBalance] ?? "").trim() !== ""
        ? Number(parseMonetary(row[colBalance]).toFixed(2))
        : undefined;

    const externalHash = buildDeterministicHash(
      i,
      date,
      description,
      type,
      amount
    );

    const parsed = parsedBankTransactionSchema.safeParse({
      id: `${externalHash}_${i}`,
      date,
      reference,
      description,
      type,
      cargo: Number(cargo.toFixed(2)),
      abono: Number(abono.toFixed(2)),
      amount,
      balance,
      currency: "MXN",
      bankName: detectedBank,
      externalHash,
    });

    if (parsed.success) {
      transactions.push(parsed.data);
    } else {
      skippedRows++;
      warnings.push(`Fila ${i + 1} omitida: ${parsed.error.issues[0]?.message}`);
    }
  }

  return {
    transactions,
    detectedBank,
    skippedRows,
    warnings,
  };
}
