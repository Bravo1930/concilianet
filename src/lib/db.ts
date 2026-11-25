import { PrismaClient as PostgresPrismaClient } from "@prisma/client";
import { PrismaClient as SqlitePrismaClient } from "@/generated/prisma-sqlite";

const globalForPrisma = globalThis as unknown as {
  prisma: PostgresPrismaClient | undefined;
};

export function getDatabaseEngine(): "postgresql" | "sqlite" {
  const url = process.env.DATABASE_URL?.trim();
  if (url && (url.startsWith("postgresql://") || url.startsWith("postgres://"))) {
    return "postgresql";
  }
  return "sqlite";
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.SQLITE_DATABASE_URL);
}

function createPrismaClient(): PostgresPrismaClient {
  if (getDatabaseEngine() === "postgresql") {
    return new PostgresPrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  const sqliteUrl = process.env.SQLITE_DATABASE_URL
    ? undefined
    : "file:./prisma/dev.db";

  // Ambos schemas comparten exactamente los mismos modelos y enums;
  // tipamos la instancia con el cliente principal de PostgreSQL para evitar TS2321.
  const sqliteClient = new SqlitePrismaClient({
    ...(sqliteUrl ? { datasourceUrl: sqliteUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  return sqliteClient as unknown as PostgresPrismaClient;
}

export const prisma: PostgresPrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
