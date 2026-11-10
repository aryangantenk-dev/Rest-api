import { getStore } from "@/db/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  // Penyimpanan opsional: tanpa konfigurasi database aplikasi tetap sehat.
  if (!store) return Response.json({ ok: true, database: "not_configured" });
  try {
    await store.ping();
    return Response.json({ ok: true, database: "connected", backend: store.kind });
  } catch {
    return Response.json({ ok: false, database: "error", backend: store.kind }, { status: 500 });
  }
}
