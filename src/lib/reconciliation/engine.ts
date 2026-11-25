import type {
  ParsedBankTransaction,
  ParsedCfdi,
} from "@/lib/validators/sat";
import { prisma } from "@/lib/db";
import type {
  BankTransactionStatus,
  CfdiStatus,
  MatchType,
  ReconciliationStatus,
} from "@prisma/client";

// ============================================================================
// 1. MOTOR EN MEMORIA (Usado por el workbench rápido /api/reconcile y Excel)
// ============================================================================

export type ReconciliationMatchStatus =
  | "AUTO_MATCHED"
  | "SUGGESTED"
  | "PARTIAL_PPD"
  | "DISCREPANCY";

export interface ReconciliationMatchItem {
  id: string;
  cfdi: ParsedCfdi;
  bankTransaction: ParsedBankTransaction;
  status: ReconciliationMatchStatus;
  confidenceScore: number;
  amountDifference: number;
  daysDifference: number;
  reasons: string[];
}

export interface ReconciliationSummary {
  totalCfdis: number;
  totalMovements: number;
  autoMatchedCount: number;
  suggestedCount: number;
  discrepancyCount: number;
  unmatchedCfdiCount: number;
  unmatchedBankCount: number;
  reconciliationRate: number;
  matchedAmountMxn: number;
  pendingCfdiAmountMxn: number;
  pendingBankAmountMxn: number;
  ivaTrasladadoConciliado: number;
  ivaAcreditableConciliado: number;
  pueSinFlujoCount: number;
}

export interface ReconciliationResult {
  matches: ReconciliationMatchItem[];
  unmatchedCfdis: ParsedCfdi[];
  unmatchedTransactions: ParsedBankTransaction[];
  summary: ReconciliationSummary;
}

export interface ReconciliationOptions {
  amountToleranceMxn?: number;
  maxDateWindowDays?: number;
  autoMatchThreshold?: number;
  suggestedThreshold?: number;
}

const LEGAL_SUFFIXES_REGEX =
  /\b(s\.?\s*a\.?\s*de\s*c\.?\s*v\.?|s\.?\s*de\s*r\.?\s*l\.?\s*de\s*c\.?\s*v\.?|s\.?\s*a\.?\s*p\.?\s*i\.?|s\.?\s*a\.?\s*b\.?|s\.?\s*c\.?|a\.?\s*c\.?|s\.?\s*a\.?)\b/gi;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(LEGAL_SUFFIXES_REGEX, " ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function diffDaysStr(dateA: string, dateB: string): number {
  const a = new Date(dateA.slice(0, 10)).getTime();
  const b = new Date(dateB.slice(0, 10)).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 999;
  return Math.round(Math.abs(a - b) / (1000 * 60 * 60 * 24));
}

function diffDaysDate(dateA: Date, dateB: Date): number {
  const a = Date.UTC(
    dateA.getUTCFullYear(),
    dateA.getUTCMonth(),
    dateA.getUTCDate()
  );
  const b = Date.UTC(
    dateB.getUTCFullYear(),
    dateB.getUTCMonth(),
    dateB.getUTCDate()
  );
  return Math.round(Math.abs(a - b) / (1000 * 60 * 60 * 24));
}

function isDirectionCompatible(
  cfdi: ParsedCfdi,
  tx: ParsedBankTransaction
): boolean {
  if (cfdi.direction === "EMITIDO") {
    if (cfdi.tipoDeComprobante === "E") return tx.type === "CARGO";
    return tx.type === "ABONO";
  }
  if (cfdi.tipoDeComprobante === "E") return tx.type === "ABONO";
  return tx.type === "CARGO";
}

function scorePair(
  cfdi: ParsedCfdi,
  tx: ParsedBankTransaction,
  toleranceMxn: number,
  maxWindowDays: number
): {
  score: number;
  amountDiff: number;
  daysDiff: number;
  reasons: string[];
  isPartialPpd: boolean;
} {
  let score = 0;
  const reasons: string[] = [];

  const cfdiAmountMxn = Number((cfdi.total * cfdi.tipoCambio).toFixed(2));
  const amountDiff = Number(Math.abs(cfdiAmountMxn - tx.amount).toFixed(2));
  const daysDiff = diffDaysStr(cfdi.fecha, tx.date);
  let isPartialPpd = false;

  if (amountDiff === 0) {
    score += 55;
    reasons.push("Monto exacto");
  } else if (amountDiff <= toleranceMxn) {
    score += 42;
    reasons.push(`Monto dentro de tolerancia (±$${amountDiff.toFixed(2)})`);
  } else if (
    cfdi.metodoPago === "PPD" &&
    tx.amount < cfdiAmountMxn &&
    tx.amount > 0
  ) {
    score += 24;
    isPartialPpd = true;
    reasons.push("Posible abono parcial a factura PPD");
  } else {
    return {
      score: 0,
      amountDiff,
      daysDiff,
      reasons: [],
      isPartialPpd: false,
    };
  }

  if (daysDiff === 0) {
    score += 25;
    reasons.push("Misma fecha");
  } else if (daysDiff <= 3) {
    score += 20;
    reasons.push(`Desfase bancario de ${daysDiff}d`);
  } else if (daysDiff <= 7) {
    score += 12;
    reasons.push(`Fecha ±${daysDiff} días`);
  } else if (daysDiff <= maxWindowDays) {
    score += 5;
    reasons.push(`Dentro de ventana (${daysDiff}d)`);
  } else if (cfdi.metodoPago === "PPD" && daysDiff <= 45) {
    score += 4;
    reasons.push(`Pago diferido PPD (+${daysDiff}d)`);
  } else {
    score -= 10;
  }

  const counterpartyRfc =
    cfdi.direction === "EMITIDO" ? cfdi.rfcReceptor : cfdi.rfcEmisor;
  const counterpartyName =
    cfdi.direction === "EMITIDO" ? cfdi.nombreReceptor : cfdi.nombreEmisor;

  const bankCorpus = normalizeText(`${tx.description} ${tx.reference ?? ""}`);

  if (counterpartyRfc && bankCorpus.includes(counterpartyRfc.toUpperCase())) {
    score += 20;
    reasons.push(`RFC ${counterpartyRfc} detectado en referencia`);
  } else {
    const tokens = normalizeText(counterpartyName)
      .split(" ")
      .filter((t) => t.length >= 4);
    const matchedTokens = tokens.filter((t) => bankCorpus.includes(t));
    if (matchedTokens.length > 0) {
      const ratio = matchedTokens.length / Math.max(tokens.length, 1);
      score += ratio >= 0.5 ? 16 : 10;
      reasons.push(`Razón social coincidente (${matchedTokens[0]})`);
    }
  }

  if (
    cfdi.folio &&
    cfdi.folio.length >= 2 &&
    bankCorpus.includes(cfdi.folio.toUpperCase())
  ) {
    score += 12;
    reasons.push(`Folio ${cfdi.folio} en referencia bancaria`);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    amountDiff,
    daysDiff,
    reasons,
    isPartialPpd,
  };
}

export function reconcileBatch(
  cfdis: ParsedCfdi[],
  transactions: ParsedBankTransaction[],
  options: ReconciliationOptions = {}
): ReconciliationResult {
  const toleranceMxn = options.amountToleranceMxn ?? 1.0;
  const maxWindowDays = options.maxDateWindowDays ?? 15;
  const autoMatchThreshold = options.autoMatchThreshold ?? 78;
  const suggestedThreshold = options.suggestedThreshold ?? 55;

  const activeCfdis = cfdis.filter(
    (c) => c.estatusSat !== "CANCELADO" && c.tipoDeComprobante !== "T"
  );

  interface CandidateEdge {
    cfdiIdx: number;
    txIdx: number;
    score: number;
    amountDiff: number;
    daysDiff: number;
    reasons: string[];
    isPartialPpd: boolean;
  }

  const edges: CandidateEdge[] = [];

  for (let ci = 0; ci < activeCfdis.length; ci++) {
    const cfdi = activeCfdis[ci];
    for (let ti = 0; ti < transactions.length; ti++) {
      const tx = transactions[ti];
      if (!isDirectionCompatible(cfdi, tx)) continue;

      const evalRes = scorePair(cfdi, tx, toleranceMxn, maxWindowDays);
      if (evalRes.score >= suggestedThreshold) {
        edges.push({
          cfdiIdx: ci,
          txIdx: ti,
          ...evalRes,
        });
      }
    }
  }

  edges.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.amountDiff !== b.amountDiff) return a.amountDiff - b.amountDiff;
    return a.daysDiff - b.daysDiff;
  });

  const usedCfdis = new Set<number>();
  const usedTxs = new Set<number>();
  const matches: ReconciliationMatchItem[] = [];

  for (const edge of edges) {
    if (usedCfdis.has(edge.cfdiIdx) || usedTxs.has(edge.txIdx)) continue;
    usedCfdis.add(edge.cfdiIdx);
    usedTxs.add(edge.txIdx);

    const cfdi = activeCfdis[edge.cfdiIdx];
    const tx = transactions[edge.txIdx];

    let status: ReconciliationMatchStatus = "SUGGESTED";
    if (edge.isPartialPpd) {
      status = "PARTIAL_PPD";
    } else if (edge.amountDiff > toleranceMxn) {
      status = "DISCREPANCY";
    } else if (edge.score >= autoMatchThreshold) {
      status = "AUTO_MATCHED";
    }

    matches.push({
      id: `match_${cfdi.uuid.slice(0, 8)}_${tx.id}`,
      cfdi,
      bankTransaction: tx,
      status,
      confidenceScore: edge.score,
      amountDifference: edge.amountDiff,
      daysDifference: edge.daysDiff,
      reasons: edge.reasons,
    });
  }

  const unmatchedCfdis = activeCfdis.filter((_, idx) => !usedCfdis.has(idx));
  const unmatchedTransactions = transactions.filter(
    (_, idx) => !usedTxs.has(idx)
  );

  const autoMatchedCount = matches.filter(
    (m) => m.status === "AUTO_MATCHED"
  ).length;
  const suggestedCount = matches.filter(
    (m) => m.status === "SUGGESTED" || m.status === "PARTIAL_PPD"
  ).length;
  const discrepancyCount = matches.filter(
    (m) => m.status === "DISCREPANCY"
  ).length;

  const matchedAmountMxn = Number(
    matches.reduce((acc, m) => acc + m.bankTransaction.amount, 0).toFixed(2)
  );
  const pendingCfdiAmountMxn = Number(
    unmatchedCfdis
      .reduce((acc, c) => acc + c.total * c.tipoCambio, 0)
      .toFixed(2)
  );
  const pendingBankAmountMxn = Number(
    unmatchedTransactions.reduce((acc, t) => acc + t.amount, 0).toFixed(2)
  );

  const ivaTrasladadoConciliado = Number(
    matches
      .filter((m) => m.cfdi.direction === "EMITIDO")
      .reduce((acc, m) => acc + m.cfdi.iva * m.cfdi.tipoCambio, 0)
      .toFixed(2)
  );
  const ivaAcreditableConciliado = Number(
    matches
      .filter((m) => m.cfdi.direction === "RECIBIDO")
      .reduce((acc, m) => acc + m.cfdi.iva * m.cfdi.tipoCambio, 0)
      .toFixed(2)
  );

  const pueSinFlujoCount = unmatchedCfdis.filter(
    (c) => c.metodoPago === "PUE"
  ).length;

  const totalCfdis = activeCfdis.length;
  const reconciliationRate =
    totalCfdis > 0 ? Math.round((matches.length / totalCfdis) * 100) : 0;

  return {
    matches,
    unmatchedCfdis,
    unmatchedTransactions,
    summary: {
      totalCfdis,
      totalMovements: transactions.length,
      autoMatchedCount,
      suggestedCount,
      discrepancyCount,
      unmatchedCfdiCount: unmatchedCfdis.length,
      unmatchedBankCount: unmatchedTransactions.length,
      reconciliationRate,
      matchedAmountMxn,
      pendingCfdiAmountMxn,
      pendingBankAmountMxn,
      ivaTrasladadoConciliado,
      ivaAcreditableConciliado,
      pueSinFlujoCount,
    },
  };
}

// ============================================================================
// 2. MOTOR AVANZADO EN 4 NIVELES EN CASCADA (Persistencia Multi-Tenant Prisma)
// ============================================================================

export interface CascadeReconcileInput {
  clientId: string;
  organizationId: string;
  month: number;
  year: number;
  bankAccountId?: string;
  dateWindowDays?: number;
  amountTolerance?: number;
}

export interface CascadeMetrics {
  level1ExactPueCount: number;
  level1AutoCount: number;
  level1SuggestedCount: number;
  level2RepPpdCount: number;
  level3SubsetSumCount: number;
  level4ToleranceCount: number;
  totalMatchesCreated: number;
  cfdisConciliados: number;
  cfdisParciales: number;
  cfdisPendientes: number;
  bankConciliados: number;
  bankParciales: number;
  bankSinFactura: number;
}

export interface CreatedReconciliationSummary {
  id: string;
  cfdiId: string;
  cfdiUuid: string;
  bankTransactionId: string;
  montoAplicado: number;
  matchType: MatchType;
  confidenceScore: number;
  status: ReconciliationStatus;
  level: 1 | 2 | 3 | 4;
}

export interface CascadeReconcileOutput {
  period: { month: number; year: number };
  rules: { dateWindowDays: number; amountTolerance: number };
  metrics: CascadeMetrics;
  matches: CreatedReconciliationSummary[];
}

interface CfdiState {
  id: string;
  uuid: string;
  tipoComprobante: "I" | "E" | "P" | "N";
  metodoPago: "PUE" | "PPD" | null;
  fechaEmision: Date;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  total: number;
  moneda: string;
  tipoCambio: number;
  remainingSaldo: number;
  direccion: "EMITIDO" | "RECIBIDO";
  status: CfdiStatus;
  relatedUuidsJson: unknown;
  dirty: boolean;
}

interface BankTxState {
  id: string;
  fecha: Date;
  concepto: string;
  monto: number;
  tipo: "ABONO" | "CARGO";
  remainingAmount: number;
  appliedAmount: number;
  status: BankTransactionStatus;
  dirty: boolean;
}

interface PendingMatchInsert {
  cfdiId: string;
  cfdiUuid: string;
  bankTransactionId: string;
  montoAplicado: number;
  matchType: MatchType;
  confidenceScore: number;
  status: ReconciliationStatus;
  level: 1 | 2 | 3 | 4;
}

interface RepDoctoJson {
  idDocumento?: string;
  impPagado?: number;
  impSaldoInsoluto?: number;
}

interface RepPagoJson {
  fechaPago?: string;
  monto?: number;
  doctosRelacionados?: RepDoctoJson[];
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCents(n: number): number {
  return Math.round(n * 100);
}

function expectedBankTipo(
  direccion: "EMITIDO" | "RECIBIDO",
  tipoComprobante: "I" | "E" | "P" | "N"
): "ABONO" | "CARGO" {
  if (direccion === "EMITIDO") {
    return tipoComprobante === "E" ? "CARGO" : "ABONO";
  }
  return tipoComprobante === "E" ? "ABONO" : "CARGO";
}

function scoreConceptMatch(
  counterpartyRfc: string,
  counterpartyName: string,
  concepto: string
): number {
  const corpus = normalizeText(concepto);
  let bonus = 0;
  if (counterpartyRfc && corpus.includes(counterpartyRfc.toUpperCase())) {
    bonus += 20;
  }
  const tokens = normalizeText(counterpartyName)
    .split(" ")
    .filter((t) => t.length >= 4);
  const hits = tokens.filter((t) => corpus.includes(t)).length;
  if (hits >= 2) {
    bonus += 18;
  } else if (hits === 1) {
    bonus += 12;
  }
  return Math.min(25, bonus);
}

/**
 * Algoritmo acotado de Subset Sum (máximo maxItems elementos, mínimo minItems elementos)
 * en centavos enteros para evitar imprecisiones de punto flotante.
 */
function findExactSubsetCents(
  items: Array<{ id: string; cents: number }>,
  targetCents: number,
  minItems = 2,
  maxItems = 6
): string[] | null {
  if (targetCents <= 0 || items.length < minItems) return null;

  // Limitar candidatos y ordenar descendente para poda rápida
  const sorted = [...items]
    .filter((it) => it.cents > 0 && it.cents <= targetCents)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 26);

  if (sorted.length < minItems) return null;

  // Sufijos acumulados para podar si la suma restante no alcanza el objetivo
  const suffixSum = new Array<number>(sorted.length + 1).fill(0);
  for (let i = sorted.length - 1; i >= 0; i--) {
    suffixSum[i] = suffixSum[i + 1] + sorted[i].cents;
  }

  const chosen: string[] = [];

  function dfs(idx: number, remaining: number): boolean {
    if (remaining === 0 && chosen.length >= minItems) {
      return true;
    }
    if (
      idx >= sorted.length ||
      chosen.length >= maxItems ||
      remaining < 0 ||
      suffixSum[idx] < remaining
    ) {
      return false;
    }

    // Rama 1: incluir sorted[idx]
    if (sorted[idx].cents <= remaining) {
      chosen.push(sorted[idx].id);
      if (dfs(idx + 1, remaining - sorted[idx].cents)) return true;
      chosen.pop();
    }

    // Rama 2: omitir sorted[idx]
    return dfs(idx + 1, remaining);
  }

  return dfs(0, targetCents) ? [...chosen] : null;
}

/**
 * Ejecuta el motor de conciliación avanzada en 4 niveles en cascada sobre
 * los CFDIs y movimientos bancarios pendientes de un cliente en un periodo mes/año.
 */
export async function runClientReconciliation(
  input: CascadeReconcileInput
): Promise<CascadeReconcileOutput> {
  const dateWindowDays = input.dateWindowDays ?? 5;
  const amountTolerance = input.amountTolerance ?? 1.0;

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, organizationId: input.organizationId },
  });

  if (!client) {
    throw new Error("Cliente no encontrado en la organización activa.");
  }

  const periodStart = new Date(
    Date.UTC(input.year, input.month - 1, 1, 0, 0, 0, 0)
  );
  const periodEnd = new Date(
    Date.UTC(input.year, input.month, 0, 23, 59, 59, 999)
  );

  const [dbCfdis, dbTransactions, existingReconciliations] = await Promise.all([
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
        ...(input.bankAccountId ? { bankAccountId: input.bankAccountId } : {}),
        fecha: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { fecha: "asc" },
    }),
    prisma.reconciliation.findMany({
      where: { clientId: client.id },
      select: {
        cfdiId: true,
        bankTransactionId: true,
        montoAplicado: true,
      },
    }),
  ]);

  // Suma ya aplicada por movimiento bancario en conciliaciones existentes
  const appliedByTx = new Map<string, number>();
  const existingPairKeys = new Set<string>();
  for (const r of existingReconciliations) {
    existingPairKeys.add(`${r.cfdiId}:${r.bankTransactionId}`);
    appliedByTx.set(
      r.bankTransactionId,
      roundCents((appliedByTx.get(r.bankTransactionId) ?? 0) + Number(r.montoAplicado))
    );
  }

  const cfdiMap = new Map<string, CfdiState>();
  for (const c of dbCfdis) {
    cfdiMap.set(c.id, {
      id: c.id,
      uuid: c.uuid,
      tipoComprobante: c.tipoComprobante,
      metodoPago: c.metodoPago,
      fechaEmision: c.fechaEmision,
      rfcEmisor: c.rfcEmisor,
      nombreEmisor: c.nombreEmisor,
      rfcReceptor: c.rfcReceptor,
      nombreReceptor: c.nombreReceptor,
      total: Number(c.total),
      moneda: c.moneda,
      tipoCambio: Number(c.tipoCambio),
      remainingSaldo: Number(c.saldoPendiente),
      direccion: c.direccion,
      status: c.status,
      relatedUuidsJson: c.relatedUuidsJson,
      dirty: false,
    });
  }

  const txMap = new Map<string, BankTxState>();
  for (const t of dbTransactions) {
    const monto = Number(t.monto);
    const alreadyApplied = appliedByTx.get(t.id) ?? 0;
    const remaining = Math.max(0, roundCents(monto - alreadyApplied));
    txMap.set(t.id, {
      id: t.id,
      fecha: t.fecha,
      concepto: t.concepto,
      monto,
      tipo: t.tipo,
      remainingAmount: remaining,
      appliedAmount: alreadyApplied,
      status: t.status,
      dirty: false,
    });
  }

  const pendingInserts: PendingMatchInsert[] = [];

  function registerMatch(params: {
    cfdi: CfdiState;
    tx: BankTxState;
    montoAplicado: number;
    matchType: MatchType;
    confidenceScore: number;
    status: ReconciliationStatus;
    level: 1 | 2 | 3 | 4;
    reduceCfdiSaldo?: number;
    forceTxConciliado?: boolean;
  }): boolean {
    const pairKey = `${params.cfdi.id}:${params.tx.id}`;
    if (existingPairKeys.has(pairKey)) return false;

    const applied = roundCents(params.montoAplicado);
    const cfdiReduction = roundCents(params.reduceCfdiSaldo ?? applied);
    if (applied <= 0) return false;

    existingPairKeys.add(pairKey);
    pendingInserts.push({
      cfdiId: params.cfdi.id,
      cfdiUuid: params.cfdi.uuid,
      bankTransactionId: params.tx.id,
      montoAplicado: applied,
      matchType: params.matchType,
      confidenceScore: params.confidenceScore,
      status: params.status,
      level: params.level,
    });

    params.cfdi.remainingSaldo = Math.max(
      0,
      roundCents(params.cfdi.remainingSaldo - cfdiReduction)
    );
    params.cfdi.status =
      params.cfdi.remainingSaldo <= 0.01 ? "CONCILIADO" : "PARCIAL";
    params.cfdi.dirty = true;

    params.tx.appliedAmount = roundCents(params.tx.appliedAmount + applied);
    params.tx.remainingAmount = params.forceTxConciliado
      ? 0
      : Math.max(0, roundCents(params.tx.monto - params.tx.appliedAmount));
    params.tx.status =
      params.forceTxConciliado || params.tx.remainingAmount <= 0.01
        ? "CONCILIADO"
        : "PARCIAL";
    params.tx.dirty = true;

    return true;
  }

  // --------------------------------------------------------------------------
  // NIVEL 1: Cruce 1 a 1 PUE (EXACT_PUE)
  // --------------------------------------------------------------------------
  const pueCandidates: Array<{
    cfdi: CfdiState;
    tx: BankTxState;
    confidence: number;
    daysDiff: number;
  }> = [];

  for (const cfdi of cfdiMap.values()) {
    if (
      cfdi.status === "CONCILIADO" ||
      cfdi.remainingSaldo <= 0.01 ||
      cfdi.metodoPago !== "PUE" ||
      cfdi.moneda !== "MXN" ||
      (cfdi.tipoComprobante !== "I" && cfdi.tipoComprobante !== "E")
    ) {
      continue;
    }

    const reqTipo = expectedBankTipo(cfdi.direccion, cfdi.tipoComprobante);
    const counterpartyRfc =
      cfdi.direccion === "EMITIDO" ? cfdi.rfcReceptor : cfdi.rfcEmisor;
    const counterpartyName =
      cfdi.direccion === "EMITIDO" ? cfdi.nombreReceptor : cfdi.nombreEmisor;

    for (const tx of txMap.values()) {
      if (tx.status === "CONCILIADO" || tx.remainingAmount <= 0.01) continue;
      if (tx.tipo !== reqTipo) continue;
      if (existingPairKeys.has(`${cfdi.id}:${tx.id}`)) continue;

      if (toCents(cfdi.remainingSaldo) !== toCents(tx.remainingAmount)) {
        continue;
      }

      const daysDiff = diffDaysDate(cfdi.fechaEmision, tx.fecha);
      if (daysDiff > dateWindowDays) continue;

      const datePts = daysDiff === 0 ? 25 : daysDiff <= 2 ? 20 : 15;
      const conceptPts = scoreConceptMatch(
        counterpartyRfc,
        counterpartyName,
        tx.concepto
      );
      const confidence = Math.min(100, 55 + datePts + conceptPts);

      pueCandidates.push({ cfdi, tx, confidence, daysDiff });
    }
  }

  pueCandidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.daysDiff - b.daysDiff;
  });

  let level1AutoCount = 0;
  let level1SuggestedCount = 0;

  for (const cand of pueCandidates) {
    if (
      cand.cfdi.remainingSaldo <= 0.01 ||
      cand.tx.remainingAmount <= 0.01
    ) {
      continue;
    }
    const status: ReconciliationStatus =
      cand.confidence >= 85 ? "AUTO" : "SUGERIDO";
    const ok = registerMatch({
      cfdi: cand.cfdi,
      tx: cand.tx,
      montoAplicado: cand.tx.remainingAmount,
      matchType: "EXACT_PUE",
      confidenceScore: cand.confidence,
      status,
      level: 1,
    });
    if (ok) {
      if (status === "AUTO") level1AutoCount++;
      else level1SuggestedCount++;
    }
  }

  // --------------------------------------------------------------------------
  // NIVEL 2: PPD y Complementos de Pago (REP_PPD)
  // --------------------------------------------------------------------------
  const repCfdis = Array.from(cfdiMap.values()).filter(
    (c) => c.tipoComprobante === "P" && c.status !== "CONCILIADO"
  );

  // Recolectar todos los UUIDs de documentos relacionados (pueden ser de meses previos)
  const referencedPpdUuids = new Set<string>();
  for (const rep of repCfdis) {
    const json = rep.relatedUuidsJson as { pagos?: RepPagoJson[] } | null;
    for (const pago of json?.pagos ?? []) {
      for (const doc of pago.doctosRelacionados ?? []) {
        if (doc.idDocumento) {
          referencedPpdUuids.add(doc.idDocumento.toUpperCase());
        }
      }
    }
  }

  if (referencedPpdUuids.size > 0) {
    const missingUuids = Array.from(referencedPpdUuids).filter(
      (uuid) => !Array.from(cfdiMap.values()).some((c) => c.uuid === uuid)
    );
    if (missingUuids.length > 0) {
      const extraPpds = await prisma.cfdi.findMany({
        where: { clientId: client.id, uuid: { in: missingUuids } },
      });
      for (const c of extraPpds) {
        cfdiMap.set(c.id, {
          id: c.id,
          uuid: c.uuid,
          tipoComprobante: c.tipoComprobante,
          metodoPago: c.metodoPago,
          fechaEmision: c.fechaEmision,
          rfcEmisor: c.rfcEmisor,
          nombreEmisor: c.nombreEmisor,
          rfcReceptor: c.rfcReceptor,
          nombreReceptor: c.nombreReceptor,
          total: Number(c.total),
          moneda: c.moneda,
          tipoCambio: Number(c.tipoCambio),
          remainingSaldo: Number(c.saldoPendiente),
          direccion: c.direccion,
          status: c.status,
          relatedUuidsJson: c.relatedUuidsJson,
          dirty: false,
        });
      }
    }
  }

  const cfdiByUuid = new Map<string, CfdiState>();
  for (const c of cfdiMap.values()) {
    cfdiByUuid.set(c.uuid.toUpperCase(), c);
  }

  let level2RepPpdCount = 0;

  for (const rep of repCfdis) {
    const json = rep.relatedUuidsJson as { pagos?: RepPagoJson[] } | null;
    const pagos = json?.pagos ?? [];
    if (pagos.length === 0) continue;

    const reqTipo = rep.direccion === "EMITIDO" ? "ABONO" : "CARGO";
    let allPagosMatched = true;

    for (const pago of pagos) {
      const pagoMonto = roundCents(Number(pago.monto ?? 0));
      if (pagoMonto <= 0) continue;

      const fechaPago = pago.fechaPago
        ? new Date(pago.fechaPago)
        : rep.fechaEmision;
      const validFechaPago = Number.isNaN(fechaPago.getTime())
        ? rep.fechaEmision
        : fechaPago;

      // Buscar movimiento bancario que coincida con Monto y FechaPago del REP
      const matchingTx = Array.from(txMap.values())
        .filter(
          (tx) =>
            tx.status !== "CONCILIADO" &&
            tx.remainingAmount > 0.01 &&
            tx.tipo === reqTipo &&
            Math.abs(tx.remainingAmount - pagoMonto) <= amountTolerance &&
            diffDaysDate(validFechaPago, tx.fecha) <= dateWindowDays
        )
        .sort(
          (a, b) =>
            Math.abs(a.remainingAmount - pagoMonto) -
              Math.abs(b.remainingAmount - pagoMonto) ||
            diffDaysDate(validFechaPago, a.fecha) -
              diffDaysDate(validFechaPago, b.fecha)
        )[0];

      if (!matchingTx) {
        allPagosMatched = false;
        continue;
      }

      let linkedAnyDoc = false;
      for (const doc of pago.doctosRelacionados ?? []) {
        const targetUuid = doc.idDocumento?.toUpperCase();
        if (!targetUuid) continue;
        const origCfdi = cfdiByUuid.get(targetUuid);
        if (!origCfdi || origCfdi.status === "CONCILIADO") continue;

        const impPagado = roundCents(Number(doc.impPagado ?? 0));
        const applied = Math.min(
          impPagado > 0 ? impPagado : matchingTx.remainingAmount,
          origCfdi.remainingSaldo,
          matchingTx.remainingAmount
        );
        if (applied <= 0) continue;

        const ok = registerMatch({
          cfdi: origCfdi,
          tx: matchingTx,
          montoAplicado: applied,
          matchType: "REP_PPD",
          confidenceScore: 95,
          status: "AUTO",
          level: 2,
        });
        if (ok) {
          level2RepPpdCount++;
          linkedAnyDoc = true;
        }
      }

      if (!linkedAnyDoc) {
        allPagosMatched = false;
      }
    }

    if (allPagosMatched) {
      rep.remainingSaldo = 0;
      rep.status = "CONCILIADO";
      rep.dirty = true;
    }
  }

  // --------------------------------------------------------------------------
  // NIVEL 3: Pagos Agrupados 1-a-N y N-a-1 (SUBSET_SUM, máx 6 por grupo)
  // --------------------------------------------------------------------------
  let level3SubsetSumCount = 0;

  // 3A: 1 movimiento bancario -> N CFDIs pendientes del mismo tercero (RFC)
  for (const tx of txMap.values()) {
    if (tx.status === "CONCILIADO" || tx.remainingAmount <= 0.01) continue;

    // Agrupar CFDIs pendientes por RFC tercero
    const groups = new Map<string, CfdiState[]>();
    for (const cfdi of cfdiMap.values()) {
      if (
        cfdi.status === "CONCILIADO" ||
        cfdi.remainingSaldo <= 0.01 ||
        cfdi.moneda !== "MXN" ||
        cfdi.tipoComprobante === "P" ||
        cfdi.tipoComprobante === "N"
      ) {
        continue;
      }
      if (expectedBankTipo(cfdi.direccion, cfdi.tipoComprobante) !== tx.tipo) {
        continue;
      }
      if (existingPairKeys.has(`${cfdi.id}:${tx.id}`)) continue;

      const thirdRfc =
        cfdi.direccion === "EMITIDO" ? cfdi.rfcReceptor : cfdi.rfcEmisor;
      const list = groups.get(thirdRfc) ?? [];
      list.push(cfdi);
      groups.set(thirdRfc, list);
    }

    for (const [thirdRfc, groupCfdis] of groups.entries()) {
      if (groupCfdis.length < 2) continue;
      const targetCents = toCents(tx.remainingAmount);
      const subsetIds = findExactSubsetCents(
        groupCfdis.map((c) => ({
          id: c.id,
          cents: toCents(c.remainingSaldo),
        })),
        targetCents,
        2,
        6
      );

      if (!subsetIds) continue;

      const sampleCfdi = groupCfdis[0];
      const thirdName =
        sampleCfdi.direccion === "EMITIDO"
          ? sampleCfdi.nombreReceptor
          : sampleCfdi.nombreEmisor;
      const conceptBonus = scoreConceptMatch(thirdRfc, thirdName, tx.concepto);
      const confidence = Math.min(84, 72 + Math.round(conceptBonus / 2));

      for (const id of subsetIds) {
        const cfdi = cfdiMap.get(id);
        if (!cfdi || tx.remainingAmount <= 0.01) continue;
        const applied = Math.min(cfdi.remainingSaldo, tx.remainingAmount);
        const ok = registerMatch({
          cfdi,
          tx,
          montoAplicado: applied,
          matchType: "SUBSET_SUM",
          confidenceScore: confidence,
          status: "SUGERIDO",
          level: 3,
        });
        if (ok) level3SubsetSumCount++;
      }
      break;
    }
  }

  // 3B: N movimientos bancarios -> 1 CFDI pendiente
  for (const cfdi of cfdiMap.values()) {
    if (
      cfdi.status === "CONCILIADO" ||
      cfdi.remainingSaldo <= 0.01 ||
      cfdi.moneda !== "MXN" ||
      cfdi.tipoComprobante === "P" ||
      cfdi.tipoComprobante === "N"
    ) {
      continue;
    }

    const reqTipo = expectedBankTipo(cfdi.direccion, cfdi.tipoComprobante);
    const candidateTxs = Array.from(txMap.values()).filter(
      (tx) =>
        tx.status !== "CONCILIADO" &&
        tx.remainingAmount > 0.01 &&
        tx.tipo === reqTipo &&
        !existingPairKeys.has(`${cfdi.id}:${tx.id}`) &&
        diffDaysDate(cfdi.fechaEmision, tx.fecha) <= 35
    );

    if (candidateTxs.length < 2) continue;

    const subsetTxIds = findExactSubsetCents(
      candidateTxs.map((t) => ({ id: t.id, cents: toCents(t.remainingAmount) })),
      toCents(cfdi.remainingSaldo),
      2,
      6
    );

    if (!subsetTxIds) continue;

    for (const txId of subsetTxIds) {
      const tx = txMap.get(txId);
      if (!tx || cfdi.remainingSaldo <= 0.01) continue;
      const applied = Math.min(cfdi.remainingSaldo, tx.remainingAmount);
      const ok = registerMatch({
        cfdi,
        tx,
        montoAplicado: applied,
        matchType: "SUBSET_SUM",
        confidenceScore: 76,
        status: "SUGERIDO",
        level: 3,
      });
      if (ok) level3SubsetSumCount++;
    }
  }

  // --------------------------------------------------------------------------
  // NIVEL 4: Tolerancias (centavos/comisiones) y Divisas (USD ±3% tipoCambio)
  // --------------------------------------------------------------------------
  const level4Candidates: Array<{
    cfdi: CfdiState;
    tx: BankTxState;
    confidence: number;
    montoAplicado: number;
    reduceCfdiSaldo: number;
    scoreDelta: number;
  }> = [];

  for (const cfdi of cfdiMap.values()) {
    if (
      cfdi.status === "CONCILIADO" ||
      cfdi.remainingSaldo <= 0.01 ||
      cfdi.tipoComprobante === "P" ||
      cfdi.tipoComprobante === "N"
    ) {
      continue;
    }

    const reqTipo = expectedBankTipo(cfdi.direccion, cfdi.tipoComprobante);
    const counterpartyRfc =
      cfdi.direccion === "EMITIDO" ? cfdi.rfcReceptor : cfdi.rfcEmisor;
    const counterpartyName =
      cfdi.direccion === "EMITIDO" ? cfdi.nombreReceptor : cfdi.nombreEmisor;

    for (const tx of txMap.values()) {
      if (tx.status === "CONCILIADO" || tx.remainingAmount <= 0.01) continue;
      if (tx.tipo !== reqTipo) continue;
      if (existingPairKeys.has(`${cfdi.id}:${tx.id}`)) continue;

      const daysDiff = diffDaysDate(cfdi.fechaEmision, tx.fecha);
      if (daysDiff > dateWindowDays) continue;

      if (cfdi.moneda === "MXN") {
        const diff = Math.abs(cfdi.remainingSaldo - tx.remainingAmount);
        if (diff <= amountTolerance) {
          const conceptBonus = scoreConceptMatch(
            counterpartyRfc,
            counterpartyName,
            tx.concepto
          );
          const confidence = Math.min(84, 65 + Math.round(conceptBonus / 2));
          level4Candidates.push({
            cfdi,
            tx,
            confidence,
            montoAplicado: Math.min(cfdi.remainingSaldo, tx.remainingAmount),
            reduceCfdiSaldo: cfdi.remainingSaldo,
            scoreDelta: diff,
          });
        }
      } else {
        // Divisas extranjeras (ej. USD): comparar con tipoCambio ±3%
        const expectedMxn = roundCents(cfdi.remainingSaldo * cfdi.tipoCambio);
        if (expectedMxn <= 0) continue;
        const pctDiff = Math.abs(tx.remainingAmount - expectedMxn) / expectedMxn;
        if (pctDiff <= 0.03) {
          const conceptBonus = scoreConceptMatch(
            counterpartyRfc,
            counterpartyName,
            tx.concepto
          );
          const confidence = Math.min(84, 68 + Math.round(conceptBonus / 2));
          level4Candidates.push({
            cfdi,
            tx,
            confidence,
            montoAplicado: tx.remainingAmount,
            reduceCfdiSaldo: cfdi.remainingSaldo,
            scoreDelta: pctDiff,
          });
        }
      }
    }
  }

  level4Candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.scoreDelta - b.scoreDelta;
  });

  let level4ToleranceCount = 0;

  for (const cand of level4Candidates) {
    if (
      cand.cfdi.remainingSaldo <= 0.01 ||
      cand.tx.remainingAmount <= 0.01
    ) {
      continue;
    }
    const ok = registerMatch({
      cfdi: cand.cfdi,
      tx: cand.tx,
      montoAplicado: cand.montoAplicado,
      reduceCfdiSaldo: cand.reduceCfdiSaldo,
      forceTxConciliado: true,
      matchType: "TOLERANCE",
      confidenceScore: cand.confidence,
      status: "SUGERIDO",
      level: 4,
    });
    if (ok) level4ToleranceCount++;
  }

  // --------------------------------------------------------------------------
  // PERSISTENCIA ATÓMICA EN BASE DE DATOS
  // --------------------------------------------------------------------------
  const createdMatches: CreatedReconciliationSummary[] = [];

  await prisma.$transaction(async (txDb) => {
    for (const item of pendingInserts) {
      const created = await txDb.reconciliation.create({
        data: {
          clientId: client.id,
          cfdiId: item.cfdiId,
          bankTransactionId: item.bankTransactionId,
          montoAplicado: item.montoAplicado,
          matchType: item.matchType,
          confidenceScore: item.confidenceScore,
          status: item.status,
        },
      });
      createdMatches.push({
        id: created.id,
        cfdiId: item.cfdiId,
        cfdiUuid: item.cfdiUuid,
        bankTransactionId: item.bankTransactionId,
        montoAplicado: item.montoAplicado,
        matchType: item.matchType,
        confidenceScore: item.confidenceScore,
        status: item.status,
        level: item.level,
      });
    }

    for (const cfdi of cfdiMap.values()) {
      if (!cfdi.dirty) continue;
      await txDb.cfdi.update({
        where: { id: cfdi.id },
        data: {
          saldoPendiente: cfdi.remainingSaldo,
          status: cfdi.status,
        },
      });
    }

    for (const bankTx of txMap.values()) {
      if (!bankTx.dirty) continue;
      await txDb.bankTransaction.update({
        where: { id: bankTx.id },
        data: {
          status: bankTx.status,
        },
      });
    }
  });

  // Métricas finales del periodo
  const periodCfdis = Array.from(cfdiMap.values()).filter(
    (c) =>
      c.fechaEmision >= periodStart &&
      c.fechaEmision <= periodEnd
  );
  const periodTxs = Array.from(txMap.values());

  return {
    period: { month: input.month, year: input.year },
    rules: { dateWindowDays, amountTolerance },
    metrics: {
      level1ExactPueCount: level1AutoCount + level1SuggestedCount,
      level1AutoCount,
      level1SuggestedCount,
      level2RepPpdCount,
      level3SubsetSumCount,
      level4ToleranceCount,
      totalMatchesCreated: createdMatches.length,
      cfdisConciliados: periodCfdis.filter((c) => c.status === "CONCILIADO")
        .length,
      cfdisParciales: periodCfdis.filter((c) => c.status === "PARCIAL").length,
      cfdisPendientes: periodCfdis.filter((c) => c.status === "PENDIENTE")
        .length,
      bankConciliados: periodTxs.filter((t) => t.status === "CONCILIADO")
        .length,
      bankParciales: periodTxs.filter((t) => t.status === "PARCIAL").length,
      bankSinFactura: periodTxs.filter((t) => t.status === "SIN_FACTURA")
        .length,
    },
    matches: createdMatches,
  };
}
