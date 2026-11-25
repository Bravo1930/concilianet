import { NextResponse } from "next/server";
import { getDatabaseEngine, isDatabaseConfigured, prisma } from "@/lib/db";

export async function GET() {
  const engine = getDatabaseEngine();
  let dbConnected = false;

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  return NextResponse.json({
    ok: true,
    service: "ConciliaSAT",
    databaseConfigured: isDatabaseConfigured(),
    databaseEngine: engine,
    databaseConnected: dbConnected,
  });
}
