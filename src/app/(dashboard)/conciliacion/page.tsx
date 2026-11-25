"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Play,
  Sparkles,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { DEMO_CLIENTS, DEMO_FIRM } from "@/lib/demo-data";
import type { ReconciliationResult } from "@/lib/reconciliation/engine";

interface ReconcileApiResponse {
  reconciliation: ReconciliationResult;
  cfdiErrors: Array<{ fileName: string; error: string }>;
  detectedBank: string;
  bankWarnings: string[];
  skippedBankRows: number;
}

function formatMxn(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function ConciliacionPage() {
  const [selectedRfc, setSelectedRfc] = useState(DEMO_CLIENTS[0].rfc);
  const [xmlFiles, setXmlFiles] = useState<
    Array<{ fileName: string; content: string }>
  >([]);
  const [bankFileName, setBankFileName] = useState<string | null>(null);
  const [bankBase64, setBankBase64] = useState<string | undefined>(undefined);
  const [toleranceMxn, setToleranceMxn] = useState("1.00");

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileApiResponse | null>(null);

  async function handleXmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const loaded = await Promise.all(
      files.map(async (f) => ({
        fileName: f.name,
        content: await f.text(),
      }))
    );
    setXmlFiles(loaded);
  }

  async function handleBankUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    setBankFileName(file.name);
    setBankBase64(arrayBufferToBase64(buf));
  }

  async function runReconciliation(useDemoData: boolean) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRfc: selectedRfc,
          useDemoData,
          xmlFiles: useDemoData ? undefined : xmlFiles,
          bankBase64Content: useDemoData ? undefined : bankBase64,
          toleranceMxn: Number.parseFloat(toleranceMxn) || 1.0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo ejecutar la conciliación");
      }
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error inesperado al conciliar"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleExportExcel() {
    if (!result) return;
    setExporting(true);
    setError(null);
    try {
      const client =
        DEMO_CLIENTS.find((c) => c.rfc === selectedRfc) ?? DEMO_CLIENTS[0];
      const allCfdis = [
        ...result.reconciliation.matches.map((m) => m.cfdi),
        ...result.reconciliation.unmatchedCfdis,
      ];
      const allTransactions = [
        ...result.reconciliation.matches.map((m) => m.bankTransaction),
        ...result.reconciliation.unmatchedTransactions,
      ];

      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmName: DEMO_FIRM.name,
          clientRfc: client.rfc,
          clientName: client.razonSocial,
          periodLabel: DEMO_FIRM.periodLabel,
          cfdis: allCfdis,
          transactions: allTransactions,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Error al exportar el archivo Excel");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ConciliaSAT_${client.rfc}_${DEMO_FIRM.periodLabel.replace(/\s+/g, "_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al descargar reporte Excel"
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Motor de Conciliación CFDI 4.0 vs Banco
          </h1>
          <p className="text-sm text-muted-foreground">
            Carga los XML del SAT y el estado de cuenta bancario (CSV/Excel)
            para cruzar ingresos, gastos, PUE y PPD.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => runReconciliation(true)}
            disabled={loading}
          >
            <Sparkles className="mr-1.5 size-4 text-emerald-700" />
            Probar con Lote Demo SAT
          </Button>
          {result ? (
            <Button
              onClick={handleExportExcel}
              disabled={exporting}
              className="bg-emerald-700 text-white hover:bg-emerald-800"
            >
              <Download className="mr-1.5 size-4" />
              {exporting ? "Generando .xlsx..." : "Exportar Papel de Trabajo"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Configuración de lote */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            1. Carga de Archivos del Contribuyente
          </CardTitle>
          <CardDescription>
            El parser valida el TimbreFiscalDigital (UUID), IVA 002 y detecta
            automáticamente encabezados de BBVA, Santander, Banorte o
            Citibanamex.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="rfc-select">Contribuyente (RFC)</Label>
            <select
              id="rfc-select"
              value={selectedRfc}
              onChange={(e) => setSelectedRfc(e.target.value)}
              className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring"
            >
              {DEMO_CLIENTS.map((c) => (
                <option key={c.id} value={c.rfc}>
                  {c.rfc} — {c.razonSocial}
                </option>
              ))}
            </select>
            <div className="pt-2">
              <Label htmlFor="tol-mxn" className="text-xs text-muted-foreground">
                Tolerancia por redondeo / centavos (MXN)
              </Label>
              <Input
                id="tol-mxn"
                type="number"
                step="0.5"
                min="0"
                value={toleranceMxn}
                onChange={(e) => setToleranceMxn(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4 text-emerald-700" />
              CFDIs SAT (XML 4.0)
            </div>
            <p className="text-xs text-muted-foreground">
              Selecciona múltiples archivos <code className="font-mono">.xml</code>{" "}
              emitidos y recibidos.
            </p>
            <Input
              type="file"
              accept=".xml"
              multiple
              onChange={handleXmlUpload}
              className="cursor-pointer text-xs"
            />
            <p className="font-mono text-[11px] text-muted-foreground">
              {xmlFiles.length > 0
                ? `${xmlFiles.length} XML(s) cargados en memoria`
                : "Sin XMLs seleccionados (usa Lote Demo para probar)"}
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileSpreadsheet className="size-4 text-emerald-700" />
              Estado de Cuenta (CSV / Excel)
            </div>
            <p className="text-xs text-muted-foreground">
              Sube un archivo <code className="font-mono">.csv</code>,{" "}
              <code className="font-mono">.xlsx</code> o{" "}
              <code className="font-mono">.xls</code> del banco.
            </p>
            <Input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleBankUpload}
              className="cursor-pointer text-xs"
            />
            <p className="font-mono text-[11px] text-muted-foreground">
              {bankFileName
                ? `Archivo: ${bankFileName}`
                : "Sin estado de cuenta seleccionado"}
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 md:col-span-3">
            {error ? (
              <span className="mr-auto text-xs font-medium text-destructive">
                {error}
              </span>
            ) : null}
            <Button
              onClick={() => runReconciliation(false)}
              disabled={loading || xmlFiles.length === 0 || !bankBase64}
              className="bg-emerald-700 text-white hover:bg-emerald-800"
            >
              <Play className="mr-1.5 size-4" />
              {loading ? "Conciliando..." : "Ejecutar Conciliación con Archivos"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultados */}
      {result ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                  Tasa de Conciliación
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">
                  {result.reconciliation.summary.reconciliationRate}%
                </div>
                <Progress
                  value={result.reconciliation.summary.reconciliationRate}
                  className="mt-2 h-1.5"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Banco detectado: {result.detectedBank}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                  Monto Conciliado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                  {formatMxn(result.reconciliation.summary.matchedAmountMxn)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.reconciliation.matches.length} cruces confirmados/sugeridos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                  IVA Trasladado / Acreditable
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trasladado:</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatMxn(
                      result.reconciliation.summary.ivaTrasladadoConciliado
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Acreditable:</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatMxn(
                      result.reconciliation.summary.ivaAcreditableConciliado
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                  Alertas PUE sin Banco
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-2xl font-bold text-amber-600 tabular-nums">
                  <AlertTriangle className="size-5" />
                  {result.reconciliation.summary.pueSinFlujoCount}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.reconciliation.summary.unmatchedBankCount} movimientos
                  sin CFDI
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="matches">
            <TabsList>
              <TabsTrigger value="matches">
                Conciliados ({result.reconciliation.matches.length})
              </TabsTrigger>
              <TabsTrigger value="unmatched-cfdi">
                CFDIs sin Banco ({result.reconciliation.unmatchedCfdis.length})
              </TabsTrigger>
              <TabsTrigger value="unmatched-bank">
                Movimientos sin CFDI (
                {result.reconciliation.unmatchedTransactions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="matches" className="mt-3">
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estatus</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>CFDI (UUID / Contrario)</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Movimiento Bancario</TableHead>
                        <TableHead className="text-right">Monto Banco</TableHead>
                        <TableHead>Criterio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.reconciliation.matches.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            <Badge
                              variant={
                                m.status === "AUTO_MATCHED"
                                  ? "default"
                                  : "secondary"
                              }
                              className={
                                m.status === "AUTO_MATCHED"
                                  ? "bg-emerald-700 text-white"
                                  : "bg-amber-100 text-amber-800"
                              }
                            >
                              {m.status === "AUTO_MATCHED"
                                ? "Auto"
                                : m.status === "PARTIAL_PPD"
                                  ? "Parcial PPD"
                                  : "Sugerido"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold">
                            {m.confidenceScore}%
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {m.cfdi.uuid.slice(0, 18)}…
                            </div>
                            <div className="text-xs font-medium">
                              {m.cfdi.direction === "EMITIDO"
                                ? m.cfdi.nombreReceptor
                                : m.cfdi.nombreEmisor}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-[11px]">
                              {m.cfdi.direction} · {m.cfdi.metodoPago ?? "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs font-medium">
                              {m.bankTransaction.description}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {m.bankTransaction.date} ·{" "}
                              {m.bankTransaction.reference ?? "Sin ref"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">
                            {formatMxn(m.bankTransaction.amount)}
                          </TableCell>
                          <TableCell className="max-w-xs text-xs text-muted-foreground">
                            {m.reasons.join(" · ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="unmatched-cfdi" className="mt-3">
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>UUID</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Emisor / Receptor</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Alerta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.reconciliation.unmatchedCfdis.map((c) => (
                        <TableRow key={c.uuid}>
                          <TableCell className="font-mono text-xs">
                            {c.uuid.slice(0, 18)}…
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {c.fecha.slice(0, 10)}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {c.direction === "EMITIDO"
                              ? c.nombreReceptor
                              : c.nombreEmisor}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{c.metodoPago}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            {formatMxn(c.total)}
                          </TableCell>
                          <TableCell>
                            {c.metodoPago === "PUE" ? (
                              <Badge variant="destructive" className="text-xs">
                                PUE sin flujo bancario
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Pendiente PPD
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="unmatched-bank" className="mt-3">
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Descripción Bancaria</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.reconciliation.unmatchedTransactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs">
                            {t.date}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{t.type}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {t.reference ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {t.description}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            {formatMxn(t.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Upload className="size-6" />
            </div>
            <div className="max-w-md space-y-1">
              <p className="text-sm font-medium">
                Listo para conciliar XML 4.0 contra estado de cuenta
              </p>
              <p className="text-xs text-muted-foreground">
                Sube archivos reales o haz clic en{" "}
                <strong>Probar con Lote Demo SAT</strong> para ejecutar el
                parser XML, lector bancario y exportación a Excel.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runReconciliation(true)}
            >
              <CheckCircle2 className="mr-1.5 size-4 text-emerald-700" />
              Ejecutar Demo Ahora
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
