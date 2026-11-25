import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";
import { extractBankFilePreview } from "@/lib/parsers/bankParser";
import {
  columnMappingSchema,
  type BankColumnMapping,
} from "@/lib/validators/sat";

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
    const headerRowRaw = formData.get("headerRow");
    const headerRowOverride = headerRowRaw
      ? Number.parseInt(String(headerRowRaw), 10)
      : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Debes adjuntar un archivo .csv o .xlsx." },
        { status: 400 }
      );
    }

    const bankAccount = client.bankAccounts.find((b) => b.id === bankAccountId);
    if (!bankAccount) {
      return NextResponse.json(
        { error: "Cuenta bancaria inválida para este cliente." },
        { status: 400 }
      );
    }

    let savedMapping: BankColumnMapping | null = null;
    if (bankAccount.columnMappingJson) {
      const parsedMap = columnMappingSchema.safeParse(
        bankAccount.columnMappingJson
      );
      if (parsedMap.success) {
        savedMapping = parsedMap.data;
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = extractBankFilePreview(buffer, file.name, {
      headerRowOverride:
        headerRowOverride && Number.isInteger(headerRowOverride)
          ? headerRowOverride
          : undefined,
      savedMapping,
    });

    return NextResponse.json({
      ...preview,
      savedMappingUsed: Boolean(savedMapping),
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
