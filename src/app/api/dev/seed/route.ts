import { NextResponse } from "next/server";
import { seedDemoPackage } from "@/lib/seed-demo";
import { authErrorResponse, requireAuthSession } from "@/lib/tenant";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Endpoint disponible únicamente en entorno de desarrollo." },
      { status: 403 }
    );
  }

  try {
    const { organization } = await requireAuthSession();
    const seeded = await seedDemoPackage(organization.id);
    return NextResponse.json(seeded, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}
