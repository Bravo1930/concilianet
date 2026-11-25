"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema } from "@/lib/validators/sat";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("a.mendoza@despachomendoza.mx");
  const [password, setPassword] = useState("Concilia2026!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function performLogin(targetEmail: string, targetPassword: string) {
    setError(null);
    const validated = loginSchema.safeParse({
      email: targetEmail,
      password: targetPassword,
    });
    if (!validated.success) {
      setError(
        validated.error.issues[0]?.message ?? "Verifica tus credenciales"
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          password: targetPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo iniciar sesión");
      }

      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get("redirect") || "/dashboard/clients";
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al iniciar sesión"
      );
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performLogin(email, password);
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="space-y-1.5">
        <div className="mb-1 flex items-center gap-2 lg:hidden">
          <div className="flex size-8 items-center justify-center rounded-md bg-emerald-700 text-white">
            <ShieldCheck className="size-4" />
          </div>
          <span className="font-semibold">ConciliaSAT</span>
        </div>
        <CardTitle className="text-xl">Iniciar sesión en tu despacho</CardTitle>
        <CardDescription>
          Accede con tu cuenta segura para gestionar los RFCs y conciliaciones
          de tu despacho.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <div className="relative">
              <Mail className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contador@despacho.mx"
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Lock className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9"
                required
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-2.5 pt-2">
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
          >
            {loading ? "Validando sesión..." : "Entrar al despacho"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() =>
              void performLogin(
                "a.mendoza@despachomendoza.mx",
                "Concilia2026!"
              )
            }
            className="w-full"
          >
            <Sparkles className="mr-1.5 size-4 text-emerald-700" />
            Entrar con Despacho Demo
          </Button>
          <p className="pt-1 text-center text-xs text-muted-foreground">
            ¿Tu despacho aún no tiene cuenta?{" "}
            <Link
              href="/register"
              className="font-medium text-emerald-700 hover:underline"
            >
              Registra tu despacho
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
