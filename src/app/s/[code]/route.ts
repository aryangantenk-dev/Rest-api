import { NextResponse } from "next/server";
import { getStore } from "@/db/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const url = /^[0-9A-Za-z]{1,16}$/.test(code) ? await getStore()?.resolve(code) : null;
    if (url) return NextResponse.redirect(url, 302);
  } catch {
    /* jatuh ke halaman beranda */
  }
  return NextResponse.redirect(new URL("/", req.url), 302);
}
