# Yanxz API

REST API gratis tanpa API key (139 endpoint) beserta dokumentasi dan playground interaktif. Dibangun dengan Next.js 16 (App Router).

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

| `ADMIN_KEY` | Kunci rahasia owner untuk endpoint admin (daftar blokir, buka blokir, blokir manual). Tanpa ini endpoint admin nonaktif. |
| `RATE_LIMIT_PER_MIN` | Batas permintaan per menit untuk setiap IP. Default `45`. |
| `BAN_AFTER_STRIKES` | Jumlah pelanggaran dalam 10 menit sebelum IP diblokir permanen. Default `3`. |
| `OWNER_WHATSAPP` | Nomor WhatsApp owner untuk banding blokir. Default `62895403334081`. |

Tanpa database, semua endpoint lain tetap berjalan normal. Lihat `.env.example`. Status database bisa dicek di `/api/health`.

## Batas pemakaian dan blokir IP

- Setiap IP boleh mengirim **45 permintaan per menit** ke `/api/*`. Sisa kuota ada di header `x-ratelimit-remaining`.
- Melewati batas menghasilkan HTTP `429` dengan field `retry_after` dan dihitung sebagai satu pelanggaran.
- Tiga pelanggaran dalam 10 menit, atau lebih dari 180 permintaan dalam satu menit, membuat IP **diblokir permanen**. Semua permintaan berikutnya dijawab HTTP `403` berisi `banned: true`, alasan, dan tautan banding ke WhatsApp owner.
- Daftar blokir disimpan di tabel `banned_ips` (Supabase/Postgres) sehingga berlaku di semua instance. Hitungan permintaan disimpan di memori tiap instance serverless, jadi batasnya bersifat perkiraan saat lalu lintas tersebar ke banyak instance.

Mengelola blokir (hanya owner, butuh `ADMIN_KEY`):

| Endpoint | Keterangan |
| --- | --- |
| `/api/admin/bans?key=…` | Daftar IP yang diblokir beserta alasan dan waktunya. |
| `/api/admin/unban?ip=1.2.3.4&key=…` | Buka blokir sebuah IP. |
| `/api/admin/ban?ip=1.2.3.4&reason=…&key=…` | Blokir IP secara manual. |

Kunci juga bisa dikirim lewat header `x-admin-key`. Cara lain: hapus baris IP tersebut dari tabel `banned_ips` di Supabase.

## Game untuk bot WhatsApp (Baileys)

Semua game di `/api/games/*` tidak memakai sesi di server. Soal sudah menyertakan `jawaban`, `waktu`, dan `hadiah`, sehingga bot cukup menyimpan jawaban per chat. Bila tidak ingin mencocokkan sendiri, kirim jawaban pemain ke `/api/games/jawab`.

```js
const API = "https://domain-kamu.vercel.app/api";
const sesi = new Map(); // chatId -> soal

sock.ev.on("messages.upsert", async ({ messages }) => {
  const m = messages[0];
  const chat = m.key.remoteJid;
  const teks = (m.message?.conversation || m.message?.extendedTextMessage?.text || "").trim();

  if (teks === ".tebakkata") {
    const { result } = await (await fetch(`${API}/games/tebakkata`)).json();
    sesi.set(chat, result);
    setTimeout(() => sesi.delete(chat), result.waktu * 1000);
    return sock.sendMessage(chat, { text: `${result.soal}\n\nPetunjuk: ${result.petunjuk}\nWaktu: ${result.waktu} detik` });
  }

  const soal = sesi.get(chat);
  if (soal && teks) {
    const { result } = await (await fetch(`${soal.cek}${encodeURIComponent(teks)}`)).json();
    if (result.benar) {
      sesi.delete(chat);
      return sock.sendMessage(chat, { text: `Benar! Jawabannya ${result.jawaban}. +${soal.hadiah} XP` });
    }
    if (result.hampir) return sock.sendMessage(chat, { text: "Dikit lagi!" });
  }
});
```

Game bergambar (`tebakgambar`, `tebakbendera`) mengembalikan field `gambar` yang bisa langsung dikirim: `sock.sendMessage(chat, { image: { url: result.gambar }, caption: result.soal })`.

Akinator dan Tic Tac Toe juga tanpa sesi: simpan nilai `session` (Akinator) atau `board` (Tic Tac Toe) dari respons terakhir, lalu kirim kembali pada permintaan berikutnya.

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

## Scraper Film (LK21)

| Endpoint | Keterangan |
| --- | --- |
| `/api/film/lk21-home` | Semua bagian beranda LK21: unggulan, film terbaru, serial, dan bagian per genre/negara. |
| `/api/film/lk21-list?urut=&page=` | Daftar film. `urut`: `populer`, `terbaru`, `rating`, `rilis`, `komentar`, `unggulan`. 24 judul per halaman. |
| `/api/film/lk21-genre?genre=…&page=` | Daftar film menurut `genre` (`action`), `negara` (`usa`), atau `tahun` (`2025`). Isi salah satu saja. |
| `/api/film/lk21-detail?slug=…` | Detail film atau serial: sinopsis, rating, genre, negara, sutradara, pemeran, trailer, film terkait, dan daftar episode untuk serial. |
| `/api/film/lk21-pemeran?slug=…` | Daftar pemeran dan sutradara sebuah judul, lengkap dengan tautan ke daftar film tiap orang. |
| `/api/film/lk21-artis?slug=…&peran=&page=` | Semua film seorang pemeran (`peran=artis`) atau sutradara (`peran=sutradara`). |
| `/api/film/lk21-player?slug=…&season=&episode=` | Server player video sebuah film atau episode serial: alamat player untuk `<iframe>`, tanda bisa/tidaknya dipasang di situs lain, link unduhan, dan navigasi episode. |
| `/api/film/lk21-embed?slug=…&season=&episode=&server=` | Halaman HTML berisi player, untuk dipakai langsung sebagai `src` iframe. |
| `/api/search/lk21?q=…&page=&tipe=` | Cari judul di LK21 (`tipe`: `movie` atau `series`). Tidak butuh server perantara. |

Contoh memasang player film dan episode serial:

```html
<iframe src="https://domainmu/api/film/lk21-embed?slug=avatar-2009"
        width="100%" style="aspect-ratio:16/9;border:0" allowfullscreen></iframe>
<iframe src="https://domainmu/api/film/lk21-embed?slug=avatar-seven-havens-2026&season=1&episode=3"
        width="100%" style="aspect-ratio:16/9;border:0" allowfullscreen></iframe>
```

Tidak semua server bisa dipakai di luar LK21: server `p2p` hanya mau diputar di dalam situs LK21 (ditandai `embeddable: false`), jadi embed otomatis memilih server lain seperti `cast` atau `hydrax`. Player berasal dari pihak ketiga dan bisa memuat iklan.

LK21 menolak IP server Vercel, jadi endpoint `/api/film/*` dititipkan lewat server perantara ("film-proxy") di VPS milik sendiri:

1. Di VPS Ubuntu, jalankan `scripts/film-proxy/install.sh` sebagai root (tambahkan `TUNNEL=1` bila port VPS tidak bisa dijangkau dari luar). Skrip mengetes dulu apakah IP VPS diterima, lalu memasang layanan `film-proxy` dan mencetak `PROXY_URL` serta `PROXY_KEY`.
2. Isi env `FILM_PROXY_URL` dan `FILM_PROXY_KEY` di hosting dengan dua nilai itu, lalu deploy ulang.

Tanpa kedua env itu endpoint film menjawab 503, dan menjawab 502 selama VPS mati. Pada mode terowongan alamatnya berganti setiap layanan dinyalakan ulang, jadi `FILM_PROXY_URL` harus ikut diperbarui.
