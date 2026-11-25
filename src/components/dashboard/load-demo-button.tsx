"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadDemoDataButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSeedDemo() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudieron cargar los datos demo");
      }
      router.push(`/dashboard/clients/${data.clientId}/reconcile`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error cargando datos demo"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void handleSeedDemo()}
        className="border-amber-500/50 bg-amber-50/70 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200"
      >
        <DatabaseZap className="mr-1.5 size-4 text-amber-600" />
        {loading ? "Cargando paquete demo..." : "Cargar Datos Demo"}
      </Button>
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
