import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import { ensureDemoOrganizationSeeded } from "@/lib/tenant";

const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

export async function POST(req: NextRequest) {
  try {
    await ensureDemoOrganizationSeeded();

    const body = await req.json();
    const parsed = loginBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Credenciales inválidas" },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 }
      );
    }

    const token = await signSessionToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
      name: user.name,
    });

    const res = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        plan: user.organization.plan,
        maxRfcs: user.organization.maxRfcs,
        subscriptionStatus: user.organization.subscriptionStatus,
      },
    });

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
          err instanceof Error ? err.message : "Error al iniciar sesión",
      },
      { status: 500 }
    );
  }
}
