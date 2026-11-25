"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  FileCheck2,
  Landmark,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
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
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadDemoDataButton } from "@/components/dashboard/load-demo-button";
import {
  DEFAULT_BANK_MAPPINGS,
  MEXICAN_BANKS,
  SAT_REGIMENES_FISCALES,
  type BankColumnMapping,
} from "@/lib/validators/sat";

interface BankAccountRecord {
  id: string;
  clientId: string;
  bankName: string;
  last4Digits: string;
  currency: string;
  columnMappingJson: BankColumnMapping | null;
}

interface ClientRecord {
  id: string;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  createdAt: string;
  bankAccounts: BankAccountRecord[];
  _count: {
    cfdis: number;
    bankTransactions: number;
    reconciliations: number;
  };
}

interface OrganizationSummary {
  id: string;
  name: string;
  plan: string;
  maxRfcs: number;
  usedRfcs: number;
  subscriptionStatus: string;
}

const EMPTY_MAPPING: BankColumnMapping = {
  delimiter: ",",
  headerRow: 1,
  dateFormat: "DD/MM/YYYY",
  columns: {
    fecha: "Fecha",
    concepto: "Concepto",
    cargo: "Cargo",
    abono: "Abono",
    monto: "",
    referencia: "Referencia",
  },
};

interface LimitStatus {
  allowed: boolean;
  reason?: string;
  message?: string;
  usedRfcs: number;
  maxRfcs: number;
  plan: string;
  subscriptionStatus: string;
}

export default function DashboardClientsPage() {
  const [organization, setOrganization] = useState<OrganizationSummary | null>(
    null
  );
  const [limitStatus, setLimitStatus] = useState<LimitStatus | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Create / Edit Client form state
  const [clientModalMode, setClientModalMode] = useState<
    "closed" | "create" | "edit"
  >("closed");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [rfc, setRfc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [regimenFiscal, setRegimenFiscal] = useState<string>(
    SAT_REGIMENES_FISCALES[0].label
  );
  const [includeInitialBank, setIncludeInitialBank] = useState(true);
  const [initBankName, setInitBankName] = useState<string>(MEXICAN_BANKS[0]);
  const [initLast4, setInitLast4] = useState("");
  const [initCurrency, setInitCurrency] = useState<"MXN" | "USD" | "EUR">(
    "MXN"
  );
  const [savingClient, setSavingClient] = useState(false);

  // Add / Edit BankAccount + CSV Mapping drawer state
  const [bankTargetClient, setBankTargetClient] = useState<ClientRecord | null>(
    null
  );
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string>(MEXICAN_BANKS[0]);
  const [last4Digits, setLast4Digits] = useState("");
  const [currency, setCurrency] = useState<"MXN" | "USD" | "EUR">("MXN");
  const [mapping, setMapping] = useState<BankColumnMapping>(
    DEFAULT_BANK_MAPPINGS["BBVA México"]
  );
  const [savingBank, setSavingBank] = useState(false);

  const loadClients = useCallback(async (search = "") => {
    setLoading(true);
    setBannerError(null);
    try {
      const url = search
        ? `/api/clients?q=${encodeURIComponent(search)}`
        : "/api/clients";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al cargar clientes");
      }
      setOrganization(data.organization);
      setLimitStatus(data.limitStatus ?? null);
      setClients(data.clients);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Error de conexión con la base"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/clients")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al cargar clientes");
        if (active) {
          setOrganization(data.organization);
          setLimitStatus(data.limitStatus ?? null);
          setClients(data.clients);
        }
      })
      .catch((err) => {
        if (active) {
          setBannerError(
            err instanceof Error ? err.message : "Error de conexión con la base"
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function openCreateClient() {
    setClientModalMode("create");
    setEditingClientId(null);
    setRfc("");
    setRazonSocial("");
    setRegimenFiscal(SAT_REGIMENES_FISCALES[0].label);
    setIncludeInitialBank(true);
    setInitBankName(MEXICAN_BANKS[0]);
    setInitLast4("");
    setInitCurrency("MXN");
    setBannerError(null);
  }

  function openEditClient(client: ClientRecord) {
    setClientModalMode("edit");
    setEditingClientId(client.id);
    setRfc(client.rfc);
    setRazonSocial(client.razonSocial);
    setRegimenFiscal(client.regimenFiscal);
    setIncludeInitialBank(false);
    setBannerError(null);
  }

  async function handleSubmitClient(e: React.FormEvent) {
    e.preventDefault();
    setSavingClient(true);
    setBannerError(null);
    try {
      if (clientModalMode === "create") {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rfc: rfc.toUpperCase(),
            razonSocial,
            regimenFiscal,
            ...(includeInitialBank && initLast4.trim().length > 0
              ? {
                  initialBankAccount: {
                    bankName: initBankName,
                    last4Digits: initLast4.trim(),
                    currency: initCurrency,
                  },
                }
              : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo crear el cliente");
      } else if (clientModalMode === "edit" && editingClientId) {
        const res = await fetch(`/api/clients/${editingClientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rfc: rfc.toUpperCase(),
            razonSocial,
            regimenFiscal,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "No se pudo actualizar el cliente");
        }
      }

      setClientModalMode("closed");
      await loadClients(query);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Error al guardar cliente"
      );
    } finally {
      setSavingClient(false);
    }
  }

  async function handleDeleteClient(client: ClientRecord) {
    setBannerError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar");
      await loadClients(query);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Error al eliminar cliente"
      );
    }
  }

  function openAddBankAccount(client: ClientRecord) {
    setBankTargetClient(client);
    setEditingBankId(null);
    const defaultBank = MEXICAN_BANKS[0];
    setBankName(defaultBank);
    setLast4Digits("");
    setCurrency("MXN");
    setMapping(DEFAULT_BANK_MAPPINGS[defaultBank] ?? EMPTY_MAPPING);
    setBannerError(null);
  }

  function openEditBankAccount(
    client: ClientRecord,
    account: BankAccountRecord
  ) {
    setBankTargetClient(client);
    setEditingBankId(account.id);
    setBankName(account.bankName);
    setLast4Digits(account.last4Digits);
    setCurrency((account.currency as "MXN" | "USD" | "EUR") || "MXN");
    setMapping(
      account.columnMappingJson ??
        DEFAULT_BANK_MAPPINGS[account.bankName] ??
        EMPTY_MAPPING
    );
    setBannerError(null);
  }

  function handleBankNameChange(nextBank: string) {
    setBankName(nextBank);
    if (!editingBankId && DEFAULT_BANK_MAPPINGS[nextBank]) {
      setMapping(DEFAULT_BANK_MAPPINGS[nextBank]);
    }
  }

  async function handleSubmitBankAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!bankTargetClient) return;
    setSavingBank(true);
    setBannerError(null);
    try {
      const payload = {
        bankName,
        last4Digits: last4Digits.trim(),
        currency,
        columnMappingJson: mapping,
      };

      const url = editingBankId
        ? `/api/bank-accounts/${editingBankId}`
        : `/api/clients/${bankTargetClient.id}/bank-accounts`;
      const method = editingBankId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo guardar la cuenta bancaria");
      }

      setBankTargetClient(null);
      setEditingBankId(null);
      await loadClients(query);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Error al guardar cuenta bancaria"
      );
    } finally {
      setSavingBank(false);
    }
  }

  async function handleDeleteBankAccount(accountId: string) {
    setBannerError(null);
    try {
      const res = await fetch(`/api/bank-accounts/${accountId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar cuenta");
      await loadClients(query);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Error al eliminar cuenta bancaria"
      );
    }
  }

  const quotaPct = organization
    ? Math.min(
        100,
        Math.round((organization.usedRfcs / organization.maxRfcs) * 100)
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Clientes (RFCs) y Cuentas Bancarias
          </h1>
          <p className="text-sm text-muted-foreground">
            {organization
              ? `${organization.name} · Plan ${organization.plan} (${organization.usedRfcs} de ${organization.maxRfcs} RFCs)`
              : "Gestión multi-tenant de contribuyentes del despacho y mapeo CSV bancario"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {process.env.NODE_ENV !== "production" ? (
            <LoadDemoDataButton />
          ) : null}
          <Button
            onClick={openCreateClient}
            disabled={Boolean(limitStatus && !limitStatus.allowed)}
            className="bg-emerald-700 text-white hover:bg-emerald-800"
          >
            <Plus className="mr-1.5 size-4" />
            Nuevo Cliente (RFC)
          </Button>
        </div>
      </div>

      {/* Quota Bar */}
      {organization ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  Capacidad de RFCs del Despacho
                </span>
                <Badge variant="secondary" className="font-mono text-xs">
                  Plan {organization.plan}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Cada cliente puede tener múltiples cuentas bancarias con su
                propio mapeo de columnas CSV/Excel.
              </p>
            </div>
            <div className="w-full space-y-1 sm:w-64">
              <div className="flex justify-between text-xs font-mono">
                <span>
                  {organization.usedRfcs} / {organization.maxRfcs} RFCs
                </span>
                <span>{quotaPct}%</span>
              </div>
              <Progress value={quotaPct} className="h-2" />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {limitStatus && !limitStatus.allowed ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-start gap-2.5 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div>
              <span className="font-semibold">
                {limitStatus.reason === "SUBSCRIPTION_INACTIVE"
                  ? "Suscripción inactiva o vencida: "
                  : "Límite de RFCs alcanzado: "}
              </span>
              <span>{limitStatus.message}</span>
            </div>
          </div>
          <Link
            href="/dashboard/billing"
            className={
              buttonVariants({ size: "sm" }) +
              " shrink-0 bg-emerald-700 text-white hover:bg-emerald-800"
            }
          >
            <Sparkles className="mr-1.5 size-3.5" />
            Mejorar Plan
          </Link>
        </div>
      ) : null}

      {bannerError ? (
        <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <span>{bannerError}</span>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            aria-label="Cerrar alerta"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {/* Create / Edit Client Form */}
      {clientModalMode !== "closed" ? (
        <Card className="border-emerald-600/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {clientModalMode === "create"
                  ? "Registrar Nuevo Contribuyente (RFC)"
                  : "Editar Contribuyente"}
              </CardTitle>
              <CardDescription>
                Validación oficial de RFC (12 o 13 caracteres) y régimen fiscal
                del SAT.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setClientModalMode("closed")}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <form onSubmit={handleSubmitClient}>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rfc-input">RFC</Label>
                  <Input
                    id="rfc-input"
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    placeholder="GIM190521KP4"
                    maxLength={13}
                    className="font-mono uppercase"
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="razon-input">Razón Social / Nombre</Label>
                  <Input
                    id="razon-input"
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                    placeholder="Comercializadora del Centro S.A. de C.V."
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="regimen-select">Régimen Fiscal SAT</Label>
                  <select
                    id="regimen-select"
                    value={regimenFiscal}
                    onChange={(e) => setRegimenFiscal(e.target.value)}
                    className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring"
                  >
                    {SAT_REGIMENES_FISCALES.map((reg) => (
                      <option key={reg.code} value={reg.label}>
                        {reg.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {clientModalMode === "create" ? (
                <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeInitialBank}
                      onChange={(e) => setIncludeInitialBank(e.target.checked)}
                      className="rounded border-input"
                    />
                    Vincular cuenta bancaria inicial (con mapeo CSV automático)
                  </label>

                  {includeInitialBank ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor="init-bank">Banco</Label>
                        <select
                          id="init-bank"
                          value={initBankName}
                          onChange={(e) => setInitBankName(e.target.value)}
                          className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none"
                        >
                          {MEXICAN_BANKS.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="init-last4">Últimos 4 dígitos</Label>
                        <Input
                          id="init-last4"
                          value={initLast4}
                          onChange={(e) =>
                            setInitLast4(
                              e.target.value.replace(/\D/g, "").slice(0, 4)
                            )
                          }
                          placeholder="4821"
                          maxLength={4}
                          className="font-mono"
                          required={includeInitialBank}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="init-curr">Moneda</Label>
                        <select
                          id="init-curr"
                          value={initCurrency}
                          onChange={(e) =>
                            setInitCurrency(
                              e.target.value as "MXN" | "USD" | "EUR"
                            )
                          }
                          className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none"
                        >
                          <option value="MXN">MXN - Peso Mexicano</option>
                          <option value="USD">USD - Dólar</option>
                          <option value="EUR">EUR - Euro</option>
                        </select>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setClientModalMode("closed")}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingClient}
                  className="bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  {savingClient
                    ? "Guardando..."
                    : clientModalMode === "create"
                      ? "Crear Cliente"
                      : "Guardar Cambios"}
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      ) : null}

      {/* Bank Account + CSV Column Mapping Editor */}
      {bankTargetClient ? (
        <Card className="border-emerald-600/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {editingBankId
                  ? "Editar Cuenta Bancaria y Mapeo CSV"
                  : "Agregar Cuenta Bancaria"}
              </CardTitle>
              <CardDescription>
                Contribuyente:{" "}
                <span className="font-mono font-semibold">
                  {bankTargetClient.rfc}
                </span>{" "}
                — {bankTargetClient.razonSocial}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setBankTargetClient(null)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <form onSubmit={handleSubmitBankAccount}>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bank-name">Institución Bancaria</Label>
                  <select
                    id="bank-name"
                    value={bankName}
                    onChange={(e) => handleBankNameChange(e.target.value)}
                    className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none"
                  >
                    {MEXICAN_BANKS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bank-last4">Últimos 4 dígitos</Label>
                  <Input
                    id="bank-last4"
                    value={last4Digits}
                    onChange={(e) =>
                      setLast4Digits(
                        e.target.value.replace(/\D/g, "").slice(0, 4)
                      )
                    }
                    placeholder="9014"
                    maxLength={4}
                    className="font-mono"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bank-curr">Moneda</Label>
                  <select
                    id="bank-curr"
                    value={currency}
                    onChange={(e) =>
                      setCurrency(e.target.value as "MXN" | "USD" | "EUR")
                    }
                    className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Settings2 className="size-4 text-emerald-700" />
                  Configuración de Mapeo CSV / Excel (`columnMappingJson`)
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Delimitador CSV</Label>
                    <select
                      value={mapping.delimiter}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          delimiter: e.target.value as "," | ";" | "\t",
                        })
                      }
                      className="flex h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
                    >
                      <option value=",">Coma (,)</option>
                      <option value=";">Punto y coma (;)</option>
                      <option value={"\t"}>Tabulador</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fila de encabezados</Label>
                    <Input
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
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Formato de fecha</Label>
                    <select
                      value={mapping.dateFormat}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          dateFormat: e.target.value as
                            | "DD/MM/YYYY"
                            | "DD-MMM-YYYY"
                            | "YYYY-MM-DD"
                            | "MM/DD/YYYY",
                        })
                      }
                      className="flex h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="DD-MMM-YYYY">DD-MMM-YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Columna Fecha</Label>
                    <Input
                      value={mapping.columns.fecha}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          columns: { ...mapping.columns, fecha: e.target.value },
                        })
                      }
                      className="font-mono text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Columna Concepto</Label>
                    <Input
                      value={mapping.columns.concepto}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          columns: {
                            ...mapping.columns,
                            concepto: e.target.value,
                          },
                        })
                      }
                      className="font-mono text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Columna Referencia</Label>
                    <Input
                      value={mapping.columns.referencia ?? ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          columns: {
                            ...mapping.columns,
                            referencia: e.target.value,
                          },
                        })
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Columna Cargo / Retiro</Label>
                    <Input
                      value={mapping.columns.cargo ?? ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          columns: { ...mapping.columns, cargo: e.target.value },
                        })
                      }
                      placeholder="Cargo"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Columna Abono / Depósito</Label>
                    <Input
                      value={mapping.columns.abono ?? ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          columns: { ...mapping.columns, abono: e.target.value },
                        })
                      }
                      placeholder="Abono"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Columna Importe único (opc.)
                    </Label>
                    <Input
                      value={mapping.columns.monto ?? ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          columns: { ...mapping.columns, monto: e.target.value },
                        })
                      }
                      placeholder="Importe"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBankTargetClient(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingBank}
                  className="bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  {savingBank ? "Guardando..." : "Guardar Cuenta Bancaria"}
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      ) : null}

      {/* Clients Table */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">
              Cartera de Contribuyentes ({clients.length})
            </CardTitle>
            <CardDescription>
              Administra los RFCs del despacho y configura sus cuentas
              bancarias para la conciliación.
            </CardDescription>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadClients(query);
            }}
            className="flex w-full gap-2 sm:w-80"
          >
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar RFC o razón social..."
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Buscar
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Cargando clientes del despacho...
            </div>
          ) : clients.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No hay clientes registrados con ese criterio. Crea el primer RFC
              arriba.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RFC</TableHead>
                  <TableHead>Contribuyente / Régimen SAT</TableHead>
                  <TableHead>Cuentas Bancarias (Mapeo CSV)</TableHead>
                  <TableHead className="text-right">CFDIs / Movs</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="align-top font-mono text-xs font-semibold">
                      {client.rfc}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Building2 className="size-3.5 shrink-0 text-emerald-700" />
                        <span>{client.razonSocial}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {client.regimenFiscal}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1.5">
                        {client.bankAccounts.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Sin cuentas vinculadas
                          </span>
                        ) : (
                          client.bankAccounts.map((acc) => (
                            <div
                              key={acc.id}
                              className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs"
                            >
                              <span className="flex items-center gap-1.5">
                                <Landmark className="size-3.5 text-emerald-700" />
                                <span className="font-medium">
                                  {acc.bankName}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  •••• {acc.last4Digits}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="h-4 px-1 text-[10px]"
                                >
                                  {acc.currency}
                                </Badge>
                                {acc.columnMappingJson ? (
                                  <Badge
                                    variant="secondary"
                                    className="h-4 px-1 text-[10px] bg-emerald-50 text-emerald-700"
                                  >
                                    CSV listo
                                  </Badge>
                                ) : null}
                              </span>
                              <span className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditBankAccount(client, acc)
                                  }
                                  title="Editar cuenta y mapeo CSV"
                                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                  <Settings2 className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBankAccount(acc.id)}
                                  title="Eliminar cuenta bancaria"
                                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </span>
                            </div>
                          ))
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => openAddBankAccount(client)}
                          className="w-fit text-emerald-700 hover:text-emerald-800"
                        >
                          <CreditCard className="mr-1 size-3" />
                          Agregar cuenta bancaria
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-right font-mono text-xs tabular-nums">
                      <div>{client._count.cfdis} CFDIs</div>
                      <div className="text-muted-foreground">
                        {client._count.bankTransactions} Movs
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <div className="flex justify-end gap-1.5">
                        <Link
                          href={`/dashboard/clients/${client.id}/upload`}
                          className={buttonVariants({
                            variant: "default",
                            size: "xs",
                          }) + " bg-emerald-700 text-white hover:bg-emerald-800"}
                        >
                          <Upload className="mr-1 size-3" />
                          Cargar XML / Banco
                        </Link>
                        <Link
                          href={`/dashboard/clients/${client.id}/reconcile`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "xs",
                          })}
                        >
                          <FileCheck2 className="mr-1 size-3" />
                          Conciliar
                        </Link>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => openEditClient(client)}
                          aria-label={`Editar ${client.rfc}`}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          onClick={() => handleDeleteClient(client)}
                          aria-label={`Eliminar ${client.rfc}`}
                        >
                          <Trash2 className="size-3" />
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
    </div>
  );
}
