"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CreditCard,
  FileCheck2,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const DASHBOARD_NAV_ITEMS: NavItem[] = [
  {
    label: "Panel General",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Clientes / RFCs",
    href: "/dashboard/clients",
    icon: Building2,
  },
  {
    label: "Conciliación",
    href: "/conciliacion",
    icon: FileCheck2,
  },
  {
    label: "Equipo",
    href: "/dashboard/team",
    icon: Users,
  },
  {
    label: "Suscripción",
    href: "/dashboard/billing",
    icon: CreditCard,
  },
];

interface SidebarOrgState {
  name: string;
  plan: string;
  maxRfcs: number;
  usedRfcs: number;
  subscriptionStatus: string;
}

export function SidebarNavContent({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [org, setOrg] = useState<SidebarOrgState | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.organization) {
          setOrg(data.organization);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  const rfcPct = org
    ? Math.min(100, Math.round((org.usedRfcs / Math.max(org.maxRfcs, 1)) * 100))
    : 0;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-xs">
          <ShieldCheck className="size-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            ConciliaSAT
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            CFDI 4.0 &amp; Bancos MX
          </span>
        </div>
      </div>

      {/* Firm Context Card */}
      <div className="px-3 pt-4 pb-2">
        <div className="rounded-lg border border-sidebar-border bg-card p-3 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-foreground">
              {org?.name ?? "Despacho Contable"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {org?.subscriptionStatus ?? "ACTIVE"}
            </span>
            <Badge
              variant="secondary"
              className="h-4 px-1.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
            >
              Plan {org?.plan ?? "PRO"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Navegación principal" className="flex-1 space-y-1 px-3 py-3">
        <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Despacho Contable
        </p>
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-700/10 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    isActive
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Quota / Footer */}
      <div className="mt-auto border-t border-sidebar-border p-4">
        <div className="space-y-2 rounded-lg bg-muted/60 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">RFCs del Plan</span>
            <span className="font-mono text-muted-foreground">
              {org ? `${org.usedRfcs} / ${org.maxRfcs}` : "—"}
            </span>
          </div>
          <Progress value={rfcPct} className="h-1.5" />
          <Link
            href="/dashboard/billing"
            className="block text-[11px] font-medium text-emerald-700 hover:underline"
          >
            Administrar plan Stripe →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
      <div className="sticky top-0 h-screen">
        <SidebarNavContent />
      </div>
    </aside>
  );
}
