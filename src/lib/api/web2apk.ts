import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { need, opt, parseHttpUrl } from "./helpers";

/*
  Web ke APK. Proses build dikerjakan layanan luar, bukan di server ini.

  - Bila env WEB2APK_API_KEY diisi, yang dipakai adalah API resmi layanan itu
    (POST /api/apk/build-api dengan header X-API-Key). Kuncinya milik satu akun, dan
    jatah build hariannya mengikuti paket akun tersebut.
  - Tanpa kunci, permintaan dikirim sebagai tamu (POST /api/apk/build). Tamu hanya
    mendapat satu build per hari per alamat IP, jadi mode ini cepat habis.

  Jatah sepenuhnya diatur layanan sumber. Bila habis, endpoint ini menjawab 429 apa adanya;
  tidak ada pembuatan akun otomatis atau cara lain untuk melewati batas itu.
*/

const BASE = "https://rfweb2apk.rfdevv.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
/** Build biasanya selesai dalam 30 sampai 60 detik; batas route ini 120 detik. */
const BUILD_TIMEOUT_MS = 100_000;

const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,5}$/;

type BuildReply = {
  success?: boolean;
  error?: string;
  message?: string;
  code?: string;
  limitReached?: boolean;
  ownBuildRunning?: boolean;
  fileName?: string;
  size?: number;
  fileSize?: number;
  downloadUrl?: string;
};

/** Nama paket bawaan dari nama aplikasi, mis. "Toko Saya" menjadi com.webapp.tokosaya. */
function defaultPackage(appName: string): string {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^[0-9]+/, "").slice(0, 30);
  return `com.webapp.${slug || "app"}`;
}

function buildError(status: number, d: BuildReply | null, usingKey: boolean): HttpError {
  const msg = typeof d?.error === "string" ? d.error.trim() : typeof d?.message === "string" ? d.message.trim() : "";
  if (d?.ownBuildRunning) return new HttpError(429, "Masih ada proses build lain yang berjalan. Tunggu sekitar satu menit, lalu coba lagi.");
  if (d?.limitReached || d?.code === "LIMIT_REACHED" || (status === 429 && /limit/i.test(msg))) {
    return new HttpError(429, "Jatah build APK hari ini sudah habis. Coba lagi besok.");
  }
  if (status === 429) return new HttpError(429, "Layanan pembuat APK sedang membatasi permintaan. Coba lagi beberapa saat lagi.");
  if (usingKey && (status === 401 || status === 403)) return new HttpError(502, "Kunci layanan pembuat APK ditolak. Pemilik API perlu memeriksa konfigurasinya.");
  if (status === 400 || status === 422) return new HttpError(400, msg ? msg.slice(0, 300) : "Permintaan ditolak layanan pembuat APK. Periksa lagi parameternya.");
  return new HttpError(502, "Layanan pembuat APK sedang bermasalah. Coba lagi nanti.");
}

async function build(appName: string, packageName: string, url: string): Promise<BuildReply> {
  const key = process.env.WEB2APK_API_KEY?.trim();
  const fd = new FormData();
  fd.append("appName", appName);
  fd.append("packageName", packageName);
  fd.append("url", url);
  if (!key) {
    // Formulir tamu di situs sumber selalu mengirim kolom-kolom ini.
    fd.append("versionName", "1.0");
    fd.append("versionCode", "1");
    fd.append("outputFormat", "apk");
    fd.append("splashType", "default");
    fd.append("orientation", "auto");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BUILD_TIMEOUT_MS);
  let res: Response;
  let data: BuildReply | null;
  try {
    res = await fetch(`${BASE}${key ? "/api/apk/build-api" : "/api/apk/build"}`, {
      method: "POST",
      body: fd,
      headers: { "user-agent": UA, accept: "application/json", ...(key ? { "x-api-key": key } : {}) },
      signal: ctrl.signal,
      cache: "no-store",
    });
    data = (await res.json().catch(() => null)) as BuildReply | null;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new HttpError(504, "Build belum selesai dalam 100 detik. Prosesnya mungkin masih berjalan di layanan sumber; coba lagi beberapa menit lagi.");
    }
    throw new HttpError(502, "Gagal menghubungi layanan pembuat APK.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok || !data?.success || !data.downloadUrl) throw buildError(res.status, data, !!key);
  return data;
}

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const web2apkEndpoints: Endpoint[] = [
  {
    category: "tools", slug: "web2apk", kind: "json",
    title: "Web ke APK",
    description:
      "Bungkus sebuah website menjadi aplikasi Android (APK) yang membuka alamat itu. Prosesnya 30 sampai 60 detik, dan jumlah build per hari terbatas; bila jatahnya habis, endpoint menjawab 429.",
    params: [
      { name: "url", required: true, description: "Alamat website yang dibuka aplikasi.", example: "https://example.com" },
      { name: "nama", required: true, description: "Nama aplikasi, maksimal 30 karakter.", example: "Toko Saya" },
      { name: "paket", description: "Nama paket Android: huruf kecil, angka, dan titik. Default dibuat dari nama aplikasi.", example: "com.toko.saya" },
    ],
    handler: async ({ sp }) => {
      const target = parseHttpUrl(need(sp, "url", 500)).toString();
      const appName = need(sp, "nama", 30);
      const packageName = opt(sp, "paket").toLowerCase() || defaultPackage(appName);
      if (packageName.length > 80 || !PACKAGE_RE.test(packageName)) {
        throw new HttpError(400, "Parameter 'paket' tidak valid. Gunakan huruf kecil, angka, dan titik, dengan minimal dua bagian. Contoh: com.toko.saya");
      }
      const d = await build(appName, packageName, target);
      const size = Number(d.size ?? d.fileSize) || 0;
      return {
        name: appName,
        package: packageName,
        url: target,
        file: d.fileName ?? null,
        size,
        size_text: size ? sizeText(size) : null,
        download: new URL(d.downloadUrl!, BASE).toString(),
      };
    },
  },
];
