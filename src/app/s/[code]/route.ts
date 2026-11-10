import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { shortLinks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const db = await getDb();
    if (db) {
      const [row] = await db.select().from(shortLinks).where(eq(shortLinks.code, code)).limit(1);
      if (row) {
        db.update(shortLinks).set({ hits: sql`${shortLinks.hits} + 1` }).where(eq(shortLinks.id, row.id)).catch(() => {});
        return NextResponse.redirect(row.url, 302);
      }
    }
  } catch {
    /* jatuh ke halaman beranda */
  }
  return NextResponse.redirect(new URL("/", req.url), 302);
}
