import { z } from "zod";

/**
 * Expresión regular oficial del RFC en México:
 * - Persona Moral: 3 letras/&/Ñ + 6 dígitos (fecha) + 3 homoclave (12 caracteres)
 * - Persona Física: 4 letras/&/Ñ + 6 dígitos (fecha) + 3 homoclave (13 caracteres)
 */
export const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export const SAT_REGIMENES_FISCALES = [
  { code: "601", label: "601 - General de Ley Personas Morales" },
  { code: "603", label: "603 - Personas Morales con Fines no Lucrativos" },
  { code: "605", label: "605 - Sueldos y Salarios e Ingresos Asimilados" },
  { code: "606", label: "606 - Arrendamiento" },
  { code: "612", label: "612 - Personas Físicas con Actividades Empresariales y Profesionales" },
  { code: "621", label: "621 - Incorporación Fiscal" },
  { code: "625", label: "625 - Régimen de Actividades Empresariales con Ingresos a través de Plataformas" },
  { code: "626", label: "626 - Régimen Simplificado de Confianza (RESICO)" },
] as const;

export const MEXICAN_BANKS = [
  "BBVA México",
  "Santander México",
  "Banorte",
  "Citibanamex",
  "HSBC México",
  "Scotiabank",
  "BanBajío",
  "Inbursa",
  "Otro Banco",
] as const;

export const columnMappingSchema = z.object({
  delimiter: z.enum([",", ";", "\t"]).default(","),
  headerRow: z.number().int().min(1).max(30).default(1),
  dateFormat: z
    .enum(["DD/MM/YYYY", "DD-MMM-YYYY", "YYYY-MM-DD", "MM/DD/YYYY"])
    .default("DD/MM/YYYY"),
  columns: z.object({
    fecha: z.string().trim().min(1, "Columna de fecha requerida"),
    concepto: z.string().trim().min(1, "Columna de concepto requerida"),
    cargo: z.string().trim().optional().default(""),
    abono: z.string().trim().optional().default(""),
    monto: z.string().trim().optional().default(""),
    referencia: z.string().trim().optional().default(""),
  }),
});

export type BankColumnMapping = z.infer<typeof columnMappingSchema>;

export const DEFAULT_BANK_MAPPINGS: Record<string, BankColumnMapping> = {
  "BBVA México": {
    delimiter: ",",
    headerRow: 3,
    dateFormat: "DD/MM/YYYY",
    columns: {
      fecha: "Fecha",
      concepto: "Concepto",
      cargo: "Cargo",
      abono: "Abono",
      monto: "",
      referencia: "Referencia",
    },
  },
  "Santander México": {
    delimiter: ",",
    headerRow: 1,
    dateFormat: "DD/MM/YYYY",
    columns: {
      fecha: "Fecha",
      concepto: "Descripción",
      cargo: "Retiro",
      abono: "Depósito",
      monto: "",
      referencia: "Referencia",
    },
  },
  Banorte: {
    delimiter: ",",
    headerRow: 2,
    dateFormat: "DD-MMM-YYYY",
    columns: {
      fecha: "FECHA",
      concepto: "DESCRIPCION",
      cargo: "CARGOS",
      abono: "ABONOS",
      monto: "",
      referencia: "REFERENCIA",
    },
  },
  Citibanamex: {
    delimiter: ",",
    headerRow: 1,
    dateFormat: "DD/MM/YYYY",
    columns: {
      fecha: "Fecha",
      concepto: "Concepto",
      cargo: "",
      abono: "",
      monto: "Importe",
      referencia: "Autorización",
    },
  },
};

export const rfcSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(RFC_REGEX, "RFC inválido (debe tener 12 o 13 caracteres con formato SAT)");

export const loginSchema = z.object({
  email: z.string().trim().email("Correo electrónico inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const registerFirmSchema = z.object({
  firmName: z.string().trim().min(3, "El nombre del despacho debe tener al menos 3 caracteres"),
  firmRfc: rfcSchema,
  fullName: z.string().trim().min(3, "Ingresa tu nombre completo"),
  email: z.string().trim().email("Correo electrónico inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const bankAccountInputSchema = z.object({
  bankName: z.string().trim().min(2, "Selecciona o ingresa el nombre del banco"),
  last4Digits: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Ingresa exactamente los últimos 4 dígitos de la cuenta"),
  currency: z.enum(["MXN", "USD", "EUR"]).default("MXN"),
  columnMappingJson: columnMappingSchema.optional().nullable(),
});

export const createClientSchema = z.object({
  rfc: rfcSchema,
  razonSocial: z.string().trim().min(3, "La razón social es obligatoria"),
  regimenFiscal: z.string().trim().min(3, "Selecciona un régimen fiscal del SAT"),
  initialBankAccount: bankAccountInputSchema.optional(),
});

export const updateClientSchema = z.object({
  rfc: rfcSchema.optional(),
  razonSocial: z.string().trim().min(3, "La razón social es obligatoria").optional(),
  regimenFiscal: z.string().trim().min(3, "Selecciona un régimen fiscal del SAT").optional(),
});

export const parsedCfdiSchema = z.object({
  uuid: z.string().uuid("UUID de Timbre Fiscal inválido"),
  version: z.string().default("4.0"),
  tipoDeComprobante: z.enum(["I", "E", "P", "N", "T"]),
  direction: z.enum(["EMITIDO", "RECIBIDO"]),
  estatusSat: z.enum(["VIGENTE", "CANCELADO"]).default("VIGENTE"),
  serie: z.string().optional(),
  folio: z.string().optional(),
  fecha: z.string(),
  fechaTimbrado: z.string().optional(),
  rfcEmisor: z.string().min(12),
  nombreEmisor: z.string(),
  rfcReceptor: z.string().min(12),
  nombreReceptor: z.string(),
  formaPago: z.string().optional(),
  metodoPago: z.string().optional(),
  usoCfdi: z.string().optional(),
  moneda: z.string().default("MXN"),
  tipoCambio: z.number().positive().default(1),
  subtotal: z.number().nonnegative(),
  iva: z.number().nonnegative().default(0),
  retenciones: z.number().nonnegative().default(0),
  total: z.number().nonnegative(),
  relatedUuids: z.array(z.string()).default([]),
});

export const parsedBankTransactionSchema = z.object({
  id: z.string(),
  date: z.string(),
  valueDate: z.string().optional(),
  reference: z.string().optional(),
  description: z.string().min(1),
  type: z.enum(["ABONO", "CARGO"]),
  cargo: z.number().nonnegative(),
  abono: z.number().nonnegative(),
  amount: z.number().positive(),
  balance: z.number().optional(),
  currency: z.string().default("MXN"),
  bankName: z.string().optional(),
  externalHash: z.string(),
});

export type ParsedCfdi = z.infer<typeof parsedCfdiSchema>;
export type ParsedBankTransaction = z.infer<typeof parsedBankTransactionSchema>;
