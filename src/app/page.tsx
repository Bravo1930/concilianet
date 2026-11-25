import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur-xs">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <span className="text-base font-semibold tracking-tight">
                ConciliaSAT
              </span>
              <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
                Para Despachos Contables MX
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Registrar despacho
            </Link>
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "bg-emerald-700 text-white hover:bg-emerald-800"
              )}
            >
              Ir al Panel
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-14 sm:px-6">
        <div className="max-w-3xl space-y-5">
          <Badge
            variant="secondary"
            className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          >
            CFDI 4.0 + REP 2.0 + Estados de Cuenta Bancarios
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            Conciliación fiscal y bancaria automática para despachos contables
            en México.
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            Cruza miles de XML 4.0 del SAT contra movimientos de BBVA, Santander,
            Banorte y Citibanamex en segundos. Detecta facturas PUE sin flujo,
            abonos parciales PPD y movimientos no deducibles antes del cierre
            mensual.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/conciliacion"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-emerald-700 text-white hover:bg-emerald-800"
              )}
            >
              Probar Motor de Conciliación
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Explorar Panel del Despacho
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <FileText className="mb-2 size-5 text-emerald-700" />
              <CardTitle className="text-base">
                Lectura masiva CFDI 4.0
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Extrae UUID, RFC Emisor/Receptor, IVA trasladado y retenido,
              método PUE/PPD y complementos de pago REP 2.0.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CheckCircle2 className="mb-2 size-5 text-emerald-700" />
              <CardTitle className="text-base">
                Cruce inteligente multi-criterio
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Puntaje de confianza por monto, ventana de fechas, folio y
              coincidencia de RFC o razón social en referencias SPEI.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <FileSpreadsheet className="mb-2 size-5 text-emerald-700" />
              <CardTitle className="text-base">
                Papeles de trabajo en Excel
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Exporta reportes ejecutivos listos para revisión de socios,
              cálculo de IVA y auditorías del SAT por cada RFC cliente.
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="size-4" />
          <span>
            Diseñado para arquitectura multi-tenant (PostgreSQL + Prisma ORM +
            Stripe).
          </span>
        </div>
      </main>
    </div>
  );
}
