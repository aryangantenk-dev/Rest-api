import { NextResponse } from "next/server";
import { allMeta } from "@/lib/api/registry";
import { categories } from "@/lib/api/categories";
import { KEY_REQUIRED } from "@/lib/auth/config";
import { SITE_CREATOR, SITE_NAME, getOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = getOrigin(req);
  const list = allMeta();
  return new NextResponse(
    JSON.stringify(
      {
        status: true,
        name: SITE_NAME,
        creator: SITE_CREATOR,
        baseUrl: `${origin}/api`,
        docs: `${origin}/docs`,
        apiKey: KEY_REQUIRED ? "required" : "not required",
        ...(KEY_REQUIRED
          ? { auth: { login: `${origin}/login`, how: "Tambahkan parameter apikey=yn-... ke setiap permintaan, atau kirim header x-api-key." } }
          : {}),
        totalEndpoints: list.length,
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          endpoints: list.filter((e) => e.category === c.id).map((e) => ({ path: e.path, title: e.title, params: e.params.map((p) => p.name) })),
        })),
      },
      null,
      2,
    ),
    { headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } },
  );
}
