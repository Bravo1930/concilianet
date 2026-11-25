"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CreditCard,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CONCILIASAT_PLANS, type PlanTierId } from "@/lib/stripe";
import { cn } from "cn";

interface OrgBillingInfo {
  id: string;
  name: string;
  plan: PlanTierId;
  maxRfcs: number;
  usedRfcs: number;
  subscriptionStatus: string;
  hasStripeCustomer: boolean;
}

export default function DashboardBillingPage() {
  const [org, setOrg] = useState<OrgBillingInfo | null>(null);
  const [userRole, setUserRole] = useState<"ADMIN" | "AUXILIAR">("AUXILIAR");
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [banner, setBanner] = useState<{
    type: "info" | "error" | "success";
    text: string;
  } | null>(null);

  async function refreshBilling() {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al consultar plan");
    setOrg(data.organization);
    setUserRole(data.user.role);
  }

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const checkoutState = params.get("checkout");

    fetch("/api/auth/me")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al cargar suscripción");
        if (active) {
          setOrg(data.organization);
          setUserRole(data.user.role);
          if (checkoutState === "success") {
            setBanner({
              type: "success",
              text: "Pago confirmado en Stripe. Tu suscripción y límite de RFCs se han actualizado.",
            });
          } else if (checkoutState === "canceled") {
            setBanner({
              type: "info",
              text: "Checkout cancelado. Tu plan actual permanece sin cambios.",
            });
          }
        }
      })
      .catch((err) => {
        if (active) {
          setBanner({
            type: "error",
            text: err instanceof Error ? err.message : "Error de conexión",
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSelectPlan(
    planId: "INDEPENDIENTE" | "PYME" | "PRO",
    simulateDemo = false
  ) {
    setBusyPlan(planId);
    setBanner(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, simulateDemo }),
      });
      const data = await res.json();

      if (res.status === 400 && data.mode === "unconfigured" && !simulateDemo) {
        // Reintentar en modo local demo si no hay STRIPE_SECRET_KEY configurado
        const demoRes = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, simulateDemo: true }),
        });
        const demoData = await demoRes.json();
        if (!demoRes.ok) {
          throw new Error(demoData.error || "No se pudo cambiar de plan");
        }
        await refreshBilling();
        setBanner({
          type: "success",
          text:
            demoData.message ||
            "Plan actualizado en modo local (sin STRIPE_SECRET_KEY).",
        });
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Error al iniciar Checkout de Stripe");
      }

      if (data.url) {
        window.location.assign(data.url);
      } else {
        await refreshBilling();
        setBanner({
          type: "success",
          text: data.message || "Plan actualizado correctamente.",
        });
      }
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Error al procesar cambio",
      });
    } finally {
      setBusyPlan(null);
    }
  }

  async function handleOpenPortal() {
    setOpeningPortal(true);
    setBanner(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || "No se pudo abrir el portal de Stripe"
        );
      }
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Error al abrir portal",
      });
    } finally {
      setOpeningPortal(false);
    }
  }

  const rfcPct = org
    ? Math.min(100, Math.round((org.usedRfcs / Math.max(org.maxRfcs, 1)) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Suscripción y Facturación (Stripe)
          </h1>
          <p className="text-sm text-muted-foreground">
            Administra el plan B2B de tu despacho, cuota de RFCs y método de
            pago.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={openingPortal || userRole !== "ADMIN"}
          onClick={() => void handleOpenPortal()}
        >
          <CreditCard className="mr-1.5 size-4" />
          {openingPortal ? "Abriendo Portal..." : "Portal de Cliente Stripe"}
          <ExternalLink className="ml-1.5 size-3.5" />
        </Button>
      </div>

      {banner ? (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-xs font-medium",
            banner.type === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : banner.type === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-border bg-muted text-foreground"
          )}
        >
          {banner.text}
        </div>
      ) : null}

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Cargando estado de suscripción...
        </div>
      ) : org ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {org.name} · Plan {org.plan}
                </CardTitle>
                <CardDescription>
                  Control de límite de contribuyentes (RFCs) activos en la
                  organización
                </CardDescription>
              </div>
              <Badge
                className={cn(
                  org.subscriptionStatus === "ACTIVE" ||
                    org.subscriptionStatus === "TRIALING"
                    ? "bg-emerald-700 text-white"
                    : "bg-destructive text-white"
                )}
              >
                {org.subscriptionStatus}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(org.subscriptionStatus === "PAST_DUE" ||
              org.subscriptionStatus === "CANCELED" ||
              org.usedRfcs >= org.maxRfcs) ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="size-4 shrink-0 text-amber-700" />
                <span>
                  {org.usedRfcs >= org.maxRfcs
                    ? `Alcanzaste el límite de ${org.maxRfcs} RFCs de tu plan ${org.plan}. Selecciona un plan superior abajo para seguir agregando clientes.`
                    : `Tu suscripción está en estatus ${org.subscriptionStatus}. Regulariza el pago o elige un plan para habilitar nuevas altas de RFC.`}
                </span>
              </div>
            ) : null}

            <div className="space-y-1.5 rounded-lg border border-border p-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  RFCs utilizados en el despacho
                </span>
                <span className="font-mono font-semibold">
                  {org.usedRfcs} / {org.maxRfcs} RFCs ({rfcPct}%)
                </span>
              </div>
              <Progress value={rfcPct} className="h-2" />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 3 Planes Stripe */}
      <div className="grid gap-5 lg:grid-cols-3">
        {CONCILIASAT_PLANS.map((plan) => {
          const isCurrent = org?.plan === plan.id;
          return (
            <Card
              key={plan.id}
              className={cn(
                "flex flex-col",
                plan.highlighted &&
                  "border-emerald-600 ring-1 ring-emerald-600/30"
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {plan.highlighted ? (
                    <Badge
                      variant="secondary"
                      className="gap-1 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    >
                      <Sparkles className="size-3" />
                      Más Popular
                    </Badge>
                  ) : null}
                </div>
                <CardDescription>{plan.tagline}</CardDescription>
                <div className="pt-3">
                  <span className="text-3xl font-bold tracking-tight tabular-nums">
                    ${plan.monthlyPriceMxn.toLocaleString("es-MX")}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">
                    MXN / mes
                  </span>
                </div>
                <div className="pt-1 font-mono text-xs font-semibold text-emerald-700">
                  Hasta {plan.maxRfcs} RFCs activos
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-2.5">
                {plan.features.map((feat) => (
                  <div key={feat} className="flex items-start gap-2 text-xs">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-700" />
                    <span>{feat}</span>
                  </div>
                ))}
              </CardContent>

              <CardFooter>
                <Button
                  type="button"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={
                    isCurrent ||
                    busyPlan !== null ||
                    userRole !== "ADMIN"
                  }
                  onClick={() => void handleSelectPlan(plan.id)}
                  className={cn(
                    "w-full",
                    !isCurrent &&
                      "bg-emerald-700 text-white hover:bg-emerald-800"
                  )}
                >
                  {isCurrent
                    ? "Plan Actual"
                    : busyPlan === plan.id
                      ? "Procesando..."
                      : userRole !== "ADMIN"
                        ? "Solo Administrador"
                        : `Elegir ${plan.name}`}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
