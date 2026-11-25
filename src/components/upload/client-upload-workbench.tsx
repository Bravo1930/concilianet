"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Landmark,
  RefreshCw,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BankColumnMapping } from "@/lib/validators/sat";
import { cn } from "cn";

interface BankAccountRecord {
  id: string;
  bankName: string;
  last4Digits: string;
  currency: string;
  columnMappingJson: BankColumnMapping | null;
}

interface ClientDetails {
  id: string;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  bankAccounts: BankAccountRecord[];
  _count: {
    cfdis: number;
    bankTransactions: number;
  };
}

interface SatUploadSummary {
  totalFiles: number;
  insertedCount: number;
  repCount: number;
  duplicatesCount: number;
  duplicateUuids: string[];
  outsidePeriodCount: number;
  errors: Array<{ fileName: string; error: string }>;
}

interface BankPreviewData {
  fileName: string;
  totalRows: number;
  headerRow: number;
  headers: string[];
  previewRows: Array<Record<string, string>>;
  suggestedMapping: BankColumnMapping;
  savedMappingUsed: boolean;
}

interface BankCommitSummary {
  totalRows: number;
  parsedCount: number;
  insertedCount: number;
  duplicatesCount: number;
  errors: Array<{ rowNumber: number; error: string }>;
  mappingSaved: boolean;
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

function buildSampleXmlFilesForRfc(clientRfc: string): File[] {
  const pueXml = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="F" Folio="2041" Fecha="2026-11-05T10:15:00" FormaPago="03" SubTotal="25000.00" Moneda="MXN" Total="29000.00" TipoDeComprobante="I" MetodoPago="PUE" LugarExpedicion="06600">
  <cfdi:Emisor Rfc="${clientRfc}" Nombre="CONTRIBUYENTE DEMO SA DE CV" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="CME150908RT3" Nombre="COMERCIALIZADORA MEXICANA SA DE CV" UsoCFDI="G03" RegimenFiscalReceptor="601" DomicilioFiscalReceptor="03100" />
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="11111111-2222-4333-8444-555555555501" FechaTimbrado="2026-11-05T10:15:04" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

  const ppdXml = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="F" Folio="2042" Fecha="2026-11-08T12:00:00" FormaPago="99" SubTotal="40000.00" Moneda="MXN" Total="46400.00" TipoDeComprobante="I" MetodoPago="PPD" LugarExpedicion="06600">
  <cfdi:Emisor Rfc="${clientRfc}" Nombre="CONTRIBUYENTE DEMO SA DE CV" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="LOG171102TR8" Nombre="LOGISTICA REFRIGERADA DEL NORTE S DE RL" UsoCFDI="G01" RegimenFiscalReceptor="601" DomicilioFiscalReceptor="64000" />
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="11111111-2222-4333-8444-555555555502" FechaTimbrado="2026-11-08T12:00:05" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

  const repXml = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" Serie="REP" Folio="901" Fecha="2026-11-12T16:30:00" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P" LugarExpedicion="06600">
  <cfdi:Emisor Rfc="${clientRfc}" Nombre="CONTRIBUYENTE DEMO SA DE CV" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="LOG171102TR8" Nombre="LOGISTICA REFRIGERADA DEL NORTE S DE RL" UsoCFDI="CP01" RegimenFiscalReceptor="601" DomicilioFiscalReceptor="64000" />
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales MontoTotalPagos="23200.00" />
      <pago20:Pago FechaPago="2026-11-12T16:00:00" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="23200.00">
        <pago20:DoctoRelacionado IdDocumento="11111111-2222-4333-8444-555555555502" MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="1" ImpSaldoAnt="46400.00" ImpPagado="23200.00" ImpSaldoInsoluto="23200.00" />
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="11111111-2222-4333-8444-555555555503" FechaTimbrado="2026-11-12T16:30:09" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

  return [
    new File([pueXml], `F-2041_PUE_${clientRfc}.xml`, { type: "text/xml" }),
    new File([ppdXml], `F-2042_PPD_${clientRfc}.xml`, { type: "text/xml" }),
    new File([repXml], `REP-901_${clientRfc}.xml`, { type: "text/xml" }),
  ];
}

function buildSampleBankCsvFile(): File {
  const csv = `Estado de Cuenta Empresarial
Cuenta: ****4821
Fecha,Referencia,Concepto,Cargo,Abono,Saldo
05/11/2026,SPEI-2041,SPEI RECIBIDO COMERCIALIZADORA MEXICANA FACT 2041,,29000.00,145000.00
09/11/2026,TR-8812,PAGO PROVEEDOR CLOUD HOSTING MX,4850.00,,140150.00
12/11/2026,SPEI-901,ABONO PARCIAL LOGISTICA REFRIGERADA REP 901,,23200.00,163350.00
15/11/2026,COM-001,COMISION BANCARIA MENSUAL,450.00,,162900.00
18/11/2026,TR-8901,COMPRA PAPELERIA Y SUMINISTROS OFICINA,1280.50,,161619.50
`;
  return new File([csv], "estado_cuenta_nov_2026.csv", { type: "text/csv" });
}

export function ClientUploadWorkbench({ clientId }: { clientId: string }) {
  const satInputRef = useRef<HTMLInputElement>(null);
  const bankInputRef = useRef<HTMLInputElement>(null);

  const [client, setClient] = useState<ClientDetails | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [periodMonth, setPeriodMonth] = useState(11);
  const [periodYear, setPeriodYear] = useState(2026);

  const [satDragging, setSatDragging] = useState(false);
  const [satFiles, setSatFiles] = useState<File[]>([]);
  const [uploadingSat, setUploadingSat] = useState(false);
  const [satSummary, setSatSummary] = useState<SatUploadSummary | null>(null);

  const [selectedBankId, setSelectedBankId] = useState("");
  const [bankDragging, setBankDragging] = useState(false);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<BankPreviewData | null>(null);
  const [mapping, setMapping] = useState<BankColumnMapping | null>(null);
  const [amountMode, setAmountMode] = useState<"split" | "single">("split");
  const [saveMapping, setSaveMapping] = useState(true);
  const [committingBank, setCommittingBank] = useState(false);
  const [bankSummary, setBankSummary] = useState<BankCommitSummary | null>(
    null
  );

  async function refreshClientCounts() {
    const res = await fetch(`/api/clients/${clientId}`);
    const data = await res.json();
    if (res.ok && data.client) {
      setClient(data.client);
    }
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/clients/${clientId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Cliente no encontrado");
        if (active) {
          setClient(data.client);
          if (data.client.bankAccounts?.length > 0) {
            setSelectedBankId(data.client.bankAccounts[0].id);
          }
        }
      })
      .catch((err) => {
        if (active) {
          setPageError(
            err instanceof Error ? err.message : "Error al cargar cliente"
          );
        }
      })
      .finally(() => {
        if (active) setLoadingClient(false);
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  async function submitSatFiles(filesToUpload: File[]) {
    if (filesToUpload.length === 0) return;
    setUploadingSat(true);
    setPageError(null);
    try {
      const fd = new FormData();
      fd.append("year", String(periodYear));
      fd.append("month", String(periodMonth));
      for (const f of filesToUpload) {
        fd.append("files", f);
      }

      const res = await fetch(`/api/clients/${clientId}/upload/sat`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al subir XMLs SAT");
      setSatSummary(data);
      await refreshClientCounts();
    } catch (err) {
      setPageError(
        err instanceof Error ? err.message : "Error al procesar CFDIs SAT"
      );
    } finally {
      setUploadingSat(false);
    }
  }

  async function loadBankPreview(
    file: File,
    bankAccountId: string,
    headerRowOverride?: number
  ) {
    if (!bankAccountId) {
      setPageError("Selecciona primero una cuenta bancaria del cliente.");
      return;
    }
    setLoadingPreview(true);
    setPageError(null);
    setBankSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bankAccountId", bankAccountId);
      if (headerRowOverride) {
        fd.append("headerRow", String(headerRowOverride));
      }

      const res = await fetch(`/api/clients/${clientId}/upload/bank/preview`, {
        method: "POST",
        body: fd,
      });
      const data: BankPreviewData & { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo leer el archivo bancario");
      }

      setBankFile(file);
      setPreview(data);
      setMapping(data.suggestedMapping);
      const hasSplit =
        Boolean(data.suggestedMapping.columns.cargo) ||
        Boolean(data.suggestedMapping.columns.abono);
      setAmountMode(hasSplit ? "split" : "single");
    } catch (err) {
      setPageError(
        err instanceof Error
          ? err.message
          : "Error al previsualizar estado de cuenta"
      );
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleCommitBank() {
    if (!bankFile || !selectedBankId || !mapping) return;
    setCommittingBank(true);
    setPageError(null);
    try {
      const finalMapping: BankColumnMapping = {
        ...mapping,
        columns: {
          ...mapping.columns,
          cargo: amountMode === "split" ? mapping.columns.cargo : "",
          abono: amountMode === "split" ? mapping.columns.abono : "",
          monto: amountMode === "single" ? mapping.columns.monto : "",
        },
      };

      const fd = new FormData();
      fd.append("file", bankFile);
      fd.append("bankAccountId", selectedBankId);
      fd.append("mappingJson", JSON.stringify(finalMapping));
      fd.append("saveMapping", String(saveMapping));
      fd.append("year", String(periodYear));
      fd.append("month", String(periodMonth));

      const res = await fetch(`/api/clients/${clientId}/upload/bank/commit`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al importar movimientos");
      }
      setBankSummary(data);
      await refreshClientCounts();
    } catch (err) {
      setPageError(
        err instanceof Error ? err.message : "Error al guardar movimientos"
      );
    } finally {
      setCommittingBank(false);
    }
  }

  if (loadingClient) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Cargando perfil fiscal del cliente...
      </div>
    );
  }

  if (!client) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-destructive">
            {pageError || "Cliente no encontrado"}
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <Link
            href="/dashboard/clients"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Volver a Clientes / RFCs
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              Ingesta SAT &amp; Bancos
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              {client.rfc}
            </Badge>
            <Link
              href={`/dashboard/clients/${clientId}/reconcile`}
              className={buttonVariants({ variant: "outline", size: "xs" })}
            >
              Ir al Tablero de Conciliación →
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            {client.razonSocial} · {client._count.cfdis} CFDIs y{" "}
            {client._count.bankTransactions} movimientos almacenados
          </p>
        </div>

        <Card className="w-full lg:w-auto">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="size-4 text-emerald-700" />
              Periodo:
            </div>
            <select
              aria-label="Mes fiscal"
              value={periodMonth}
              onChange={(e) => setPeriodMonth(Number.parseInt(e.target.value, 10))}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Año fiscal"
              value={periodYear}
              onChange={(e) => setPeriodYear(Number.parseInt(e.target.value, 10))}
              className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs font-medium"
            >
              {[2024, 2025, 2026, 2027].map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      </div>

      {pageError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{pageError}</span>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md bg-emerald-700/10 text-emerald-700">
                  <FileText className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    1. CFDIs del SAT (.xml / .zip)
                  </CardTitle>
                  <CardDescription>
                    Detecta EMITIDO vs RECIBIDO, deduplica UUID y extrae REP 2.0
                  </CardDescription>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={uploadingSat}
                onClick={() => {
                  const demoFiles = buildSampleXmlFilesForRfc(client.rfc);
                  setSatFiles(demoFiles);
                  void submitSatFiles(demoFiles);
                }}
              >
                <Sparkles className="mr-1 size-3 text-emerald-700" />
                XMLs Demo (incl. REP 2.0)
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setSatDragging(true);
              }}
              onDragLeave={() => setSatDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSatDragging(false);
                const dropped = Array.from(e.dataTransfer.files);
                if (dropped.length > 0) {
                  setSatFiles(dropped);
                  void submitSatFiles(dropped);
                }
              }}
              onClick={() => satInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
                satDragging
                  ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30"
                  : "border-border hover:border-emerald-600/50 hover:bg-muted/30"
              )}
            >
              <input
                ref={satInputRef}
                type="file"
                accept=".xml,.zip"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length > 0) {
                    setSatFiles(picked);
                    void submitSatFiles(picked);
                  }
                }}
              />
              <div className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {satFiles.some((f) => f.name.endsWith(".zip")) ? (
                  <FileArchive className="size-5" />
                ) : (
                  <UploadCloud className="size-5" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {uploadingSat
                    ? "Procesando CFDIs en el servidor..."
                    : "Arrastra tus archivos .xml o .zip del SAT aquí"}
                </p>
                <p className="text-xs text-muted-foreground">
                  O haz clic para seleccionar descarga masiva del SAT (CFDI 4.0
                  I, E, P, N)
                </p>
              </div>
            </div>

            {satFiles.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span className="font-mono text-muted-foreground">
                  Último lote: {satFiles.length} archivo(s)
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={uploadingSat}
                  onClick={() => void submitSatFiles(satFiles)}
                >
                  Reprocesar lote
                </Button>
              </div>
            ) : null}

            {satSummary ? (
              <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  <CheckCircle2 className="size-4" />
                  Resumen de Ingesta SAT
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-emerald-50/70 p-2 dark:bg-emerald-950/40">
                    <div className="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-300">
                      {satSummary.insertedCount}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Nuevos ({satSummary.repCount} REP)
                    </div>
                  </div>
                  <div className="rounded-md bg-amber-50/70 p-2 dark:bg-amber-950/30">
                    <div className="font-mono text-lg font-bold text-amber-700 dark:text-amber-300">
                      {satSummary.duplicatesCount}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Duplicados (UUID)
                    </div>
                  </div>
                  <div className="rounded-md bg-rose-50/70 p-2 dark:bg-rose-950/30">
                    <div className="font-mono text-lg font-bold text-rose-700 dark:text-rose-300">
                      {satSummary.errors.length}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Errores
                    </div>
                  </div>
                </div>

                {satSummary.outsidePeriodCount > 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Nota: {satSummary.outsidePeriodCount} CFDI(s) tienen fecha
                    fuera de {MONTHS.find((m) => m.value === periodMonth)?.label}{" "}
                    {periodYear}, pero fueron guardados para conciliación PPD.
                  </p>
                ) : null}

                {satSummary.duplicateUuids.length > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">UUIDs omitidos: </span>
                    <span className="font-mono">
                      {satSummary.duplicateUuids.slice(0, 3).join(", ")}
                      {satSummary.duplicateUuids.length > 3 ? "…" : ""}
                    </span>
                  </div>
                ) : null}

                {satSummary.errors.length > 0 ? (
                  <ul className="space-y-1 text-xs text-destructive">
                    {satSummary.errors.slice(0, 4).map((e, idx) => (
                      <li key={idx}>
                        <span className="font-mono">{e.fileName}:</span>{" "}
                        {e.error}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md bg-emerald-700/10 text-emerald-700">
                  <FileSpreadsheet className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    2. Estado de Cuenta (.csv / .xlsx)
                  </CardTitle>
                  <CardDescription>
                    Vista previa, mapeo guardado por banco y hashUnico
                    antiduplicados
                  </CardDescription>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={!selectedBankId || loadingPreview}
                onClick={() => {
                  const demoCsv = buildSampleBankCsvFile();
                  void loadBankPreview(demoCsv, selectedBankId);
                }}
              >
                <Sparkles className="mr-1 size-3 text-emerald-700" />
                CSV Demo Banco
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bank-account-select">
                Cuenta Bancaria Destino
              </Label>
              {client.bankAccounts.length === 0 ? (
                <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  <span>Este RFC aún no tiene cuentas bancarias.</span>
                  <Link
                    href="/dashboard/clients"
                    className="font-semibold underline"
                  >
                    Agregar cuenta
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Landmark className="size-4 shrink-0 text-emerald-700" />
                  <select
                    id="bank-account-select"
                    value={selectedBankId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedBankId(nextId);
                      if (bankFile) {
                        void loadBankPreview(bankFile, nextId);
                      }
                    }}
                    className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none"
                  >
                    {client.bankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.bankName} — •••• {acc.last4Digits} ({acc.currency})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setBankDragging(true);
              }}
              onDragLeave={() => setBankDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setBankDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) {
                  void loadBankPreview(dropped, selectedBankId);
                }
              }}
              onClick={() => bankInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-7 text-center transition-colors",
                bankDragging
                  ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30"
                  : "border-border hover:border-emerald-600/50 hover:bg-muted/30"
              )}
            >
              <input
                ref={bankInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) {
                    void loadBankPreview(picked, selectedBankId);
                  }
                }}
              />
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <UploadCloud className="size-5" />
              </div>
              <p className="text-sm font-medium">
                {loadingPreview
                  ? "Leyendo columnas y primeras 5 filas..."
                  : bankFile
                    ? `Archivo cargado: ${bankFile.name}`
                    : "Arrastra el estado de cuenta (.csv o .xlsx) aquí"}
              </p>
              <p className="text-xs text-muted-foreground">
                Podrás mapear columnas antes de guardar los movimientos
              </p>
            </div>

            {bankSummary ? (
              <div className="space-y-2 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4" />
                    Resumen de Ingesta Bancaria
                  </span>
                  {bankSummary.mappingSaved ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Mapeo guardado
                    </Badge>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-emerald-50/70 p-2 dark:bg-emerald-950/40">
                    <div className="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-300">
                      {bankSummary.insertedCount}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Movimientos nuevos
                    </div>
                  </div>
                  <div className="rounded-md bg-amber-50/70 p-2 dark:bg-amber-950/30">
                    <div className="font-mono text-lg font-bold text-amber-700 dark:text-amber-300">
                      {bankSummary.duplicatesCount}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Duplicados (hash)
                    </div>
                  </div>
                  <div className="rounded-md bg-rose-50/70 p-2 dark:bg-rose-950/30">
                    <div className="font-mono text-lg font-bold text-rose-700 dark:text-rose-300">
                      {bankSummary.errors.length}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Filas con error
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {preview && mapping ? (
        <Card className="border-emerald-600/30">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  Mapeador Interactivo y Vista Previa (5 filas)
                </CardTitle>
                {preview.savedMappingUsed ? (
                  <Badge className="bg-emerald-700 text-white text-[10px]">
                    Mapeo guardado aplicado
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                Archivo: <span className="font-mono">{preview.fileName}</span> ·{" "}
                {preview.totalRows} filas detectadas después de fila{" "}
                {preview.headerRow}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="header-row-num" className="text-xs">
                Fila encabezado:
              </Label>
              <Input
                id="header-row-num"
                type="number"
                min={1}
                max={30}
                value={mapping.headerRow}
                onChange={(e) =>
                  setMapping({
                    ...mapping,
                    headerRow: Number.parseInt(e.target.value, 10) || 1,
                  })
                }
                className="h-8 w-16 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() =>
                  bankFile &&
                  void loadBankPreview(
                    bankFile,
                    selectedBankId,
                    mapping.headerRow
                  )
                }
              >
                <RefreshCw className="mr-1 size-3" />
                Recargar
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1">
                <Label className="text-xs">Columna Fecha *</Label>
                <select
                  value={mapping.columns.fecha}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      columns: { ...mapping.columns, fecha: e.target.value },
                    })
                  }
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Columna Concepto *</Label>
                <select
                  value={mapping.columns.concepto}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      columns: { ...mapping.columns, concepto: e.target.value },
                    })
                  }
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Modo de Montos</Label>
                <select
                  value={amountMode}
                  onChange={(e) =>
                    setAmountMode(e.target.value as "split" | "single")
                  }
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="split">Cargo y Abono separados</option>
                  <option value="single">Monto único con signo (+/-)</option>
                </select>
              </div>

              {amountMode === "split" ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Columna Cargo (Egreso)</Label>
                    <select
                      value={mapping.columns.cargo ?? ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          columns: { ...mapping.columns, cargo: e.target.value },
                        })
                      }
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="">-- Ninguna --</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Columna Abono (Ingreso)</Label>
                    <select
                      value={mapping.columns.abono ?? ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          columns: { ...mapping.columns, abono: e.target.value },
                        })
                      }
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="">-- Ninguna --</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div className="space-y-1 lg:col-span-2">
                  <Label className="text-xs">
                    Columna Monto / Importe con signo *
                  </Label>
                  <select
                    value={mapping.columns.monto ?? ""}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        columns: { ...mapping.columns, monto: e.target.value },
                      })
                    }
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">-- Selecciona columna --</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.headers.map((h) => (
                      <TableHead key={h} className="font-mono text-xs">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.previewRows.map((row, idx) => (
                    <TableRow key={idx}>
                      {preview.headers.map((h) => (
                        <TableCell key={h} className="text-xs whitespace-nowrap">
                          {row[h] || "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveMapping}
                  onChange={(e) => setSaveMapping(e.target.checked)}
                />
                Guardar este mapeo en la cuenta bancaria para futuras cargas
              </label>

              <Button
                type="button"
                disabled={committingBank}
                onClick={handleCommitBank}
                className="bg-emerald-700 text-white hover:bg-emerald-800"
              >
                {committingBank
                  ? "Importando movimientos..."
                  : "Confirmar e Importar Movimientos"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
