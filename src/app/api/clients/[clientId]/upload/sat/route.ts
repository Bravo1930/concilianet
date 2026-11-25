import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";
import { parseSatUploadFiles } from "@/lib/parsers/satXmlParser";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { clientId } = await context.params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: org.id },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Cliente no encontrado en tu organización" },
        { status: 404 }
      );
    }

    const formData = await req.formData();
    const fileEntries = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);

    if (fileEntries.length === 0) {
      return NextResponse.json(
        { error: "No se recibieron archivos .xml ni .zip." },
        { status: 400 }
      );
    }

    const periodYear = Number.parseInt(
      String(formData.get("year") ?? ""),
      10
    );
    const periodMonth = Number.parseInt(
      String(formData.get("month") ?? ""),
      10
    );

    const buffers = await Promise.all(
      fileEntries.map(async (f) => ({
        fileName: f.name,
        buffer: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const batch = await parseSatUploadFiles(buffers, client.rfc);

    const uniqueByUuid = new Map<string, (typeof batch.parsed)[number]>();
    const inBatchDuplicateUuids: string[] = [];

    for (const item of batch.parsed) {
      if (uniqueByUuid.has(item.uuid)) {
        inBatchDuplicateUuids.push(item.uuid);
      } else {
        uniqueByUuid.set(item.uuid, item);
      }
    }

    const candidateUuids = Array.from(uniqueByUuid.keys());
    const existingRows = candidateUuids.length
      ? await prisma.cfdi.findMany({
          where: {
            clientId: client.id,
            uuid: { in: candidateUuids },
          },
          select: { uuid: true },
        })
      : [];

    const existingUuidSet = new Set(existingRows.map((r) => r.uuid));
    const duplicateUuids = [
      ...inBatchDuplicateUuids,
      ...candidateUuids.filter((u) => existingUuidSet.has(u)),
    ];

    const toInsert = candidateUuids
      .filter((u) => !existingUuidSet.has(u))
      .map((u) => uniqueByUuid.get(u)!);

    let insertedCount = 0;
    let repCount = 0;
    let outsidePeriodCount = 0;

    for (const cfdi of toInsert) {
      if (
        Number.isInteger(periodYear) &&
        Number.isInteger(periodMonth) &&
        (cfdi.fechaEmision.getUTCFullYear() !== periodYear ||
          cfdi.fechaEmision.getUTCMonth() + 1 !== periodMonth)
      ) {
        outsidePeriodCount++;
      }

      try {
        await prisma.cfdi.create({
          data: {
            clientId: client.id,
            uuid: cfdi.uuid,
            tipoComprobante: cfdi.tipoComprobante,
            metodoPago: cfdi.metodoPago,
            formaPago: cfdi.formaPago,
            fechaEmision: cfdi.fechaEmision,
            rfcEmisor: cfdi.rfcEmisor,
            nombreEmisor: cfdi.nombreEmisor,
            rfcReceptor: cfdi.rfcReceptor,
            nombreReceptor: cfdi.nombreReceptor,
            subtotal: cfdi.subtotal,
            total: cfdi.total,
            moneda: cfdi.moneda,
            tipoCambio: cfdi.tipoCambio,
            saldoPendiente: cfdi.saldoPendiente,
            direccion: cfdi.direccion,
            status: "PENDIENTE",
            relatedUuidsJson: cfdi.relatedUuidsJson
              ? (cfdi.relatedUuidsJson as unknown as Prisma.InputJsonValue)
              : undefined,
          },
        });
        insertedCount++;
        if (cfdi.tipoComprobante === "P") repCount++;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          duplicateUuids.push(cfdi.uuid);
        } else {
          batch.errors.push({
            fileName: cfdi.fileName,
            error:
              err instanceof Error ? err.message : "Error al guardar CFDI",
          });
        }
      }
    }

    return NextResponse.json({
      totalFiles: batch.totalXmlFiles,
      insertedCount,
      repCount,
      duplicatesCount: duplicateUuids.length,
      duplicateUuids,
      outsidePeriodCount,
      errors: batch.errors,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
