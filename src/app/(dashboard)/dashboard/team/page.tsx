"use client";

import { useEffect, useState } from "react";
import { Mail, Shield, Trash2, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "AUXILIAR";
  createdAt: string;
}

export default function DashboardTeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<"ADMIN" | "AUXILIAR">(
    "AUXILIAR"
  );
  const [currentUserId, setCurrentUserId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "AUXILIAR">("AUXILIAR");
  const [tempPassword, setTempPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function reloadTeam() {
    const res = await fetch("/api/team");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al cargar equipo");
    setMembers(data.members);
    setCurrentUserRole(data.currentUserRole);
    setCurrentUserId(data.currentUserId);
    setOrgName(data.organization?.name ?? "");
  }

  useEffect(() => {
    let active = true;
    fetch("/api/team")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al cargar equipo");
        if (active) {
          setMembers(data.members);
          setCurrentUserRole(data.currentUserRole);
          setCurrentUserId(data.currentUserId);
          setOrgName(data.organization?.name ?? "");
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Error de conexión"
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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          role,
          temporaryPassword: tempPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo agregar al colaborador");
      }

      setName("");
      setEmail("");
      setTempPassword("");
      setSuccessMsg(`Colaborador ${data.member.name} agregado al despacho.`);
      await reloadTeam();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al invitar colaborador"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(
        `/api/team?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar usuario");
      await reloadTeam();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al eliminar colaborador"
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Equipo del Despacho
        </h1>
        <p className="text-sm text-muted-foreground">
          {orgName
            ? `${orgName} · Gestión multi-usuario de administradores y auxiliares contables`
            : "Gestiona los accesos y roles dentro de tu organización."}
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {successMsg ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
          {successMsg}
        </div>
      ) : null}

      {currentUserRole === "ADMIN" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Invitar Auxiliar Contable o Administrador
            </CardTitle>
            <CardDescription>
              El nuevo usuario accederá exclusivamente a los clientes y
              conciliaciones de este despacho.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleInvite}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
            >
              <div className="space-y-1.5">
                <Label htmlFor="team-name">Nombre completo</Label>
                <Input
                  id="team-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="L.C. Sofía Hernández"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="team-email">Correo electrónico</Label>
                <Input
                  id="team-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sofia@despacho.mx"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="team-role">Rol</Label>
                <select
                  id="team-role"
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as "ADMIN" | "AUXILIAR")
                  }
                  className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none"
                >
                  <option value="AUXILIAR">Auxiliar Contable (AUXILIAR)</option>
                  <option value="ADMIN">Administrador (ADMIN)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="team-pass">Contraseña temporal</Label>
                <Input
                  id="team-pass"
                  type="password"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="Mín. 8 caracteres"
                  minLength={8}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-700 text-white hover:bg-emerald-800"
              >
                <UserPlus className="mr-1.5 size-4" />
                {saving ? "Creando..." : "Agregar al equipo"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Miembros del Despacho ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Cargando equipo...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Alta</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          <AvatarFallback className="bg-muted text-xs font-semibold">
                            {m.name
                              .split(" ")
                              .filter((p) => p.length > 2)
                              .slice(0, 2)
                              .map((p) => p[0])
                              .join("")
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {m.name}{" "}
                            {m.id === currentUserId ? (
                              <span className="text-xs text-muted-foreground">
                                (Tú)
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="size-3" />
                            {m.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={m.role === "ADMIN" ? "default" : "outline"}
                        className={
                          m.role === "ADMIN"
                            ? "gap-1 bg-emerald-700 text-white"
                            : "gap-1"
                        }
                      >
                        <Shield className="size-3" />
                        {m.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {m.createdAt.slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-right">
                      {currentUserRole === "ADMIN" &&
                      m.id !== currentUserId ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          onClick={() => void handleRemoveMember(m.id)}
                        >
                          <Trash2 className="mr-1 size-3" />
                          Remover
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
