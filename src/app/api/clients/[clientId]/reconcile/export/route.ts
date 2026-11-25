import { NextRequest } from "next/server";
import { GET as exportGet } from "@/app/api/clients/[clientId]/export/route";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  return exportGet(req, context);
}
