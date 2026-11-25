import { Suspense } from "react";
import { ClientReconcileWorkbench } from "@/components/reconcile/client-reconcile-workbench";

async function ReconcileLoader({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <ClientReconcileWorkbench clientId={clientId} />;
}

export default function ClientReconcilePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-muted-foreground">
          Cargando tablero de conciliación...
        </div>
      }
    >
      <ReconcileLoader params={params} />
    </Suspense>
  );
}
