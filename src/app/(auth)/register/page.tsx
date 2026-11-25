"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ShieldCheck } from "lucide-react";
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

export default function RegisterPage() {
  const router = useRouter();
  const [firmName, setFirmName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (firmName.trim().length < 3) {
      setError("El nombre del despacho debe tener al menos 3 caracteres.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmName,
          fullName,
          email,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo registrar el despacho");
      }

      router.push("/dashboard/clients");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al crear el despacho"
      );
      setLoading(false);
    }
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
        <CardTitle className="text-xl">Registrar Despacho Contable</CardTitle>
        <CardDescription>
          Crea tu organización multi-tenant y usuario Administrador (ADMIN).
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-3.5">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="firmName">Nombre del Despacho</Label>
            <div className="relative">
              <Building2 className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                id="firmName"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                placeholder="Despacho Fiscal Rivera & Asociados S.C."
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fullName">Nombre del Socio / Administrador</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="C.P. Laura Rivera"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-email">Correo electrónico</Label>
            <Input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@despacho.mx"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-password">Contraseña (mín. 8 caracteres)</Label>
            <Input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-3">
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
          >
            {loading ? "Creando despacho..." : "Crear cuenta de despacho"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/login"
              className="font-medium text-emerald-700 hover:underline"
            >
              Inicia sesión
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
