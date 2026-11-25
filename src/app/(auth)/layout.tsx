import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-slate-950 p-10 text-slate-100 lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <ShieldCheck className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            ConciliaSAT
          </span>
        </Link>

        <div className="max-w-md space-y-4">
          <p className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
            Infraestructura Contable B2B
          </p>
          <h2 className="text-3xl font-semibold leading-tight">
            Cierra la conciliación fiscal de tus clientes en minutos, no en días.
          </h2>
          <p className="text-sm leading-relaxed text-slate-400">
            Centraliza los XML 4.0 del SAT y estados de cuenta bancarios de cada
            RFC en un solo espacio de trabajo auditable para todo tu despacho.
          </p>
        </div>

        <p className="text-xs text-slate-500">
          ConciliaSAT · México · CFDI 4.0 &amp; Bancos
        </p>
      </div>

      <div className="flex flex-col items-center justify-center bg-background p-6 sm:p-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
