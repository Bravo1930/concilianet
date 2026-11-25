export interface DemoClient {
  id: string;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  email: string;
  cfdisCount: number;
  reconciliationRate: number;
  pendingAlerts: number;
  bankName: string;
}

export interface DemoTeamMember {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "ACCOUNTANT" | "VIEWER";
  assignedClients: number;
  lastActive: string;
  active: boolean;
}

export const DEMO_FIRM = {
  id: "firm_despacho_mx",
  name: "Despacho Fiscal Mendoza & Asociados S.C.",
  rfc: "DFM180412AB9",
  plan: "PRO" as const,
  periodLabel: "Noviembre 2026",
};

export const DEMO_CLIENTS: DemoClient[] = [
  {
    id: "cli_1",
    rfc: "GIM190521KP4",
    razonSocial: "Grupo Industrial Metropolitano S.A. de C.V.",
    regimenFiscal: "601 - General de Ley Personas Morales",
    codigoPostal: "06600",
    email: "tesoreria@gimsa.mx",
    cfdisCount: 418,
    reconciliationRate: 94,
    pendingAlerts: 3,
    bankName: "BBVA México",
  },
  {
    id: "cli_2",
    rfc: "TEC210810MN2",
    razonSocial: "Tecnologías Cloud del Bajío S.A.P.I. de C.V.",
    regimenFiscal: "601 - General de Ley Personas Morales",
    codigoPostal: "37150",
    email: "facturacion@cloudbajio.mx",
    cfdisCount: 276,
    reconciliationRate: 89,
    pendingAlerts: 6,
    bankName: "Santander México",
  },
  {
    id: "cli_3",
    rfc: "LOAR850314QW1",
    razonSocial: "Roberto Lozano Arellano",
    regimenFiscal: "626 - RESICO",
    codigoPostal: "44100",
    email: "rlozano@consultoria.mx",
    cfdisCount: 84,
    reconciliationRate: 98,
    pendingAlerts: 1,
    bankName: "Banorte",
  },
  {
    id: "cli_4",
    rfc: "LOG171102TR8",
    razonSocial: "Logística Refrigerada del Norte S. de R.L.",
    regimenFiscal: "601 - General de Ley Personas Morales",
    codigoPostal: "64000",
    email: "cuentas@lognorte.mx",
    cfdisCount: 612,
    reconciliationRate: 76,
    pendingAlerts: 14,
    bankName: "Citibanamex",
  },
];

export const DEMO_TEAM: DemoTeamMember[] = [
  {
    id: "usr_1",
    name: "C.P. Alejandro Mendoza",
    email: "a.mendoza@despachomendoza.mx",
    role: "OWNER",
    assignedClients: 24,
    lastActive: "En línea ahora",
    active: true,
  },
  {
    id: "usr_2",
    name: "C.P. Sofía Hernández",
    email: "s.hernandez@despachomendoza.mx",
    role: "ADMIN",
    assignedClients: 18,
    lastActive: "Hace 18 min",
    active: true,
  },
  {
    id: "usr_3",
    name: "L.C. Diego Ramírez",
    email: "d.ramirez@despachomendoza.mx",
    role: "ACCOUNTANT",
    assignedClients: 12,
    lastActive: "Hace 2 horas",
    active: true,
  },
  {
    id: "usr_4",
    name: "Valeria Torres (Auditoría)",
    email: "v.torres@despachomendoza.mx",
    role: "VIEWER",
    assignedClients: 8,
    lastActive: "Ayer",
    active: true,
  },
];

/**
 * XML CFDI 4.0 de muestra válidos para probar el parser y motor de conciliación al instante.
 */
export const SAMPLE_CFDI_XML_FILES: Array<{ fileName: string; content: string }> = [
  {
    fileName: "F-1042_Ingreso_GIM190521KP4.xml",
    content: `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="F" Folio="1042" Fecha="2026-11-04T10:25:00" FormaPago="03" SubTotal="45000.00" Moneda="MXN" Total="52200.00" TipoDeComprobante="I" MetodoPago="PUE" LugarExpedicion="06600">
  <cfdi:Emisor Rfc="GIM190521KP4" Nombre="GRUPO INDUSTRIAL METROPOLITANO SA DE CV" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="CME150908RT3" Nombre="COMERCIALIZADORA MEXICANA DEL CENTRO SA DE CV" UsoCFDI="G03" RegimenFiscalReceptor="601" DomicilioFiscalReceptor="03100" />
  <cfdi:Impuestos TotalImpuestosTrasladados="7200.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="45000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="7200.00" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="8A4F12C0-5E2B-4A89-9C11-3F7D20E4A101" FechaTimbrado="2026-11-04T10:25:05" />
  </cfdi:Complemento>
</cfdi:Comprobante>`,
  },
  {
    fileName: "A-889_Gasto_Cloud_GIM190521KP4.xml",
    content: `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="A" Folio="889" Fecha="2026-11-06T14:10:00" FormaPago="03" SubTotal="12500.00" Moneda="MXN" Total="14500.00" TipoDeComprobante="I" MetodoPago="PUE" LugarExpedicion="37150">
  <cfdi:Emisor Rfc="TEC210810MN2" Nombre="TECNOLOGIAS CLOUD DEL BAJIO SAPI DE CV" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="GIM190521KP4" Nombre="GRUPO INDUSTRIAL METROPOLITANO SA DE CV" UsoCFDI="G03" RegimenFiscalReceptor="601" DomicilioFiscalReceptor="06600" />
  <cfdi:Impuestos TotalImpuestosTrasladados="2000.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="12500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="2000.00" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="B91C22E4-77D1-4F31-A022-88E1C902B202" FechaTimbrado="2026-11-06T14:10:12" />
  </cfdi:Complemento>
</cfdi:Comprobante>`,
  },
  {
    fileName: "F-1049_PPD_Logistica.xml",
    content: `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="F" Folio="1049" Fecha="2026-11-09T09:15:00" FormaPago="99" SubTotal="80000.00" Moneda="MXN" Total="92800.00" TipoDeComprobante="I" MetodoPago="PPD" LugarExpedicion="06600">
  <cfdi:Emisor Rfc="GIM190521KP4" Nombre="GRUPO INDUSTRIAL METROPOLITANO SA DE CV" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="LOG171102TR8" Nombre="LOGISTICA REFRIGERADA DEL NORTE S DE RL" UsoCFDI="G01" RegimenFiscalReceptor="601" DomicilioFiscalReceptor="64000" />
  <cfdi:Impuestos TotalImpuestosTrasladados="12800.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="80000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="12800.00" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="C33D45A9-12B4-48E0-8B55-71A09D88C303" FechaTimbrado="2026-11-09T09:15:09" />
  </cfdi:Complemento>
</cfdi:Comprobante>`,
  },
  {
    fileName: "PUE_Sin_Flujo_Renta.xml",
    content: `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="R" Folio="312" Fecha="2026-11-12T16:40:00" FormaPago="03" SubTotal="18000.00" Moneda="MXN" Total="20880.00" TipoDeComprobante="I" MetodoPago="PUE" LugarExpedicion="06600">
  <cfdi:Emisor Rfc="INM080214PL7" Nombre="INMOBILIARIA POLANCO REFORMA SA DE CV" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="GIM190521KP4" Nombre="GRUPO INDUSTRIAL METROPOLITANO SA DE CV" UsoCFDI="G03" RegimenFiscalReceptor="601" DomicilioFiscalReceptor="06600" />
  <cfdi:Impuestos TotalImpuestosTrasladados="2880.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="18000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="2880.00" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="D77E90F1-8A4C-41D2-9F33-44C1209AD404" FechaTimbrado="2026-11-12T16:40:11" />
  </cfdi:Complemento>
</cfdi:Comprobante>`,
  },
];

export const SAMPLE_BANK_CSV = `BBVA MEXICO ESTADO DE CUENTA EMPRESARIAL
RFC: GIM190521KP4
Fecha,Referencia,Concepto,Cargo,Abono,Saldo
05/11/2026,SPEI-99281,SPEI RECIBIDO COMERCIALIZADORA MEXICANA DEL CENTRO FACTURA 1042,,52200.00,312450.00
06/11/2026,TR-44812,PAGO SERVICIOS TECNOLOGIAS CLOUD BAJIO RFC TEC210810MN2 FOLIO 889,14500.00,,297950.00
11/11/2026,SPEI-10492,ABONO PARCIAL LOGISTICA REFRIGERADA DEL NORTE FACT 1049,,46400.00,344350.00
14/11/2026,COM-0092,COMISION MANEJO DE CUENTA EMPRESARIAL BBVA,685.00,,343665.00
`;
