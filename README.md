# Yanxz API

REST API gratis tanpa API key (60 endpoint) beserta dokumentasi dan playground interaktif. Dibangun dengan Next.js 16 (App Router).

## Menjalankan lokal

```bash
npm install
npm run dev
```

## Deploy

Kode berada langsung di root repository, jadi Vercel maupun Netlify mendeteksinya sebagai proyek Next.js tanpa pengaturan tambahan (build: `npm run build`).

## Environment variable (semuanya opsional)

| Nama | Fungsi |
| --- | --- |
| `DATABASE_URL` | Connection string PostgreSQL. Mengaktifkan statistik pemakaian dan pemendek URL (`/api/tools/shorturl`). Tabel dibuat otomatis. Tanpa ini, fitur lain tetap berjalan normal. |
| `NEXT_PUBLIC_SITE_URL` | Domain produksi untuk canonical URL, sitemap, dan Open Graph. |

Lihat `.env.example`. Status database bisa dicek di `/api/health`.
