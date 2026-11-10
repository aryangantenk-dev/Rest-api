import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    // Database opsional: tanpa DATABASE_URL aplikasi tetap sehat.
    if (!db) return Response.json({ ok: true, database: "not_configured" });
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, database: "connected" });
  } catch {
    return Response.json({ ok: false, database: "error" }, { status: 500 });
  }
}
