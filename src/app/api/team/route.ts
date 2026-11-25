import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";

const inviteSchema = z.object({
  name: z.string().trim().min(3, "Nombre requerido (mín. 3 caracteres)"),
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  role: z.enum(["ADMIN", "AUXILIAR"]).default("AUXILIAR"),
  temporaryPassword: z
    .string()
    .min(8, "La contraseña temporal debe tener al menos 8 caracteres"),
});

export async function GET() {
  try {
    const { user, organization } = await requireAuthSession();

    const members = await prisma.user.findMany({
      where: { organizationId: organization.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      currentUserRole: user.role,
      currentUserId: user.id,
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
      },
      members,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organization } = await requireAuthSession();

    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo un administrador del despacho puede invitar usuarios." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Ese correo electrónico ya pertenece a una cuenta activa." },
        { status: 409 }
      );
    }

    const created = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        passwordHash: hashPassword(parsed.data.temporaryPassword),
        organizationId: organization.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ member: created }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, organization } = await requireAuthSession();

    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo un administrador puede eliminar colaboradores." },
        { status: 403 }
      );
    }

    const memberId = req.nextUrl.searchParams.get("userId")?.trim();
    if (!memberId) {
      return NextResponse.json(
        { error: "Parámetro userId requerido" },
        { status: 400 }
      );
    }

    if (memberId === user.id) {
      return NextResponse.json(
        { error: "No puedes eliminar tu propia cuenta de administrador." },
        { status: 400 }
      );
    }

    const target = await prisma.user.findFirst({
      where: { id: memberId, organizationId: organization.id },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Colaborador no encontrado en tu despacho." },
        { status: 404 }
      );
    }

    await prisma.user.delete({ where: { id: target.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
