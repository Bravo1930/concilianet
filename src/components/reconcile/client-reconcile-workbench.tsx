"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Landmark,
  Link2,
  Play,
  Receipt,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "cn";

type TrafficTab = "yellow" | "green" | "red-sat" | "red-bank";

interface BankAccountOption {
  id: string;
  bankName: string;
  last4Digits: string;
  currency: string;
}

interface CfdiRow {
  id: string;
  uuid: string;
  tipoComprobante: string;
  metodoPago: string | null;
  fechaEmision: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  total: number;
  moneda: string;
  tipoCambio: number;
  saldoPendiente: number;
  direccion: "EMITIDO" | "RECIBIDO";
  status: string;
}

interface BankTxRow {
  id: string;
  bankAccountId?: string;
  bankName: string;
  last4Digits: string;
  fecha: string;
  concepto: string;
  monto: number;
  tipo: "ABONO" | "CARGO";
  status: string;
}

interface ReconciliationRow {
  id: string;
  cfdiId: string;
  bankTransactionId: string;
  montoAplicado: number;
  matchType: string;
  confidenceScore: number;
  status: "AUTO" | "SUGERIDO" | "APROBADO";
  reason: string;
  cfdi: CfdiRow;
  bankTransaction: BankTxRow;
}

interface DashboardPayload {
  client: {
    id: string;
    rfc: string;
    razonSocial: string;
    regimenFiscal: string;
    bankAccounts: BankAccountOption[];
  };
  period: { month: number; year: number };
  kpis: {
    green: {
      count: number;
      reconciliationCount: number;
      totalAmount: number;
      percentage: number;
    };
    yellow: {
      count: number;
      suggestedCount: number;
      partialPpdCount: number;
      totalAmount: number;
    };
    redPendingSat: {
      count: number;
      totalAmount: number;
    };
    redUnbilledBank: {
      count: number;
      totalAmount: number;
    };
  };
  greenReconciliations: ReconciliationRow[];
  yellowReconciliations: ReconciliationRow[];
  partialPpdCfdis: CfdiRow[];
  pendingCfdis: CfdiRow[];
  unbilledTransactions: BankTxRow[];
}

interface YellowGroup {
  key: string;
  reconciliationIds: string[];
  rows: ReconciliationRow[];
  bankTransaction: BankTxRow;
  cfdis: CfdiRow[];
  totalApplied: number;
  confidenceScore: number;
  matchType: string;
  motivoDisplay: string;
}

const MONTHS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

function formatMxn(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount);
}

function groupYellowSuggestions(rows: ReconciliationRow[]): YellowGroup[] {
  const byTx = new Map<string, ReconciliationRow[]>();
  for (const r of rows) {
    if (r.matchType === "SUBSET_SUM") {
      const k = `tx_${r.bankTransactionId}`;
      const list = byTx.get(k) ?? [];
      list.push(r);
      byTx.set(k, list);
    } else {
      byTx.set(`row_${r.id}`, [r]);
    }
  }

  const groups: YellowGroup[] = [];
  for (const [key, list] of byTx.entries()) {
    const first = list[0];
    const totalApplied = Number(
      list.reduce((acc, item) => acc + item.montoAplicado, 0).toFixed(2)
    );
    const motivoDisplay =
      list.length > 1
        ? `Suma de ${list.length} facturas (${formatMxn(totalApplied)})`
        : first.reason;

    groups.push({
      key,
      reconciliationIds: list.map((i) => i.id),
      rows: list,
      bankTransaction: first.bankTransaction,
      cfdis: list.map((i) => i.cfdi),
      totalApplied,
      confidenceScore: first.confidenceScore,
      matchType: first.matchType,
      motivoDisplay,
    });
  }
  return groups;
}

export function ClientReconcileWorkbench({ clientId }: { clientId: string }) {
  const [month, setMonth] = useState(11);
  const [year, setYear] = useState(2026);
  const [bankAccountId, setBankAccountId] = useState("");
  const [activeTab, setActiveTab] = useState<TrafficTab>("yellow");

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningEngine, setRunningEngine] = useState(false);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Manual reconciliation modal state
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedCfdiIds, setSelectedCfdiIds] = useState<string[]>([]);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [manualSearchCfdi, setManualSearchCfdi] = useState("");
  const [manualSearchTx, setManualSearchTx] = useState("");
  const [manualMontoAplicado, setManualMontoAplicado] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  const fetchDashboard = useCallback(
    async (m: number, y: number, bId: string) => {
      const params = new URLSearchParams({
        month: String(m),
        year: String(y),
      });
      if (bId) params.set("bankAccountId", bId);

      const res = await fetch(
        `/api/clients/${clientId}/reconcile?${params.toString()}`
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "No se pudo cargar la conciliación");
      }
      setData(json);
      return json as DashboardPayload;
    },
    [clientId]
  );

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      month: String(month),
      year: String(year),
    });
    if (bankAccountId) params.set("bankAccountId", bankAccountId);

    fetch(`/api/clients/${clientId}/reconcile?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Error al consultar conciliación");
        }
        if (active) setData(json);
      })
      .catch((err) => {
        if (active) {
          setBannerMsg({
            type: "error",
            text:
              err instanceof Error
                ? err.message
                : "Error al cargar tablero de conciliación",
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [clientId, month, year, bankAccountId]);

  async function handleRunEngine() {
    setRunningEngine(true);
    setBannerMsg(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          year,
          bankAccountId: bankAccountId || undefined,
          dateWindowDays: 5,
          amountTolerance: 1.0,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Error al ejecutar el motor");
      }

      await fetchDashboard(month, year, bankAccountId);
      const m = json.metrics;
      setBannerMsg({
        type: "success",
        text: `Conciliación ejecutada: ${m.totalMatchesCreated} cruces nuevos (Nivel 1 PUE: ${m.level1ExactPueCount} · Nivel 2 REP: ${m.level2RepPpdCount} · Nivel 3 Agrupados: ${m.level3SubsetSumCount} · Nivel 4 Tolerancia/USD: ${m.level4ToleranceCount}).`,
      });
      if (m.level3SubsetSumCount + m.level4ToleranceCount + m.level1SuggestedCount > 0) {
        setActiveTab("yellow");
      } else if (m.totalMatchesCreated > 0) {
        setActiveTab("green");
      }
    } catch (err) {
      setBannerMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Error al conciliar",
      });
    } finally {
      setRunningEngine(false);
    }
  }

  async function handleResolve(
    reconciliationIds: string[],
    action: "APPROVE" | "REJECT",
    key: string
  ) {
    setResolvingKey(key);
    setBannerMsg(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/reconcile/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconciliationIds, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al resolver match");

      await fetchDashboard(month, year, bankAccountId);
      setBannerMsg({
        type: "success",
        text:
          action === "APPROVE"
            ? "Conciliación aprobada y movida a Verde."
            : "Sugerencia rechazada; los registros regresaron a Pendientes (Rojo).",
      });
    } catch (err) {
      setBannerMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Error al actualizar",
      });
    } finally {
      setResolvingKey(null);
    }
  }

  function openManualModal(prefillCfdiIds?: string[], prefillTxIds?: string[]) {
    const cIds = prefillCfdiIds ?? selectedCfdiIds;
    const tIds = prefillTxIds ?? selectedTxIds;
    setSelectedCfdiIds(cIds);
    setSelectedTxIds(tIds);

    if (data) {
      const sumCfdi = data.pendingCfdis
        .filter((c) => cIds.includes(c.id))
        .reduce((acc, c) => acc + c.saldoPendiente, 0);
      const sumTx = data.unbilledTransactions
        .filter((t) => tIds.includes(t.id))
        .reduce((acc, t) => acc + t.monto, 0);
      const suggested =
        sumCfdi > 0 && sumTx > 0
          ? Math.min(sumCfdi, sumTx)
          : Math.max(sumCfdi, sumTx);
      setManualMontoAplicado(suggested > 0 ? suggested.toFixed(2) : "");
    }
    setManualOpen(true);
  }

  function toggleCfdiSelection(id: string) {
    const next = selectedCfdiIds.includes(id)
      ? selectedCfdiIds.filter((x) => x !== id)
      : [...selectedCfdiIds, id];
    setSelectedCfdiIds(next);
    if (data) {
      const sumCfdi = data.pendingCfdis
        .filter((c) => next.includes(c.id))
        .reduce((acc, c) => acc + c.saldoPendiente, 0);
      const sumTx = data.unbilledTransactions
        .filter((t) => selectedTxIds.includes(t.id))
        .reduce((acc, t) => acc + t.monto, 0);
      const suggested =
        sumCfdi > 0 && sumTx > 0
          ? Math.min(sumCfdi, sumTx)
          : Math.max(sumCfdi, sumTx);
      setManualMontoAplicado(suggested > 0 ? suggested.toFixed(2) : "");
    }
  }

  function toggleTxSelection(id: string) {
    const next = selectedTxIds.includes(id)
      ? selectedTxIds.filter((x) => x !== id)
      : [...selectedTxIds, id];
    setSelectedTxIds(next);
    if (data) {
      const sumCfdi = data.pendingCfdis
        .filter((c) => selectedCfdiIds.includes(c.id))
        .reduce((acc, c) => acc + c.saldoPendiente, 0);
      const sumTx = data.unbilledTransactions
        .filter((t) => next.includes(t.id))
        .reduce((acc, t) => acc + t.monto, 0);
      const suggested =
        sumCfdi > 0 && sumTx > 0
          ? Math.min(sumCfdi, sumTx)
          : Math.max(sumCfdi, sumTx);
      setManualMontoAplicado(suggested > 0 ? suggested.toFixed(2) : "");
    }
  }

  async function handleSubmitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!data || selectedCfdiIds.length === 0 || selectedTxIds.length === 0) {
      return;
    }

    const totalAplicar = Number.parseFloat(manualMontoAplicado);
    if (!Number.isFinite(totalAplicar) || totalAplicar <= 0) {
      setBannerMsg({
        type: "error",
        text: "Ingresa un monto aplicado mayor a $0.00.",
      });
      return;
    }

    setSavingManual(true);
    setBannerMsg(null);

    try {
      const links: Array<{
        cfdiId: string;
        bankTransactionId: string;
        montoAplicado: number;
      }> = [];

      if (selectedCfdiIds.length === 1 && selectedTxIds.length === 1) {
        links.push({
          cfdiId: selectedCfdiIds[0],
          bankTransactionId: selectedTxIds[0],
          montoAplicado: totalAplicar,
        });
      } else if (selectedTxIds.length === 1) {
        // 1 movimiento -> N CFDIs
        let remaining = totalAplicar;
        const chosenCfdis = data.pendingCfdis.filter((c) =>
          selectedCfdiIds.includes(c.id)
        );
        chosenCfdis.forEach((c, idx) => {
          const isLast = idx === chosenCfdis.length - 1;
          const portion = isLast
            ? Math.max(0.01, Number(remaining.toFixed(2)))
            : Math.min(c.saldoPendiente, remaining);
          remaining = Number((remaining - portion).toFixed(2));
          if (portion > 0) {
            links.push({
              cfdiId: c.id,
              bankTransactionId: selectedTxIds[0],
              montoAplicado: Number(portion.toFixed(2)),
            });
          }
        });
      } else if (selectedCfdiIds.length === 1) {
        // N movimientos -> 1 CFDI
        let remaining = totalAplicar;
        const chosenTxs = data.unbilledTransactions.filter((t) =>
          selectedTxIds.includes(t.id)
        );
        chosenTxs.forEach((t, idx) => {
          const isLast = idx === chosenTxs.length - 1;
          const portion = isLast
            ? Math.max(0.01, Number(remaining.toFixed(2)))
            : Math.min(t.monto, remaining);
          remaining = Number((remaining - portion).toFixed(2));
          if (portion > 0) {
            links.push({
              cfdiId: selectedCfdiIds[0],
              bankTransactionId: t.id,
              montoAplicado: Number(portion.toFixed(2)),
            });
          }
        });
      } else {
        // M-a-N: distribuir proporcionalmente en pares secuenciales
        let remaining = totalAplicar;
        const chosenCfdis = data.pendingCfdis.filter((c) =>
          selectedCfdiIds.includes(c.id)
        );
        const chosenTxs = data.unbilledTransactions.filter((t) =>
          selectedTxIds.includes(t.id)
        );
        let ci = 0;
        let ti = 0;
        let cRem = chosenCfdis[0]?.saldoPendiente ?? 0;
        let tRem = chosenTxs[0]?.monto ?? 0;

        while (ci < chosenCfdis.length && ti < chosenTxs.length && remaining > 0.005) {
          const applied = Number(
            Math.min(cRem, tRem, remaining).toFixed(2)
          );
          if (applied <= 0) break;
          links.push({
            cfdiId: chosenCfdis[ci].id,
            bankTransactionId: chosenTxs[ti].id,
            montoAplicado: applied,
          });
          remaining = Number((remaining - applied).toFixed(2));
          cRem = Number((cRem - applied).toFixed(2));
          tRem = Number((tRem - applied).toFixed(2));
          if (cRem <= 0.01) {
            ci++;
            cRem = chosenCfdis[ci]?.saldoPendiente ?? 0;
          }
          if (tRem <= 0.01) {
            ti++;
            tRem = chosenTxs[ti]?.monto ?? 0;
          }
        }
      }

      const res = await fetch(`/api/clients/${clientId}/reconcile/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Error al vincular manualmente");
      }

      setManualOpen(false);
      setSelectedCfdiIds([]);
      setSelectedTxIds([]);
      await fetchDashboard(month, year, bankAccountId);
      setActiveTab("green");
      setBannerMsg({
        type: "success",
        text: `Conciliación manual registrada (${json.createdLinks} vínculo(s) aprobados).`,
      });
    } catch (err) {
      setBannerMsg({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Error en conciliación manual",
      });
    } finally {
      setSavingManual(false);
    }
  }

  async function handleExport(format: "xlsx" | "csv") {
    const params = new URLSearchParams({
      month: String(month),
      year: String(year),
      format,
    });
    if (bankAccountId) params.set("bankAccountId", bankAccountId);
    const url = `/api/clients/${clientId}/export?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      setBannerMsg({
        type: "error",
        text: `No se pudo exportar el archivo ${format.toUpperCase()}.`,
      });
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `ConciliaSAT_${data?.client.rfc ?? clientId}_${year}_${String(month).padStart(2, "0")}.${format}`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  }

  if (loading && !data) {
    return (
      <div className="py-14 text-center text-sm text-muted-foreground">
        Cargando tablero de conciliación...
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-destructive">
            {bannerMsg?.text || "No se pudo cargar el cliente."}
          </p>
          <Link
            href="/dashboard/clients"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Volver a Clientes
          </Link>
        </CardContent>
      </Card>
    );
  }

  const yellowGroups = groupYellowSuggestions(data.yellowReconciliations);

  const selectedCfdiSum = data.pendingCfdis
    .filter((c) => selectedCfdiIds.includes(c.id))
    .reduce((acc, c) => acc + c.saldoPendiente, 0);
  const selectedTxSum = data.unbilledTransactions
    .filter((t) => selectedTxIds.includes(t.id))
    .reduce((acc, t) => acc + t.monto, 0);

  return (
    <div className="space-y-6">
      {/* 1. Barra Superior */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/clients"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                Clientes
              </Link>
              <span className="text-muted-foreground">/</span>
              <Link
                href={`/dashboard/clients/${clientId}/upload`}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
              >
                <Upload className="size-3.5" />
                Cargar XML / Banco
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {data.client.razonSocial}
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {data.client.rfc}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selector Mes / Año */}
            <div className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1">
              <Calendar className="size-3.5 text-muted-foreground" />
              <select
                aria-label="Mes de conciliación"
                value={month}
                onChange={(e) => setMonth(Number.parseInt(e.target.value, 10))}
                className="bg-transparent text-xs font-medium outline-none"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Año de conciliación"
                value={year}
                onChange={(e) => setYear(Number.parseInt(e.target.value, 10))}
                className="bg-transparent font-mono text-xs font-medium outline-none"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector Cuenta Bancaria */}
            <div className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1">
              <Landmark className="size-3.5 text-muted-foreground" />
              <select
                aria-label="Cuenta bancaria"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="max-w-[200px] bg-transparent text-xs font-medium outline-none"
              >
                <option value="">Todas las cuentas</option>
                {data.client.bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.bankName} •••• {acc.last4Digits} ({acc.currency})
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              onClick={handleRunEngine}
              disabled={runningEngine}
              className="bg-emerald-700 text-white hover:bg-emerald-800"
              size="sm"
            >
              <Play className="mr-1.5 size-3.5" />
              {runningEngine ? "Conciliando..." : "Ejecutar Conciliación"}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openManualModal([], [])}
            >
              <Link2 className="mr-1.5 size-3.5" />
              Conciliación Manual
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="outline" size="sm" />
                }
              >
                <Download className="mr-1.5 size-3.5" />
                Exportar Excel / CSV
                <ChevronDown className="ml-1 size-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => void handleExport("xlsx")}>
                  <FileSpreadsheet className="mr-2 size-4 text-emerald-700" />
                  Descargar Excel (.xlsx · 4 hojas)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleExport("csv")}>
                  <FileText className="mr-2 size-4 text-muted-foreground" />
                  Descargar CSV (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {bannerMsg ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium",
            bannerMsg.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          )}
        >
          <span className="flex items-center gap-2">
            {bannerMsg.type === "success" ? (
              <Sparkles className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            {bannerMsg.text}
          </span>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            aria-label="Cerrar notificación"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {/* 2. Tarjetas de Semáforo (KPIs interactivos) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* VERDE */}
        <button
          type="button"
          onClick={() => setActiveTab("green")}
          className={cn(
            "text-left rounded-xl border bg-card p-4 transition-all hover:shadow-sm",
            activeTab === "green"
              ? "border-emerald-600 ring-2 ring-emerald-600/25"
              : "border-border"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              <span className="size-2.5 rounded-full bg-emerald-600" />
              Conciliado (Verde)
            </span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold tabular-nums">
              {formatMxn(data.kpis.green.totalAmount)}
            </span>
            <span className="font-mono text-xs font-semibold text-emerald-700">
              {data.kpis.green.percentage}%
            </span>
          </div>
          <Progress value={data.kpis.green.percentage} className="mt-2 h-1.5" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {data.kpis.green.count} mov(s) · {data.kpis.green.reconciliationCount}{" "}
            cruces confirmados
          </p>
        </button>

        {/* AMARILLO */}
        <button
          type="button"
          onClick={() => setActiveTab("yellow")}
          className={cn(
            "text-left rounded-xl border bg-card p-4 transition-all hover:shadow-sm",
            activeTab === "yellow"
              ? "border-amber-500 ring-2 ring-amber-500/25"
              : "border-border"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <span className="size-2.5 rounded-full bg-amber-500" />
              Revisión / Parcial
            </span>
            <AlertTriangle className="size-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold tabular-nums">
              {data.kpis.yellow.count}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatMxn(data.kpis.yellow.totalAmount)}
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {data.kpis.yellow.suggestedCount} sugerencia(s) ·{" "}
            {data.kpis.yellow.partialPpdCount} PPD parciales
          </p>
        </button>

        {/* ROJO - PENDIENTES SAT */}
        <button
          type="button"
          onClick={() => setActiveTab("red-sat")}
          className={cn(
            "text-left rounded-xl border bg-card p-4 transition-all hover:shadow-sm",
            activeTab === "red-sat"
              ? "border-rose-600 ring-2 ring-rose-600/25"
              : "border-border"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
              <span className="size-2.5 rounded-full bg-rose-600" />
              Pendientes SAT
            </span>
            <Receipt className="size-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-rose-700 tabular-nums dark:text-rose-400">
              {data.kpis.redPendingSat.count}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatMxn(data.kpis.redPendingSat.totalAmount)}
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            CFDIs sin movimiento bancario (CxC / CxP)
          </p>
        </button>

        {/* ROJO - SIN FACTURA */}
        <button
          type="button"
          onClick={() => setActiveTab("red-bank")}
          className={cn(
            "text-left rounded-xl border bg-card p-4 transition-all hover:shadow-sm",
            activeTab === "red-bank"
              ? "border-rose-600 ring-2 ring-rose-600/25"
              : "border-border"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
              <span className="size-2.5 rounded-full bg-rose-600" />
              Sin Factura
            </span>
            <AlertCircle className="size-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-rose-700 tabular-nums dark:text-rose-400">
              {data.kpis.redUnbilledBank.count}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatMxn(data.kpis.redUnbilledBank.totalAmount)}
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Movimientos bancarios sin CFDI (alerta fiscal)
          </p>
        </button>
      </div>

      {/* 3. Tabla de Resolución */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TrafficTab)}
      >
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="yellow">
            Amarillo: Por Revisar ({data.kpis.yellow.count})
          </TabsTrigger>
          <TabsTrigger value="green">
            Verde: Conciliados ({data.greenReconciliations.length})
          </TabsTrigger>
          <TabsTrigger value="red-sat">
            Rojo: Pendientes SAT ({data.pendingCfdis.length})
          </TabsTrigger>
          <TabsTrigger value="red-bank">
            Rojo: Sin Factura ({data.unbilledTransactions.length})
          </TabsTrigger>
        </TabsList>

        {/* PESTAÑA AMARILLO */}
        <TabsContent value="yellow" className="mt-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Sugerencias del Algoritmo para Aprobación ({yellowGroups.length})
              </CardTitle>
              <CardDescription>
                Compara lado a lado los CFDIs y movimientos bancarios detectados
                por pagos agrupados, tolerancias o divisas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {yellowGroups.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No hay sugerencias pendientes en Amarillo para este periodo.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CFDI(s) SAT</TableHead>
                      <TableHead>Movimiento Bancario</TableHead>
                      <TableHead>Motivo del Match</TableHead>
                      <TableHead className="text-right">Aplicado</TableHead>
                      <TableHead className="text-right">Resolución</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yellowGroups.map((group) => (
                      <TableRow key={group.key}>
                        <TableCell className="align-top">
                          <div className="space-y-1.5">
                            {group.cfdis.map((cfdi) => (
                              <div
                                key={cfdi.id}
                                className="rounded-md border border-border bg-muted/30 p-2 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-[11px] font-semibold">
                                    {cfdi.uuid.slice(0, 14)}…
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-[10px]"
                                  >
                                    {cfdi.direccion} ·{" "}
                                    {cfdi.metodoPago ?? cfdi.tipoComprobante}
                                  </Badge>
                                </div>
                                <div className="mt-0.5 font-medium">
                                  {cfdi.direccion === "EMITIDO"
                                    ? cfdi.nombreReceptor
                                    : cfdi.nombreEmisor}
                                </div>
                                <div className="mt-0.5 flex justify-between font-mono text-[11px] text-muted-foreground">
                                  <span>{cfdi.fechaEmision.slice(0, 10)}</span>
                                  <span>
                                    {formatMxn(cfdi.total)} {cfdi.moneda}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </TableCell>

                        <TableCell className="align-top">
                          <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {group.bankTransaction.fecha.slice(0, 10)}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {group.bankTransaction.tipo}
                              </Badge>
                            </div>
                            <div className="mt-0.5 font-medium">
                              {group.bankTransaction.concepto}
                            </div>
                            <div className="mt-0.5 flex justify-between font-mono text-[11px] text-muted-foreground">
                              <span>
                                {group.bankTransaction.bankName} ••••
                                {group.bankTransaction.last4Digits}
                              </span>
                              <span className="font-semibold text-foreground">
                                {formatMxn(group.bankTransaction.monto)}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="align-top">
                          <Badge
                            variant="secondary"
                            className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                          >
                            {group.confidenceScore}% · {group.matchType}
                          </Badge>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {group.motivoDisplay}
                          </p>
                        </TableCell>

                        <TableCell className="align-top text-right font-mono text-xs font-semibold tabular-nums">
                          {formatMxn(group.totalApplied)}
                        </TableCell>

                        <TableCell className="align-top text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              type="button"
                              size="xs"
                              disabled={resolvingKey === group.key}
                              onClick={() =>
                                handleResolve(
                                  group.reconciliationIds,
                                  "APPROVE",
                                  group.key
                                )
                              }
                              className="bg-emerald-700 text-white hover:bg-emerald-800"
                            >
                              <Check className="mr-1 size-3" />
                              Aprobar
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="destructive"
                              disabled={resolvingKey === group.key}
                              onClick={() =>
                                handleResolve(
                                  group.reconciliationIds,
                                  "REJECT",
                                  group.key
                                )
                              }
                            >
                              <X className="mr-1 size-3" />
                              Rechazar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {data.partialPpdCfdis.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Facturas PPD con Pago Parcial ({data.partialPpdCfdis.length})
                </CardTitle>
                <CardDescription>
                  CFDIs PPD que recibieron uno o más complementos parciales y aún
                  tienen saldo insoluto.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>UUID</TableHead>
                      <TableHead>Tercero</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">
                        Saldo Pendiente
                      </TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.partialPpdCfdis.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">
                          {c.uuid.slice(0, 18)}…
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {c.direccion === "EMITIDO"
                            ? c.nombreReceptor
                            : c.nombreEmisor}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatMxn(c.total)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold text-amber-700">
                          {formatMxn(c.saldoPendiente)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => openManualModal([c.id], [])}
                          >
                            Aplicar pago manual
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* PESTAÑA VERDE */}
        <TabsContent value="green" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Movimientos Conciliados ({data.greenReconciliations.length})
              </CardTitle>
              <CardDescription>
                Cruces automáticos (PUE / REP 2.0) y conciliaciones aprobadas
                manualmente por el despacho.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.greenReconciliations.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Aún no hay conciliaciones confirmadas en este periodo. Haz clic
                  en <strong>Ejecutar Conciliación</strong>.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estatus</TableHead>
                      <TableHead>CFDI SAT</TableHead>
                      <TableHead>Movimiento Bancario</TableHead>
                      <TableHead>Criterio</TableHead>
                      <TableHead className="text-right">
                        Monto Aplicado
                      </TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.greenReconciliations.map((rec) => (
                      <TableRow key={rec.id}>
                        <TableCell>
                          <Badge className="bg-emerald-700 text-white text-[11px]">
                            {rec.status} · {rec.confidenceScore}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {rec.cfdi.uuid.slice(0, 16)}…
                          </div>
                          <div className="text-xs font-medium">
                            {rec.cfdi.direccion === "EMITIDO"
                              ? rec.cfdi.nombreReceptor
                              : rec.cfdi.nombreEmisor}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">
                            {rec.bankTransaction.concepto}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {rec.bankTransaction.fecha.slice(0, 10)} ·{" "}
                            {rec.bankTransaction.bankName}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {rec.reason}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">
                          {formatMxn(rec.montoAplicado)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={resolvingKey === rec.id}
                            onClick={() =>
                              handleResolve([rec.id], "REJECT", rec.id)
                            }
                            className="text-destructive hover:text-destructive"
                          >
                            Desvincular
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PESTAÑA ROJO: PENDIENTES SAT */}
        <TabsContent value="red-sat" className="mt-3">
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">
                  CFDIs Pendientes de Flujo Bancario ({data.pendingCfdis.length})
                </CardTitle>
                <CardDescription>
                  Selecciona uno o varios CFDIs para vincularlos manualmente con
                  depósitos o retiros bancarios.
                </CardDescription>
              </div>
              {selectedCfdiIds.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => openManualModal(selectedCfdiIds, selectedTxIds)}
                  className="bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  <FileCheck2 className="mr-1.5 size-4" />
                  Conciliar {selectedCfdiIds.length} CFDI(s)
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {data.pendingCfdis.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Todos los CFDIs del periodo están conciliados.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>UUID</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo / Método</TableHead>
                      <TableHead>Tercero</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">
                        Saldo Pendiente
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pendingCfdis.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar CFDI ${c.uuid}`}
                            checked={selectedCfdiIds.includes(c.id)}
                            onChange={() => toggleCfdiSelection(c.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.uuid.slice(0, 16)}…
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.fechaEmision.slice(0, 10)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {c.direccion} · {c.tipoComprobante} ·{" "}
                            {c.metodoPago ?? "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {c.direccion === "EMITIDO"
                            ? c.nombreReceptor
                            : c.nombreEmisor}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {formatMxn(c.total)} {c.moneda}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold text-rose-700 tabular-nums">
                          {formatMxn(c.saldoPendiente)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PESTAÑA ROJO: SIN FACTURA */}
        <TabsContent value="red-bank" className="mt-3">
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">
                  Movimientos Bancarios sin CFDI (
                  {data.unbilledTransactions.length})
                </CardTitle>
                <CardDescription>
                  Posibles gastos no deducibles o ingresos sin factura timbrada.
                </CardDescription>
              </div>
              {selectedTxIds.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => openManualModal(selectedCfdiIds, selectedTxIds)}
                  className="bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  <Link2 className="mr-1.5 size-4" />
                  Vincular {selectedTxIds.length} Movimiento(s)
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {data.unbilledTransactions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No hay movimientos bancarios sin factura en este periodo.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Fecha</TableHead>
                      <TableHead>Banco</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.unbilledTransactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar movimiento ${t.concepto}`}
                            checked={selectedTxIds.includes(t.id)}
                            onChange={() => toggleTxSelection(t.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {t.fecha.slice(0, 10)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.bankName} ••••{t.last4Digits}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px]">
                            {t.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {t.concepto}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">
                          {formatMxn(t.monto)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 4. Modal de Conciliación Manual */}
      {manualOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Modal de Conciliación Manual"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Conciliación Manual</h2>
                <p className="text-xs text-muted-foreground">
                  Selecciona uno o varios CFDIs pendientes y vincúlalos con uno o
                  varios movimientos bancarios especificando el monto aplicado.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setManualOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <form
              onSubmit={handleSubmitManual}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div className="grid flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-2">
                {/* Columna Izquierda: CFDIs pendientes */}
                <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      CFDIs Pendientes ({selectedCfdiIds.length} sel.)
                    </span>
                    <span className="font-mono text-xs font-semibold text-emerald-700">
                      {formatMxn(selectedCfdiSum)}
                    </span>
                  </div>
                  <Input
                    value={manualSearchCfdi}
                    onChange={(e) => setManualSearchCfdi(e.target.value)}
                    placeholder="Filtrar por UUID, RFC o razón social..."
                    className="h-8 text-xs"
                  />
                  <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {data.pendingCfdis
                      .filter((c) => {
                        const q = manualSearchCfdi.toLowerCase();
                        if (!q) return true;
                        return (
                          c.uuid.toLowerCase().includes(q) ||
                          c.nombreEmisor.toLowerCase().includes(q) ||
                          c.nombreReceptor.toLowerCase().includes(q)
                        );
                      })
                      .map((c) => {
                        const checked = selectedCfdiIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-2.5 rounded-md border p-2 text-xs transition-colors",
                              checked
                                ? "border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30"
                                : "border-border hover:bg-muted/40"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCfdiSelection(c.id)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[11px] font-semibold">
                                  {c.uuid.slice(0, 14)}…
                                </span>
                                <span className="font-mono font-semibold tabular-nums">
                                  {formatMxn(c.saldoPendiente)}
                                </span>
                              </div>
                              <div className="truncate font-medium">
                                {c.direccion === "EMITIDO"
                                  ? c.nombreReceptor
                                  : c.nombreEmisor}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {c.fechaEmision.slice(0, 10)} · {c.direccion} ·{" "}
                                {c.metodoPago ?? c.tipoComprobante}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>

                {/* Columna Derecha: Movimientos Bancarios sin factura */}
                <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Movimientos Bancarios ({selectedTxIds.length} sel.)
                    </span>
                    <span className="font-mono text-xs font-semibold text-emerald-700">
                      {formatMxn(selectedTxSum)}
                    </span>
                  </div>
                  <Input
                    value={manualSearchTx}
                    onChange={(e) => setManualSearchTx(e.target.value)}
                    placeholder="Filtrar por concepto o monto..."
                    className="h-8 text-xs"
                  />
                  <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {data.unbilledTransactions
                      .filter((t) => {
                        const q = manualSearchTx.toLowerCase();
                        if (!q) return true;
                        return (
                          t.concepto.toLowerCase().includes(q) ||
                          String(t.monto).includes(q)
                        );
                      })
                      .map((t) => {
                        const checked = selectedTxIds.includes(t.id);
                        return (
                          <label
                            key={t.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-2.5 rounded-md border p-2 text-xs transition-colors",
                              checked
                                ? "border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30"
                                : "border-border hover:bg-muted/40"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTxSelection(t.id)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {t.tipo}
                                </Badge>
                                <span className="font-mono font-semibold tabular-nums">
                                  {formatMxn(t.monto)}
                                </span>
                              </div>
                              <div className="mt-0.5 truncate font-medium">
                                {t.concepto}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {t.fecha.slice(0, 10)} · {t.bankName} ••••
                                {t.last4Digits}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* Footer Modal */}
              <div className="flex flex-col gap-3 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="manual-monto" className="text-xs">
                      Monto Aplicado (MXN)
                    </Label>
                    <Input
                      id="manual-monto"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={manualMontoAplicado}
                      onChange={(e) => setManualMontoAplicado(e.target.value)}
                      className="h-8 w-40 font-mono text-sm"
                      required
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <div>
                      Diferencia:{" "}
                      <span className="font-mono font-semibold">
                        {formatMxn(Math.abs(selectedCfdiSum - selectedTxSum))}
                      </span>
                    </div>
                    <div>Se registrará como MANUAL · APROBADO</div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setManualOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      savingManual ||
                      selectedCfdiIds.length === 0 ||
                      selectedTxIds.length === 0
                    }
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                  >
                    {savingManual
                      ? "Vinculando..."
                      : "Guardar Conciliación Manual"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
