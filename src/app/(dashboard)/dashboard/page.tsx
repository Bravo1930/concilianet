import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  FileCheck2,
  FileText,
  Landmark,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { DEMO_CLIENTS, DEMO_FIRM } from "@/lib/demo-data";
import { cn } from "cn";

export default function DashboardPage() {
  const totalCfdis = DEMO_CLIENTS.reduce((acc, c) => acc + c.cfdisCount, 0);
  const totalAlerts = DEMO_CLIENTS.reduce((acc, c) => acc + c.pendingAlerts, 0);
  const avgRate = Math.round(
    DEMO_CLIENTS.reduce((acc, c) => acc + c.reconciliationRate, 0) /
      DEMO_CLIENTS.length
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Panel del Despacho
          </h1>
          <p className="text-sm text-muted-foreground">
            Resumen fiscal y avance de conciliación bancaria · {DEMO_FIRM.periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {process.env.NODE_ENV !== "production" ? (
            <LoadDemoDataButton />
          ) : null}
          <Link
            href="/dashboard/clients"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Agregar RFC
          </Link>
          <Link
            href="/conciliacion"
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-emerald-700 text-white hover:bg-emerald-800"
            )}
          >
            Conciliar XML vs Banco
            <ArrowUpRight className="ml-1 size-4" />
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              RFCs Activos
            </CardTitle>
            <Building2 className="size-4 text-emerald-700" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {DEMO_CLIENTS.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              De 60 incluidos en Plan {DEMO_FIRM.plan}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              CFDIs 4.0 del Periodo
            </CardTitle>
            <FileText className="size-4 text-emerald-700" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {totalCfdis.toLocaleString("es-MX")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Emitidos, recibidos y REP 2.0
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Tasa de Conciliación
            </CardTitle>
            <CheckCircle2 className="size-4 text-emerald-700" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{avgRate}%</div>
            <Progress value={avgRate} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Alertas Fiscales (PUE)
            </CardTitle>
            <AlertTriangle className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700 tabular-nums dark:text-amber-400">
              {totalAlerts}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              CFDIs PUE sin flujo bancario detectado
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Avance por Cliente */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">
              Estado de Conciliación por Contribuyente
            </CardTitle>
            <CardDescription>
              Control mensual de cierre contable, bancos vinculados y hallazgos
              SAT
            </CardDescription>
          </div>
          <Link
            href="/dashboard/clients"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Ver todos
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RFC</TableHead>
                <TableHead>Razón Social</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead className="text-right">CFDIs</TableHead>
                <TableHead className="w-44">Avance</TableHead>
                <TableHead className="text-right">Alertas</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_CLIENTS.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-mono text-xs font-semibold">
                    {client.rfc}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{client.razonSocial}</div>
                    <div className="text-xs text-muted-foreground">
                      {client.regimenFiscal}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Landmark className="size-3.5" />
                      {client.bankName}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {client.cfdisCount}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={client.reconciliationRate}
                        className="h-1.5 flex-1"
                      />
                      <span className="w-9 text-right font-mono text-xs tabular-nums">
                        {client.reconciliationRate}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {client.pendingAlerts > 5 ? (
                      <Badge variant="destructive" className="font-mono text-xs">
                        {client.pendingAlerts}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-mono text-xs">
                        {client.pendingAlerts}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/conciliacion?rfc=${client.rfc}`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "xs",
                      })}
                    >
                      <FileCheck2 className="mr-1 size-3" />
                      Conciliar
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
