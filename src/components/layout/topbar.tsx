"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  Calendar,
  CreditCard,
  LogOut,
  Menu,
  UserCheck,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNavContent } from "@/components/layout/app-sidebar";
import { DEMO_FIRM } from "@/lib/demo-data";
import { cn } from "cn";

interface SessionUserInfo {
  name: string;
  email: string;
  role: "ADMIN" | "AUXILIAR";
}

interface SessionOrgInfo {
  name: string;
  plan: string;
}

export function Topbar() {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<SessionUserInfo | null>(null);
  const [org, setOrg] = useState<SessionOrgInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.user) {
          setUser(data.user);
          setOrg(data.organization);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initials = user?.name
    ? user.name
        .split(" ")
        .filter((p) => p.length > 2)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
    : "CS";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur-xs sm:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile Sidebar Drawer */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                aria-label="Abrir menú lateral"
              />
            }
          >
            <Menu className="size-4" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Menú ConciliaSAT</SheetTitle>
            </SheetHeader>
            <SidebarNavContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <Link
          href="/dashboard/clients"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
        >
          <Building2 className="size-4 text-emerald-700" />
          <span className="max-w-[220px] truncate">
            {org?.name ?? DEMO_FIRM.name}
          </span>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {org?.plan ?? "PRO"}
          </Badge>
        </Link>

        <Badge
          variant="outline"
          className="hidden items-center gap-1.5 px-2.5 py-1 text-xs font-medium md:inline-flex"
        >
          <Calendar className="size-3.5 text-muted-foreground" />
          {DEMO_FIRM.periodLabel}
        </Badge>
      </div>

      <div className="flex items-center gap-2.5">
        <Link
          href="/dashboard/clients"
          className={cn(
            buttonVariants({ variant: "default", size: "sm" }),
            "hidden bg-emerald-700 text-white hover:bg-emerald-800 sm:inline-flex"
          )}
        >
          Mis Clientes (RFCs)
        </Link>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Notificaciones fiscales"
          className="relative"
        >
          <Bell className="size-4" />
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-500" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="h-9 gap-2 px-2" />}
          >
            <Avatar size="sm">
              <AvatarFallback className="bg-emerald-700/15 text-xs font-semibold text-emerald-800">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-left text-xs leading-tight md:block">
              <span className="block font-medium text-foreground">
                {user?.name ?? "Sesión Activa"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {user?.role ?? "ADMIN"}
              </span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Sesión del Despacho</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => router.push("/dashboard/team")}>
                <UserCheck className="mr-2 size-4" />
                Equipo y roles
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push("/dashboard/billing")}
              >
                <CreditCard className="mr-2 size-4" />
                Suscripción Stripe
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void handleLogout()}
                className="text-destructive"
              >
                <LogOut className="mr-2 size-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
