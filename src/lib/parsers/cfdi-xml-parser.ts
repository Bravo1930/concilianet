import { XMLParser } from "fast-xml-parser";
import { parsedCfdiSchema, type ParsedCfdi } from "@/lib/validators/sat";

const cfdiXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseAttributeValue: false,
  trimValues: true,
});

type XmlRecord = Record<string, unknown>;

function asRecord(val: unknown): XmlRecord | undefined {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as XmlRecord;
  }
  return undefined;
}

function asArray<T = XmlRecord>(val: unknown): T[] {
  if (!val) return [];
  return Array.isArray(val) ? (val as T[]) : [val as T];
}

function attr(node: XmlRecord | undefined, key: string): string | undefined {
  if (!node) return undefined;
  const raw = node[`@_${key}`];
  if (raw === undefined || raw === null) return undefined;
  return String(raw).trim();
}

function toNumber(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface CfdiParseResult {
  success: true;
  cfdi: ParsedCfdi;
}

export interface CfdiParseError {
  success: false;
  error: string;
}

/**
 * Parsea un XML CFDI 4.0 (o 3.3 compatible) del SAT usando fast-xml-parser.
 * Clasifica automáticamente EMITIDO vs RECIBIDO respecto al RFC del cliente.
 */
export function parseCfdiXml(
  xmlContent: string,
  clientRfc?: string
): CfdiParseResult | CfdiParseError {
  try {
    const parsed = cfdiXmlParser.parse(xmlContent) as XmlRecord;
    const comprobante = asRecord(parsed?.Comprobante);

    if (!comprobante) {
      return {
        success: false,
        error: "No se encontró el nodo raíz cfdi:Comprobante en el XML.",
      };
    }

    const emisor = asRecord(comprobante.Emisor);
    const receptor = asRecord(comprobante.Receptor);
    const complementoNodes = asArray(comprobante.Complemento);

    let timbre: XmlRecord | undefined;
    const relatedUuids: string[] = [];

    for (const comp of complementoNodes) {
      if (!timbre) {
        timbre = asRecord(comp.TimbreFiscalDigital);
      }
      // Soporte para Complemento de Recepción de Pagos (REP 2.0 / 1.0)
      const pagosRoot = asRecord(comp.Pagos);
      if (pagosRoot) {
        for (const pago of asArray(pagosRoot.Pago)) {
          for (const docRel of asArray(pago.DoctoRelacionado)) {
            const idDoc = attr(docRel, "IdDocumento");
            if (idDoc) relatedUuids.push(idDoc.toUpperCase());
          }
        }
      }
    }

    // CFDIs relacionados (notas de crédito, sustituciones)
    for (const relGroup of asArray(comprobante.CfdiRelacionados)) {
      for (const rel of asArray(relGroup.CfdiRelacionado)) {
        const relUuid = attr(rel, "UUID");
        if (relUuid) relatedUuids.push(relUuid.toUpperCase());
      }
    }

    const uuid = attr(timbre, "UUID")?.toUpperCase();
    if (!uuid) {
      return {
        success: false,
        error: "El CFDI no contiene TimbreFiscalDigital (UUID) válido.",
      };
    }

    const rfcEmisor = (attr(emisor, "Rfc") ?? "").toUpperCase();
    const rfcReceptor = (attr(receptor, "Rfc") ?? "").toUpperCase();
    const normalizedClientRfc = clientRfc?.trim().toUpperCase();

    const direction: "EMITIDO" | "RECIBIDO" =
      normalizedClientRfc && rfcEmisor === normalizedClientRfc
        ? "EMITIDO"
        : normalizedClientRfc && rfcReceptor === normalizedClientRfc
          ? "RECIBIDO"
          : "RECIBIDO";

    // Extraer IVA trasladado (Impuesto 002) y retenciones totales
    const impuestos = asRecord(comprobante.Impuestos);
    let iva = 0;
    const totalTrasladados = attr(impuestos, "TotalImpuestosTrasladados");
    const traslados = asRecord(impuestos?.Traslados);
    if (traslados) {
      for (const t of asArray(traslados.Traslado)) {
        if (attr(t, "Impuesto") === "002") {
          iva += toNumber(attr(t, "Importe"), 0);
        }
      }
    } else if (totalTrasladados) {
      iva = toNumber(totalTrasladados, 0);
    }

    const retenciones = toNumber(attr(impuestos, "TotalImpuestosRetenidos"), 0);

    const rawTipo = (attr(comprobante, "TipoDeComprobante") ?? "I").toUpperCase();
    const tipoDeComprobante = (
      ["I", "E", "P", "N", "T"].includes(rawTipo) ? rawTipo : "I"
    ) as "I" | "E" | "P" | "N" | "T";

    const candidate = {
      uuid,
      version: attr(comprobante, "Version") ?? "4.0",
      tipoDeComprobante,
      direction,
      estatusSat: "VIGENTE" as const,
      serie: attr(comprobante, "Serie"),
      folio: attr(comprobante, "Folio"),
      fecha: attr(comprobante, "Fecha") ?? new Date().toISOString(),
      fechaTimbrado: attr(timbre, "FechaTimbrado"),
      rfcEmisor,
      nombreEmisor: attr(emisor, "Nombre") ?? rfcEmisor,
      rfcReceptor,
      nombreReceptor: attr(receptor, "Nombre") ?? rfcReceptor,
      formaPago: attr(comprobante, "FormaPago"),
      metodoPago: attr(comprobante, "MetodoPago"),
      usoCfdi: attr(receptor, "UsoCFDI"),
      moneda: attr(comprobante, "Moneda") ?? "MXN",
      tipoCambio: toNumber(attr(comprobante, "TipoCambio"), 1),
      subtotal: toNumber(attr(comprobante, "SubTotal"), 0),
      iva: Number(iva.toFixed(2)),
      retenciones: Number(retenciones.toFixed(2)),
      total: toNumber(attr(comprobante, "Total"), 0),
      relatedUuids: Array.from(new Set(relatedUuids)),
    };

    const validated = parsedCfdiSchema.safeParse(candidate);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues.map((i) => i.message).join("; "),
      };
    }

    return { success: true, cfdi: validated.data };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? `Error al procesar XML CFDI: ${err.message}`
          : "Error desconocido al procesar XML CFDI",
    };
  }
}

/**
 * Parsea múltiples archivos XML CFDI y agrupa resultados y errores por archivo.
 */
export function parseCfdiBatch(
  files: Array<{ fileName: string; content: string }>,
  clientRfc?: string
): {
  cfdis: ParsedCfdi[];
  errors: Array<{ fileName: string; error: string }>;
} {
  const cfdis: ParsedCfdi[] = [];
  const errors: Array<{ fileName: string; error: string }> = [];

  for (const file of files) {
    const res = parseCfdiXml(file.content, clientRfc);
    if (res.success) {
      cfdis.push(res.cfdi);
    } else {
      errors.push({ fileName: file.fileName, error: res.error });
    }
  }

  return { cfdis, errors };
}
