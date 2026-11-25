import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseCfdiBatch } from "@/lib/parsers/cfdi-xml-parser";
import { parseBankStatement } from "@/lib/parsers/bank-statement-parser";
import { reconcileBatch } from "@/lib/reconciliation/engine";
import { SAMPLE_BANK_CSV, SAMPLE_CFDI_XML_FILES } from "@/lib/demo-data";

const reconcileRequestSchema = z.object({
  clientRfc: z.string().trim().min(12).max(13),
  useDemoData: z.boolean().optional().default(false),
  xmlFiles: z
    .array(
      z.object({
        fileName: z.string(),
        content: z.string(),
      })
    )
    .optional(),
  bankCsvContent: z.string().optional(),
  bankBase64Content: z.string().optional(),
  bankHint: z.string().optional(),
  toleranceMxn: z.number().min(0).max(500).optional(),
  maxWindowDays: z.number().int().min(1).max(90).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsedBody = reconcileRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const {
      clientRfc,
      useDemoData,
      xmlFiles,
      bankCsvContent,
      bankBase64Content,
      bankHint,
      toleranceMxn,
      maxWindowDays,
    } = parsedBody.data;

    const effectiveXmls =
      useDemoData || !xmlFiles?.length ? SAMPLE_CFDI_XML_FILES : xmlFiles;

    const cfdiBatch = parseCfdiBatch(effectiveXmls, clientRfc);

    let bankResult;
    if (bankBase64Content) {
      const buffer = Buffer.from(bankBase64Content, "base64");
      bankResult = parseBankStatement(buffer, bankHint);
    } else {
      const csv =
        useDemoData || !bankCsvContent ? SAMPLE_BANK_CSV : bankCsvContent;
      bankResult = parseBankStatement(csv, bankHint);
    }

    const reconciliation = reconcileBatch(
      cfdiBatch.cfdis,
      bankResult.transactions,
      {
        amountToleranceMxn: toleranceMxn ?? 1.0,
        maxDateWindowDays: maxWindowDays ?? 15,
      }
    );

    return NextResponse.json({
      reconciliation,
      cfdiErrors: cfdiBatch.errors,
      detectedBank: bankResult.detectedBank,
      bankWarnings: bankResult.warnings,
      skippedBankRows: bankResult.skippedRows,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error interno al ejecutar conciliación",
      },
      { status: 500 }
    );
  }
}
