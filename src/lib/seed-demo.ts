import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { computeBankTransactionHash } from "@/lib/parsers/bankParser";
import { DEFAULT_BANK_MAPPINGS } from "@/lib/validators/sat";

export interface SeedDemoResult {
  organizationId: string;
  organizationName: string;
  adminEmail: string;
  clientId: string;
  clientRfc: string;
  clientName: string;
  bankAccountId: string;
  month: number;
  year: number;
  counts: {
    pueCfdis: number;
    ppdCfdis: number;
    repCfdis: number;
    subsetCfdis: number;
    usdCfdis: number;
    unmatchedCfdis: number;
    bankTransactions: number;
  };
}

function orgHexTag(orgId: string): string {
  return createHash("md5").update(orgId).digest("hex").slice(0, 4).toUpperCase();
}

function buildDemoUuid(orgTag: string, seq: number): string {
  const num = String(seq).padStart(8, "0");
  return `CAZ0${orgTag}-0000-4000-8000-${num}0000`;
}

/**
 * Siembra un despacho de prueba (si no se especifica targetOrganizationId),
 * el cliente ficticio "COMERCIALIZADORA AZCAPOTZALCO SA DE CV" (CAZ200514AB9)
 * y un paquete realista en Noviembre 2026 con los 3 colores del semáforo:
 * - 5 CFDIs PUE + 5 movimientos bancarios exactos (Verde AUTO)
 * - 1 CFDI PPD + 2 REP 2.0 + 2 depósitos parciales (Verde AUTO)
 * - 3 CFDIs del mismo cliente + 1 transferencia agrupada (Amarillo SUBSET_SUM)
 * - 1 CFDI en USD + 1 cargo en MXN con variación cambiaria (Amarillo TOLERANCE)
 * - 2 CFDIs sin pago (Rojo Pendientes SAT) + 2 cargos sin XML (Rojo Sin Factura)
 */
export async function seedDemoPackage(
  targetOrganizationId?: string
): Promise<SeedDemoResult> {
  let orgId = targetOrganizationId;
  let orgName = "";
  const adminEmail = "demo@azcapotzalco.mx";

  if (orgId) {
    const existingOrg = await prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!existingOrg) {
      throw new Error("Organización destino no encontrada.");
    }
    orgName = existingOrg.name;
    // Asegurar capacidad suficiente si es un despacho FREE de pruebas
    if (existingOrg.maxRfcs < 10) {
      await prisma.organization.update({
        where: { id: existingOrg.id },
        data: { maxRfcs: 10 },
      });
    }
  } else {
    const demoOrg = await prisma.organization.upsert({
      where: { id: "org_demo_azcapotzalco" },
      update: {
        subscriptionStatus: "ACTIVE",
        maxRfcs: 40,
      },
      create: {
        id: "org_demo_azcapotzalco",
        name: "Despacho Demo Azcapotzalco & Asociados S.C.",
        plan: "PYME",
        maxRfcs: 40,
        subscriptionStatus: "ACTIVE",
      },
    });
    orgId = demoOrg.id;
    orgName = demoOrg.name;

    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        passwordHash: hashPassword("Concilia2026!"),
        name: "C.P. Ricardo Azcapotzalco",
        role: "ADMIN",
        organizationId: demoOrg.id,
      },
    });
  }

  const clientRfc = "CAZ200514AB9";
  const clientName = "COMERCIALIZADORA AZCAPOTZALCO SA DE CV";
  const tag = orgHexTag(orgId);

  const client = await prisma.client.upsert({
    where: {
      organizationId_rfc: {
        organizationId: orgId,
        rfc: clientRfc,
      },
    },
    update: {
      razonSocial: clientName,
      regimenFiscal: "601 - General de Ley Personas Morales",
    },
    create: {
      organizationId: orgId,
      rfc: clientRfc,
      razonSocial: clientName,
      regimenFiscal: "601 - General de Ley Personas Morales",
    },
  });

  // Limpiar datos previos de este cliente demo para permitir re-ejecución limpia
  await prisma.$transaction(async (tx) => {
    await tx.reconciliation.deleteMany({ where: { clientId: client.id } });
    await tx.bankTransaction.deleteMany({ where: { clientId: client.id } });
    await tx.cfdi.deleteMany({ where: { clientId: client.id } });
  });

  let bankAccount = await prisma.bankAccount.findFirst({
    where: { clientId: client.id, last4Digits: "7420" },
  });

  if (!bankAccount) {
    bankAccount = await prisma.bankAccount.create({
      data: {
        clientId: client.id,
        bankName: "BBVA México",
        last4Digits: "7420",
        currency: "MXN",
        columnMappingJson:
          DEFAULT_BANK_MAPPINGS["BBVA México"] as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const d = (day: number) =>
    new Date(Date.UTC(2026, 10, day, 12, 0, 0, 0)); // Noviembre 2026
  const isoDay = (day: number) => `2026-11-${String(day).padStart(2, "0")}`;

  // --------------------------------------------------------------------------
  // 1. 5 CFDIs PUE + 5 movimientos bancarios exactos (Verde AUTO)
  // --------------------------------------------------------------------------
  const pueItems = [
    {
      seq: 1,
      dayCfdi: 3,
      dayBank: 3,
      dir: "EMITIDO" as const,
      thirdRfc: "FVC140210AA1",
      thirdName: "FARMACIAS DEL VALLE CENTRAL SA DE CV",
      total: 17400.0,
      concepto: "SPEI RECIBIDO FARMACIAS DEL VALLE CENTRAL FVC140210AA1",
    },
    {
      seq: 2,
      dayCfdi: 5,
      dayBank: 6,
      dir: "EMITIDO" as const,
      thirdRfc: "BIN160822BB2",
      thirdName: "BODEGAS INDUSTRIALES DEL NORTE SA DE CV",
      total: 34800.0,
      concepto: "TRANSFERENCIA SPEI BODEGAS INDUSTRIALES NORTE",
    },
    {
      seq: 3,
      dayCfdi: 7,
      dayBank: 7,
      dir: "EMITIDO" as const,
      thirdRfc: "CME150908RT3",
      thirdName: "CONSTRUCTORA METROPOLITANA SA DE CV",
      total: 11600.0,
      concepto: "SPEI RECIBIDO CONSTRUCTORA METROPOLITANA",
    },
    {
      seq: 4,
      dayCfdi: 8,
      dayBank: 9,
      dir: "RECIBIDO" as const,
      thirdRfc: "TLB170415CC4",
      thirdName: "TRANSPORTES LOGISTICOS DEL BAJIO SA DE CV",
      total: 6960.0,
      concepto: "SPEI PAGO TRANSPORTES LOGISTICOS BAJIO",
    },
    {
      seq: 5,
      dayCfdi: 10,
      dayBank: 10,
      dir: "RECIBIDO" as const,
      thirdRfc: "TEM190119DD5",
      thirdName: "TELECOMUNICACIONES EMPRESARIALES MX SA",
      total: 4640.0,
      concepto: "CARGO SPEI TELECOMUNICACIONES EMPRESARIALES MX",
    },
  ];

  for (const item of pueItems) {
    const subtotal = Number((item.total / 1.16).toFixed(2));
    await prisma.cfdi.create({
      data: {
        clientId: client.id,
        uuid: buildDemoUuid(tag, item.seq),
        tipoComprobante: "I",
        metodoPago: "PUE",
        formaPago: "03",
        fechaEmision: d(item.dayCfdi),
        rfcEmisor: item.dir === "EMITIDO" ? clientRfc : item.thirdRfc,
        nombreEmisor: item.dir === "EMITIDO" ? clientName : item.thirdName,
        rfcReceptor: item.dir === "EMITIDO" ? item.thirdRfc : clientRfc,
        nombreReceptor: item.dir === "EMITIDO" ? item.thirdName : clientName,
        subtotal,
        total: item.total,
        moneda: "MXN",
        tipoCambio: 1,
        saldoPendiente: item.total,
        direccion: item.dir,
        status: "PENDIENTE",
      },
    });

    await prisma.bankTransaction.create({
      data: {
        bankAccountId: bankAccount.id,
        clientId: client.id,
        fecha: d(item.dayBank),
        concepto: item.concepto,
        monto: item.total,
        tipo: item.dir === "EMITIDO" ? "ABONO" : "CARGO",
        hashUnico: computeBankTransactionHash({
          fechaIso: isoDay(item.dayBank),
          concepto: item.concepto,
          monto: item.total,
          bankAccountId: bankAccount.id,
        }),
        status: "SIN_FACTURA",
      },
    });
  }

  // --------------------------------------------------------------------------
  // 2. 1 CFDI PPD + 2 REP 2.0 + 2 depósitos parciales (Verde AUTO)
  // --------------------------------------------------------------------------
  const ppdUuid = buildDemoUuid(tag, 6);
  await prisma.cfdi.create({
    data: {
      clientId: client.id,
      uuid: ppdUuid,
      tipoComprobante: "I",
      metodoPago: "PPD",
      formaPago: "99",
      fechaEmision: d(2),
      rfcEmisor: clientRfc,
      nombreEmisor: clientName,
      rfcReceptor: "DAS180611EE6",
      nombreReceptor: "DISTRIBUIDORA ANAHUAC DEL SUR SA DE CV",
      subtotal: 50000.0,
      total: 58000.0,
      moneda: "MXN",
      tipoCambio: 1,
      saldoPendiente: 58000.0,
      direccion: "EMITIDO",
      status: "PENDIENTE",
    },
  });

  const repPayments = [
    {
      seq: 7,
      day: 11,
      parcialidad: 1,
      monto: 29000.0,
      saldoAnt: 58000.0,
      saldoIns: 29000.0,
      concepto: "SPEI PARCIALIDAD 1 DISTRIBUIDORA ANAHUAC SUR",
    },
    {
      seq: 8,
      day: 20,
      parcialidad: 2,
      monto: 29000.0,
      saldoAnt: 29000.0,
      saldoIns: 0.0,
      concepto: "SPEI PARCIALIDAD 2 FINIQUITO DISTRIBUIDORA ANAHUAC",
    },
  ];

  for (const rep of repPayments) {
    await prisma.cfdi.create({
      data: {
        clientId: client.id,
        uuid: buildDemoUuid(tag, rep.seq),
        tipoComprobante: "P",
        metodoPago: null,
        formaPago: null,
        fechaEmision: d(rep.day),
        rfcEmisor: clientRfc,
        nombreEmisor: clientName,
        rfcReceptor: "DAS180611EE6",
        nombreReceptor: "DISTRIBUIDORA ANAHUAC DEL SUR SA DE CV",
        subtotal: 0,
        total: 0,
        moneda: "XXX",
        tipoCambio: 1,
        saldoPendiente: rep.monto,
        direccion: "EMITIDO",
        status: "PENDIENTE",
        relatedUuidsJson: {
          pagos: [
            {
              fechaPago: `${isoDay(rep.day)}T12:00:00`,
              formaDePagoP: "03",
              monedaP: "MXN",
              tipoCambioP: 1,
              monto: rep.monto,
              doctosRelacionados: [
                {
                  idDocumento: ppdUuid,
                  numParcialidad: rep.parcialidad,
                  impSaldoAnt: rep.saldoAnt,
                  impPagado: rep.monto,
                  impSaldoInsoluto: rep.saldoIns,
                },
              ],
            },
          ],
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.bankTransaction.create({
      data: {
        bankAccountId: bankAccount.id,
        clientId: client.id,
        fecha: d(rep.day),
        concepto: rep.concepto,
        monto: rep.monto,
        tipo: "ABONO",
        hashUnico: computeBankTransactionHash({
          fechaIso: isoDay(rep.day),
          concepto: rep.concepto,
          monto: rep.monto,
          bankAccountId: bankAccount.id,
        }),
        status: "SIN_FACTURA",
      },
    });
  }

  // --------------------------------------------------------------------------
  // 3. 3 CFDIs del mismo cliente + 1 transferencia agrupada (Amarillo SUBSET_SUM)
  // --------------------------------------------------------------------------
  const subsetInvoices = [
    { seq: 9, day: 4, total: 3200.0 },
    { seq: 10, day: 6, total: 4800.0 },
    { seq: 11, day: 9, total: 7000.0 },
  ];

  for (const inv of subsetInvoices) {
    await prisma.cfdi.create({
      data: {
        clientId: client.id,
        uuid: buildDemoUuid(tag, inv.seq),
        tipoComprobante: "I",
        metodoPago: "PPD",
        formaPago: "99",
        fechaEmision: d(inv.day),
        rfcEmisor: clientRfc,
        nombreEmisor: clientName,
        rfcReceptor: "SDC180312KL5",
        nombreReceptor: "SUPERMERCADOS DEL CENTRO SA DE CV",
        subtotal: Number((inv.total / 1.16).toFixed(2)),
        total: inv.total,
        moneda: "MXN",
        tipoCambio: 1,
        saldoPendiente: inv.total,
        direccion: "EMITIDO",
        status: "PENDIENTE",
      },
    });
  }

  const groupedConcept = "SPEI RECIBIDO PAGO AGRUPADO SUPERMERCADOS CENTRO";
  await prisma.bankTransaction.create({
    data: {
      bankAccountId: bankAccount.id,
      clientId: client.id,
      fecha: d(14),
      concepto: groupedConcept,
      monto: 15000.0,
      tipo: "ABONO",
      hashUnico: computeBankTransactionHash({
        fechaIso: isoDay(14),
        concepto: groupedConcept,
        monto: 15000.0,
        bankAccountId: bankAccount.id,
      }),
      status: "SIN_FACTURA",
    },
  });

  // --------------------------------------------------------------------------
  // 4. 1 CFDI en USD con cargo en MXN (Amarillo TOLERANCE ±3%)
  // --------------------------------------------------------------------------
  await prisma.cfdi.create({
    data: {
      clientId: client.id,
      uuid: buildDemoUuid(tag, 12),
      tipoComprobante: "I",
      metodoPago: "PUE",
      formaPago: "04",
      fechaEmision: d(16),
      rfcEmisor: "XEXX010101000",
      nombreEmisor: "CLOUD HOSTING GLOBAL INC",
      rfcReceptor: clientRfc,
      nombreReceptor: clientName,
      subtotal: 500.0,
      total: 500.0,
      moneda: "USD",
      tipoCambio: 20.0,
      saldoPendiente: 500.0,
      direccion: "RECIBIDO",
      status: "PENDIENTE",
    },
  });

  const usdConcept = "CARGO INTERNACIONAL CLOUD HOSTING GLOBAL USD TC";
  await prisma.bankTransaction.create({
    data: {
      bankAccountId: bankAccount.id,
      clientId: client.id,
      fecha: d(17),
      concepto: usdConcept,
      monto: 10180.0, // +1.8% sobre $10,000 MXN teórico (dentro de ±3%)
      tipo: "CARGO",
      hashUnico: computeBankTransactionHash({
        fechaIso: isoDay(17),
        concepto: usdConcept,
        monto: 10180.0,
        bankAccountId: bankAccount.id,
      }),
      status: "SIN_FACTURA",
    },
  });

  // --------------------------------------------------------------------------
  // 5. 2 CFDIs sin pago (Rojo: Pendientes SAT) + 2 cargos sin XML (Rojo: Sin Factura)
  // --------------------------------------------------------------------------
  await prisma.cfdi.create({
    data: {
      clientId: client.id,
      uuid: buildDemoUuid(tag, 13),
      tipoComprobante: "I",
      metodoPago: "PUE",
      formaPago: "03",
      fechaEmision: d(21),
      rfcEmisor: clientRfc,
      nombreEmisor: clientName,
      rfcReceptor: "PEN150505GG7",
      nombreReceptor: "PAPELERIA Y EQUIPOS DEL NORTE SA DE CV",
      subtotal: 7500.0,
      total: 8700.0,
      moneda: "MXN",
      tipoCambio: 1,
      saldoPendiente: 8700.0,
      direccion: "EMITIDO",
      status: "PENDIENTE",
    },
  });

  await prisma.cfdi.create({
    data: {
      clientId: client.id,
      uuid: buildDemoUuid(tag, 14),
      tipoComprobante: "I",
      metodoPago: "PPD",
      formaPago: "99",
      fechaEmision: d(22),
      rfcEmisor: "MIP190909HH8",
      nombreEmisor: "MANTENIMIENTO INDUSTRIAL DEL PONIENTE SA",
      rfcReceptor: clientRfc,
      nombreReceptor: clientName,
      subtotal: 10732.76,
      total: 12450.0,
      moneda: "MXN",
      tipoCambio: 1,
      saldoPendiente: 12450.0,
      direccion: "RECIBIDO",
      status: "PENDIENTE",
    },
  });

  const unbilledCargos = [
    {
      day: 19,
      monto: 1350.0,
      concepto: "CONSUMO GASOLINERA SHELL PERIFERICO SIN CFDI",
    },
    {
      day: 23,
      monto: 980.0,
      concepto: "RESTAURANTE LA CASA DE LOS MARISCOS CDMX",
    },
  ];

  for (const cargo of unbilledCargos) {
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: bankAccount.id,
        clientId: client.id,
        fecha: d(cargo.day),
        concepto: cargo.concepto,
        monto: cargo.monto,
        tipo: "CARGO",
        hashUnico: computeBankTransactionHash({
          fechaIso: isoDay(cargo.day),
          concepto: cargo.concepto,
          monto: cargo.monto,
          bankAccountId: bankAccount.id,
        }),
        status: "SIN_FACTURA",
      },
    });
  }

  return {
    organizationId: orgId,
    organizationName: orgName,
    adminEmail,
    clientId: client.id,
    clientRfc,
    clientName,
    bankAccountId: bankAccount.id,
    month: 11,
    year: 2026,
    counts: {
      pueCfdis: 5,
      ppdCfdis: 1,
      repCfdis: 2,
      subsetCfdis: 3,
      usdCfdis: 1,
      unmatchedCfdis: 2,
      bankTransactions: 11,
    },
  };
}
