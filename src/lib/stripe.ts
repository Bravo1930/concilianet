import Stripe from "stripe";

export type PlanTierId = "FREE" | "INDEPENDIENTE" | "PYME" | "PRO";

export interface PlanDefinition {
  id: "INDEPENDIENTE" | "PYME" | "PRO";
  name: string;
  tagline: string;
  monthlyPriceMxn: number;
  maxRfcs: number;
  maxUsers: number;
  features: string[];
  highlighted?: boolean;
  stripePriceEnvKey: string;
}

export const CONCILIASAT_PLANS: PlanDefinition[] = [
  {
    id: "INDEPENDIENTE",
    name: "Independiente",
    tagline: "Para contadores independientes con cartera inicial",
    monthlyPriceMxn: 599,
    maxRfcs: 10,
    maxUsers: 3,
    stripePriceEnvKey: "STRIPE_PRICE_INDEPENDIENTE",
    features: [
      "Hasta 10 RFCs activos",
      "Conciliación XML 4.0 y REP 2.0",
      "Mapeo CSV/Excel guardado por banco",
      "Exportación a Excel (4 pestañas) y CSV",
      "Hasta 3 usuarios del despacho",
    ],
  },
  {
    id: "PYME",
    name: "Despacho PyME",
    tagline: "Automatización fiscal en 4 niveles para despachos en crecimiento",
    monthlyPriceMxn: 1699,
    maxRfcs: 40,
    maxUsers: 12,
    highlighted: true,
    stripePriceEnvKey: "STRIPE_PRICE_PYME",
    features: [
      "Hasta 40 RFCs activos",
      "Pagos agrupados Subset Sum (1-a-N / N-a-1)",
      "Conciliación multi-divisa (USD ±3%) y tolerancias",
      "Semáforo interactivo y conciliación manual",
      "Hasta 12 usuarios (Admin y Auxiliares)",
    ],
  },
  {
    id: "PRO",
    name: "Firma Pro",
    tagline: "Capacidad extendida para firmas contables multi-equipo",
    monthlyPriceMxn: 4299,
    maxRfcs: 150,
    maxUsers: 40,
    stripePriceEnvKey: "STRIPE_PRICE_PRO",
    features: [
      "Hasta 150 RFCs activos",
      "Todo lo incluido en Despacho PyME",
      "Aprobación supervisada por socio y auxiliares",
      "Múltiples cuentas bancarias y monedas por RFC",
      "Hasta 40 usuarios y soporte prioritario",
    ],
  },
];

export function getPlanConfig(plan: PlanTierId): { maxRfcs: number; name: string } {
  if (plan === "FREE") return { maxRfcs: 3, name: "Prueba Gratuita" };
  const found = CONCILIASAT_PLANS.find((p) => p.id === plan);
  return found
    ? { maxRfcs: found.maxRfcs, name: found.name }
    : { maxRfcs: 3, name: "Prueba Gratuita" };
}

let stripeInstance: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!stripeInstance) {
    stripeInstance = new Stripe(key, {
      typescript: true,
    });
  }
  return stripeInstance;
}
