import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";
import { parseBankTransactionsWithMapping } from "@/lib/parsers/bankParser";
import { columnMappingSchema } from "@/lib/validators/sat";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const { organization: org } = await requireAuthSession();
    const { clientId } = await context.params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: org.id },
      include: { bankAccounts: true },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Cliente no encontrado en tu organización" },
        { status: 404 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const bankAccountId = String(formData.get("bankAccountId") ?? "");
    const mappingJsonStr = String(formData.get("mappingJson") ?? "");
    const saveMapping = String(formData.get("saveMapping") ?? "true") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Archivo bancario requerido." },
        { status: 400 }
      );
    }

    const bankAccount = client.bankAccounts.find((b) => b.id === bankAccountId);
    if (!bankAccount) {
      return NextResponse.json(
        { error: "Cuenta bancaria no encontrada." },
        { status: 400 }
      );
    }

    let rawMapping: unknown;
    try {
      rawMapping = JSON.parse(mappingJsonStr);
    } catch {
      return NextResponse.json(
        { error: "JSON de mapeo de columnas inválido." },
        { status: 400 }
      );
    }

    const parsedMapping = columnMappingSchema.safeParse(rawMapping);
    if (!parsedMapping.success) {
      return NextResponse.json(
        {
          error:
            parsedMapping.error.issues[0]?.message ??
            "Configuración de mapeo incompleta",
        },
        { status: 400 }
      );
    }

    if (saveMapping) {
      await prisma.bankAccount.update({
        where: { id: bankAccount.id },
        data: {
          columnMappingJson: parsedMapping.data as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = parseBankTransactionsWithMapping(
      buffer,
      file.name,
      bankAccount.id,
      parsedMapping.data
    );

    const uniqueByHash = new Map<string, (typeof result.movements)[number]>();
    let inBatchDuplicates = 0;

    for (const mov of result.movements) {
      if (uniqueByHash.has(mov.hashUnico)) {
        inBatchDuplicates++;
      } else {
        uniqueByHash.set(mov.hashUnico, mov);
      }
    }

    const hashes = Array.from(uniqueByHash.keys());
    const existingRows = hashes.length
      ? await prisma.bankTransaction.findMany({
          where: { hashUnico: { in: hashes } },
          select: { hashUnico: true },
        })
      : [];

    const existingSet = new Set(existingRows.map((r) => r.hashUnico));
    const toInsert = hashes
      .filter((h) => !existingSet.has(h))
      .map((h) => uniqueByHash.get(h)!);

    let insertedCount = 0;
    let dbDuplicates = 0;

    for (const mov of toInsert) {
      try {
        await prisma.bankTransaction.create({
          data: {
            bankAccountId: bankAccount.id,
            clientId: client.id,
            fecha: mov.fecha,
            concepto: mov.concepto,
            monto: mov.monto,
            tipo: mov.tipo,
            hashUnico: mov.hashUnico,
            status: "SIN_FACTURA",
          },
        });
        insertedCount++;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          dbDuplicates++;
        } else {
          result.errors.push({
            rowNumber: 0,
            error:
              err instanceof Error
                ? err.message
                : "Error al guardar movimiento bancario",
          });
        }
      }
    }

    return NextResponse.json({
      totalRows: result.totalDataRows,
      parsedCount: result.movements.length,
      insertedCount,
      duplicatesCount: inBatchDuplicates + existingSet.size + dbDuplicates,
      errors: result.errors,
      mappingSaved: saveMapping,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
