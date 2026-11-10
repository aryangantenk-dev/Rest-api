import { NextResponse } from "next/server";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getStats();
  return NextResponse.json(stats, { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=15" } });
}
