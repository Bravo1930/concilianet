import { Suspense } from "react";
import { ClientUploadWorkbench } from "@/components/upload/client-upload-workbench";

async function ClientUploadLoader({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <ClientUploadWorkbench clientId={clientId} />;
}

export default function ClientUploadPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-muted-foreground">
          Cargando módulo de ingesta SAT y bancos...
        </div>
      }
    >
      <ClientUploadLoader params={params} />
    </Suspense>
  );
}
