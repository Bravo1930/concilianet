import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildReconciliationExcelBuffer } from "@/lib/export/excel-exporter";
import { parsedBankTransactionSchema, parsedCfdiSchema } from "@/lib/validators/sat";
import { reconcileBatch } from "@/lib/reconciliation/engine";

const exportRequestSchema = z.object({
  firmName: z.string().min(1),
  clientRfc: z.string().min(12),
  clientName: z.string().min(1),
  periodLabel: z.string().min(1),
  cfdis: z.array(parsedCfdiSchema),
  transactions: z.array(parsedBankTransactionSchema),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = exportRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload inválido para exportación", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { firmName, clientRfc, clientName, periodLabel, cfdis, transactions } =
      parsed.data;

    const result = reconcileBatch(cfdis, transactions);
    const buffer = await buildReconciliationExcelBuffer(result, {
      firmName,
      clientRfc,
      clientName,
      periodLabel,
    });

    const filename = `ConciliaSAT_${clientRfc}_${periodLabel.replace(/\s+/g, "_")}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error al generar el reporte Excel",
      },
      { status: 500 }
    );
  }
}
