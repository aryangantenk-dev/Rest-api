# Yanxz API

REST API gratis tanpa API key (61 endpoint) beserta dokumentasi dan playground interaktif. Dibangun dengan Next.js 16 (App Router).

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
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | URL proyek Supabase dan service role / secret key. Mengaktifkan statistik pemakaian dan pemendek URL bawaan (`/api/tools/shorturl`) lewat REST, tanpa koneksi Postgres. Jalankan `supabase/schema.sql` sekali di SQL Editor. |
| `DATABASE_URL` | Alternatif: connection string PostgreSQL biasa. Tabel dibuat otomatis. Dipakai bila variabel Supabase di atas kosong. |
| `NEXT_PUBLIC_SITE_URL` | Domain produksi untuk canonical URL, sitemap, dan Open Graph. |

Tanpa database, semua endpoint lain tetap berjalan normal. Lihat `.env.example`. Status database bisa dicek di `/api/health`.

## Pemendek URL

| Endpoint | Keterangan |
| --- | --- |
| `/api/tools/shorturl?url=…` | Bawaan Yanxz API. Tautan pendek di domain sendiri (`/s/<kode>`) dengan hitungan klik. Butuh database. |
| `/api/tools/tinyurl?url=…&alias=…` | Lewat TinyURL (`tinyurl.com`). Tanpa database, `alias` opsional. |
