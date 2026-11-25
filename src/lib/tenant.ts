import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/session";
import { DEFAULT_BANK_MAPPINGS } from "@/lib/validators/sat";
import type { Organization, User } from "@prisma/client";

const DEFAULT_ORG_ID = "org_despacho_mendoza";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export interface AuthenticatedContext {
  user: User;
  organization: Organization;
}

/**
 * Siembra de forma idempotente el despacho demo inicial si la base de datos
 * está completamente vacía (útil para probar login demo al instante).
 */
export async function ensureDemoOrganizationSeeded(): Promise<void> {
  const existingUser = await prisma.user.findUnique({
    where: { email: "a.mendoza@despachomendoza.mx" },
  });
  if (existingUser) {
    if (existingUser.passwordHash === "demo_hash_not_for_production") {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash: hashPassword("Concilia2026!") },
      });
    }
    return;
  }

  const orgCount = await prisma.organization.count();
  if (orgCount > 0) return;

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.upsert({
      where: { id: DEFAULT_ORG_ID },
      update: {},
      create: {
        id: DEFAULT_ORG_ID,
        name: "Despacho Fiscal Mendoza & Asociados S.C.",
        plan: "PYME",
        maxRfcs: 40,
        subscriptionStatus: "ACTIVE",
      },
    });

    await tx.user.upsert({
      where: { email: "a.mendoza@despachomendoza.mx" },
      update: {},
      create: {
        email: "a.mendoza@despachomendoza.mx",
        passwordHash: hashPassword("Concilia2026!"),
        name: "C.P. Alejandro Mendoza",
        role: "ADMIN",
        organizationId: org.id,
      },
    });

    const sampleClients = [
      {
        rfc: "GIM190521KP4",
        razonSocial: "Grupo Industrial Metropolitano S.A. de C.V.",
        regimenFiscal: "601 - General de Ley Personas Morales",
        bank: {
          bankName: "BBVA México",
          last4Digits: "4821",
          currency: "MXN",
        },
      },
      {
        rfc: "TEC210810MN2",
        razonSocial: "Tecnologías Cloud del Bajío S.A.P.I. de C.V.",
        regimenFiscal: "601 - General de Ley Personas Morales",
        bank: {
          bankName: "Santander México",
          last4Digits: "9014",
          currency: "MXN",
        },
      },
      {
        rfc: "LOAR850314QW1",
        razonSocial: "Roberto Lozano Arellano",
        regimenFiscal: "626 - Régimen Simplificado de Confianza (RESICO)",
        bank: {
          bankName: "Banorte",
          last4Digits: "3307",
          currency: "MXN",
        },
      },
    ];

    for (const item of sampleClients) {
      await tx.client.upsert({
        where: {
          organizationId_rfc: {
            organizationId: org.id,
            rfc: item.rfc,
          },
        },
        update: {},
        create: {
          organizationId: org.id,
          rfc: item.rfc,
          razonSocial: item.razonSocial,
          regimenFiscal: item.regimenFiscal,
          bankAccounts: {
            create: {
              bankName: item.bank.bankName,
              last4Digits: item.bank.last4Digits,
              currency: item.bank.currency,
              columnMappingJson:
                DEFAULT_BANK_MAPPINGS[item.bank.bankName] ?? undefined,
            },
          },
        },
      });
    }
  });
}

/**
 * Obtiene y valida la sesión JWT desde las cookies HTTP-only y verifica
 * que el usuario exista y pertenezca a la organización en base de datos.
 */
export async function requireAuthSession(): Promise<AuthenticatedContext> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);

  if (!payload) {
    throw new AuthError("Sesión no autenticada o expirada", 401);
  }

  const user = await prisma.user.findFirst({
    where: {
      id: payload.userId,
      organizationId: payload.organizationId,
    },
    include: {
      organization: true,
    },
  });

  if (!user) {
    throw new AuthError("Usuario o despacho no válido", 401);
  }

  return {
    user,
    organization: user.organization,
  };
}

export function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return NextResponse.json(
    {
      error: err instanceof Error ? err.message : "Error interno del servidor",
    },
    { status: 500 }
  );
}
