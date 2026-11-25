import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";

const registerSchema = z.object({
  firmName: z.string().trim().min(3, "Nombre del despacho requerido (mín. 3 caracteres)"),
  fullName: z.string().trim().min(3, "Nombre del administrador requerido"),
  email: z.string().trim().toLowerCase().email("Correo electrónico inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Datos de registro inválidos",
        },
        { status: 400 }
      );
    }

    const { firmName, fullName, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe una cuenta registrada con ese correo electrónico." },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(password);

    const { org, user } = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: firmName,
          plan: "FREE",
          maxRfcs: 3,
          subscriptionStatus: "TRIALING",
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: fullName,
          role: "ADMIN",
          organizationId: org.id,
        },
      });

      return { org, user };
    });

    const token = await signSessionToken({
      userId: user.id,
      organizationId: org.id,
      role: user.role,
      email: user.email,
      name: user.name,
    });

    const res = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        organization: {
          id: org.id,
          name: org.name,
          plan: org.plan,
          maxRfcs: org.maxRfcs,
          subscriptionStatus: org.subscriptionStatus,
        },
      },
      { status: 201 }
    );

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error al registrar el despacho",
      },
      { status: 500 }
    );
  }
}
