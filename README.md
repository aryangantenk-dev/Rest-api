# Yanxz API

REST API gratis tanpa API key (75 endpoint) beserta dokumentasi dan playground interaktif. Dibangun dengan Next.js 16 (App Router).

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

## Scraper Komik (komiku.org)

| Endpoint | Keterangan |
| --- | --- |
| `/api/komik/latest?tipe=` | Komik yang baru update chapter. `tipe` opsional: `manga`, `manhwa`, `manhua`. |
| `/api/komik/populer?periode=` | Peringkat `harian` atau `mingguan`. |
| `/api/komik/search?q=…` | Cari komik berdasarkan judul. |
| `/api/komik/list?page=&tipe=&genre=&status=&order=` | Jelajahi pustaka dengan filter. |
| `/api/komik/genre` | Daftar genre beserta jumlah komik. |
| `/api/komik/detail?slug=…` | Metadata komik (judul, sinopsis, genre, author, status, sampul) dan daftar chapter. |
| `/api/komik/chapter?slug=…&proxy=1` | URL gambar tiap halaman chapter. `proxy=1` melewatkan gambar ke proxy di bawah. |
| `/api/komik/image?url=…` | Proxy gambar, hanya untuk host komiku. |

## Scraper Anime (s2.anime-kuindo.com)

| Endpoint | Keterangan |
| --- | --- |
| `/api/anime/latest?page=` | Episode yang baru dirilis. |
| `/api/anime/home` | Semua bagian beranda (terpopuler, terbaru, top rating, rekomendasi). |
| `/api/anime/search?q=…&page=` | Cari judul anime. |
| `/api/anime/detail?slug=…` | Metadata anime dan daftar episode. Menerima slug seri maupun slug episode. |
| `/api/anime/episode?slug=…` | Link player video (`player.servers[].url`), navigasi episode, dan metadata seri. |
| `/api/anime/embed?slug=…&server=1` | Halaman HTML berisi player, untuk dipakai langsung sebagai `src` iframe. |

Contoh memasang player di halaman sendiri:

```html
<iframe src="https://domainmu/api/anime/embed?slug=kenja-no-mago-episode-12-sub-indo"
        width="100%" style="aspect-ratio:16/9;border:0" allowfullscreen></iframe>
```

Kedua scraper membaca HTML situs sumber, jadi bisa berhenti bekerja kalau situs tersebut mengubah tampilannya atau memblokir IP server.
