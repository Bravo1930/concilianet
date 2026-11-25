import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseAttributeValue: false,
  trimValues: true,
});

type XmlNode = Record<string, unknown>;

function asRecord(val: unknown): XmlNode | undefined {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as XmlNode;
  }
  return undefined;
}

function asArray<T = XmlNode>(val: unknown): T[] {
  if (!val) return [];
  return Array.isArray(val) ? (val as T[]) : [val as T];
}

function attr(node: XmlNode | undefined, key: string): string | undefined {
  if (!node) return undefined;
  const raw = node[`@_${key}`];
  if (raw === undefined || raw === null) return undefined;
  return String(raw).trim();
}

function toNumber(val: string | undefined, fallback = 0): number {
  if (!val) return fallback;
  const n = Number.parseFloat(val.replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export interface RepDoctoRelacionado {
  idDocumento: string;
  serie?: string;
  folio?: string;
  monedaDR?: string;
  equivalenciaDR?: number;
  numParcialidad?: number;
  impSaldoAnt: number;
  impPagado: number;
  impSaldoInsoluto: number;
}

export interface RepPagoNode {
  fechaPago: string;
  formaDePagoP?: string;
  monedaP: string;
  tipoCambioP: number;
  monto: number;
  doctosRelacionados: RepDoctoRelacionado[];
}

export interface ParsedSatCfdi {
  fileName: string;
  uuid: string;
  tipoComprobante: "I" | "E" | "P" | "N";
  metodoPago: "PUE" | "PPD" | null;
  formaPago: string | null;
  fechaEmision: Date;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  subtotal: number;
  total: number;
  moneda: string;
  tipoCambio: number;
  saldoPendiente: number;
  direccion: "EMITIDO" | "RECIBIDO";
  relatedUuidsJson:
    | {
        pagos?: RepPagoNode[];
        cfdisRelacionados?: string[];
      }
    | undefined;
}

export interface SatXmlBatchResult {
  totalXmlFiles: number;
  parsed: ParsedSatCfdi[];
  errors: Array<{ fileName: string; error: string }>;
}

/**
 * Parsea un contenido XML CFDI 4.0/3.3 del SAT, determinando automáticamente
 * si el comprobante es EMITIDO o RECIBIDO respecto al RFC del cliente activo,
 * y extrayendo nodos pago20:Pago / pago20:DoctoRelacionado si TipoDeComprobante === "P".
 */
export function parseSatCfdiXml(
  xmlContent: string,
  clientRfc: string,
  fileName = "cfdi.xml"
):
  | { success: true; data: ParsedSatCfdi }
  | { success: false; error: string } {
  try {
    const parsed = xmlParser.parse(xmlContent) as XmlNode;
    const comprobante = asRecord(parsed?.Comprobante);
    if (!comprobante) {
      return {
        success: false,
        error: "El archivo no contiene un nodo raíz cfdi:Comprobante válido.",
      };
    }

    const emisor = asRecord(comprobante.Emisor);
    const receptor = asRecord(comprobante.Receptor);

    const rfcEmisor = (attr(emisor, "Rfc") ?? "").toUpperCase();
    const nombreEmisor = attr(emisor, "Nombre") ?? rfcEmisor;
    const rfcReceptor = (attr(receptor, "Rfc") ?? "").toUpperCase();
    const nombreReceptor = attr(receptor, "Nombre") ?? rfcReceptor;

    if (!rfcEmisor || !rfcReceptor) {
      return {
        success: false,
        error: "Falta RFC de Emisor o Receptor en el comprobante.",
      };
    }

    const normalizedClientRfc = clientRfc.trim().toUpperCase();
    let direccion: "EMITIDO" | "RECIBIDO";
    if (rfcEmisor === normalizedClientRfc) {
      direccion = "EMITIDO";
    } else if (rfcReceptor === normalizedClientRfc) {
      direccion = "RECIBIDO";
    } else {
      return {
        success: false,
        error: `El CFDI (${rfcEmisor} → ${rfcReceptor}) no corresponde al RFC del cliente (${normalizedClientRfc}).`,
      };
    }

    const complementos = asArray(comprobante.Complemento);
    let timbre: XmlNode | undefined;
    const pagosList: RepPagoNode[] = [];

    for (const comp of complementos) {
      if (!timbre) {
        timbre = asRecord(comp.TimbreFiscalDigital);
      }

      // Complemento de Recepción de Pagos (REP 2.0 / 1.0)
      const pagosRoot = asRecord(comp.Pagos);
      if (pagosRoot) {
        for (const pagoNode of asArray(pagosRoot.Pago)) {
          const doctosRelacionados: RepDoctoRelacionado[] = asArray(
            pagoNode.DoctoRelacionado
          )
            .map((doc): RepDoctoRelacionado | null => {
              const idDoc = attr(doc, "IdDocumento")?.toUpperCase();
              if (!idDoc) return null;
              return {
                idDocumento: idDoc,
                serie: attr(doc, "Serie"),
                folio: attr(doc, "Folio"),
                monedaDR: attr(doc, "MonedaDR"),
                equivalenciaDR: toNumber(attr(doc, "EquivalenciaDR"), 1),
                numParcialidad: attr(doc, "NumParcialidad")
                  ? Number.parseInt(attr(doc, "NumParcialidad")!, 10)
                  : undefined,
                impSaldoAnt: toNumber(attr(doc, "ImpSaldoAnt"), 0),
                impPagado: toNumber(attr(doc, "ImpPagado"), 0),
                impSaldoInsoluto: toNumber(attr(doc, "ImpSaldoInsoluto"), 0),
              };
            })
            .filter((d): d is RepDoctoRelacionado => d !== null);

          pagosList.push({
            fechaPago: attr(pagoNode, "FechaPago") ?? "",
            formaDePagoP: attr(pagoNode, "FormaDePagoP"),
            monedaP: attr(pagoNode, "MonedaP") ?? "MXN",
            tipoCambioP: toNumber(attr(pagoNode, "TipoCambioP"), 1),
            monto: toNumber(attr(pagoNode, "Monto"), 0),
            doctosRelacionados,
          });
        }
      }
    }

    const uuid = attr(timbre, "UUID")?.toUpperCase();
    if (!uuid) {
      return {
        success: false,
        error: "No se encontró el UUID en tfd:TimbreFiscalDigital.",
      };
    }

    const rawTipo = (attr(comprobante, "TipoDeComprobante") ?? "I").toUpperCase();
    if (!["I", "E", "P", "N"].includes(rawTipo)) {
      return {
        success: false,
        error: `TipoDeComprobante '${rawTipo}' no soportado (solo I, E, P, N).`,
      };
    }
    const tipoComprobante = rawTipo as "I" | "E" | "P" | "N";

    const rawMetodo = attr(comprobante, "MetodoPago")?.toUpperCase();
    const metodoPago: "PUE" | "PPD" | null =
      rawMetodo === "PUE" || rawMetodo === "PPD" ? rawMetodo : null;

    const formaPago = attr(comprobante, "FormaPago") ?? null;
    const rawFecha = attr(comprobante, "Fecha");
    const fechaEmision = rawFecha ? new Date(rawFecha) : new Date();
    if (Number.isNaN(fechaEmision.getTime())) {
      return {
        success: false,
        error: `Fecha de emisión inválida en CFDI: ${rawFecha}`,
      };
    }

    const subtotal = toNumber(attr(comprobante, "SubTotal"), 0);
    const total = toNumber(attr(comprobante, "Total"), 0);
    const moneda = (attr(comprobante, "Moneda") ?? "MXN").toUpperCase();
    const tipoCambio = toNumber(attr(comprobante, "TipoCambio"), 1);

    // Extraer CFDIs relacionados (Notas de Crédito / Sustituciones)
    const cfdisRelacionados: string[] = [];
    for (const relGroup of asArray(comprobante.CfdiRelacionados)) {
      for (const rel of asArray(relGroup.CfdiRelacionado)) {
        const relUuid = attr(rel, "UUID")?.toUpperCase();
        if (relUuid) cfdisRelacionados.push(relUuid);
      }
    }

    const relatedUuidsJson =
      tipoComprobante === "P" || pagosList.length > 0 || cfdisRelacionados.length > 0
        ? {
            ...(pagosList.length > 0 ? { pagos: pagosList } : {}),
            ...(cfdisRelacionados.length > 0 ? { cfdisRelacionados } : {}),
          }
        : undefined;

    // Para tipo P (REP), el Total del comprobante es 0 y el saldo pendiente a conciliar es el monto del pago
    const repMontoTotal = pagosList.reduce((sum, p) => sum + p.monto, 0);
    const saldoPendiente =
      tipoComprobante === "P" ? Number(repMontoTotal.toFixed(2)) : total;

    return {
      success: true,
      data: {
        fileName,
        uuid,
        tipoComprobante,
        metodoPago,
        formaPago,
        fechaEmision,
        rfcEmisor,
        nombreEmisor,
        rfcReceptor,
        nombreReceptor,
        subtotal: Number(subtotal.toFixed(2)),
        total: Number(total.toFixed(2)),
        moneda,
        tipoCambio,
        saldoPendiente,
        direccion,
        relatedUuidsJson,
      },
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? `Error XML: ${err.message}`
          : "Error inesperado al leer XML CFDI",
    };
  }
}

/**
 * Procesa una lista de archivos subidos (.xml y/o .zip con XMLs dentro).
 */
export async function parseSatUploadFiles(
  inputs: Array<{ fileName: string; buffer: Buffer }>,
  clientRfc: string
): Promise<SatXmlBatchResult> {
  const xmlEntries: Array<{ fileName: string; content: string }> = [];
  const errors: Array<{ fileName: string; error: string }> = [];

  for (const item of inputs) {
    const lower = item.fileName.toLowerCase();
    if (lower.endsWith(".zip")) {
      try {
        const zip = await JSZip.loadAsync(item.buffer);
        const entries = Object.values(zip.files).filter(
          (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".xml")
        );
        if (entries.length === 0) {
          errors.push({
            fileName: item.fileName,
            error: "El archivo .zip no contiene archivos .xml.",
          });
          continue;
        }
        for (const entry of entries) {
          const content = await entry.async("string");
          xmlEntries.push({
            fileName: `${item.fileName}/${entry.name}`,
            content,
          });
        }
      } catch (err) {
        errors.push({
          fileName: item.fileName,
          error:
            err instanceof Error
              ? `ZIP corrupto o ilegible: ${err.message}`
              : "No se pudo descomprimir el archivo ZIP",
        });
      }
    } else if (lower.endsWith(".xml")) {
      xmlEntries.push({
        fileName: item.fileName,
        content: item.buffer.toString("utf-8"),
      });
    } else {
      errors.push({
        fileName: item.fileName,
        error: "Formato no soportado. Solo se admiten archivos .xml o .zip.",
      });
    }
  }

  const parsed: ParsedSatCfdi[] = [];
  for (const xml of xmlEntries) {
    const res = parseSatCfdiXml(xml.content, clientRfc, xml.fileName);
    if (res.success) {
      parsed.push(res.data);
    } else {
      errors.push({ fileName: xml.fileName, error: res.error });
    }
  }

  return {
    totalXmlFiles: xmlEntries.length,
    parsed,
    errors,
  };
}
