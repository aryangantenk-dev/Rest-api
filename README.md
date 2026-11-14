# yanz.api

REST API gratis tanpa API key (162 endpoint) beserta dokumentasi dan playground interaktif. Dibangun dengan Next.js 16 (App Router).

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
| `WEB2APK_API_KEY` | Kunci API dari akunmu sendiri di layanan pembuat APK, untuk `/api/tools/web2apk`. Akun gratis mendapat 3 build per hari. Tanpa ini endpoint berjalan sebagai tamu (1 build per hari per alamat IP server), lalu menjawab 429. |

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
| `/api/tools/shorturl?url=…` | Bawaan yanz.api. Tautan pendek di domain sendiri (`/s/<kode>`) dengan hitungan klik. Butuh database. |
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

## Film (Sankanime & LK21)

Kategori Film punya dua sumber. **Sankanime Movies** membawa data film dan serial berbasis TMDB lengkap dengan pemeran, player video, link stream, dan unduhan. **LK21** hanya menyediakan daftar dan detail judul.

### Sankanime

| Endpoint | Keterangan |
| --- | --- |
| `/api/film/sanka-home` | Beranda: film sedang tayang, populer, rating tertinggi, segera tayang, dan serial terbaru/populer. |
| `/api/film/sanka-search?q=…&page=` | Cari film dan serial berdasarkan judul. |
| `/api/film/sanka-trending?tipe=&periode=&page=` | Trending `day` atau `week` untuk `tipe=movie` atau `tipe=tv`. |
| `/api/film/sanka-list?tipe=&urut=&genre=&tahun=&bahasa=&page=` | Daftar dengan saringan. `urut`: `populer`, `rating`, `terbaru`. |
| `/api/film/sanka-genre` | Daftar genre film dan serial beserta id-nya. |
| `/api/film/sanka-jadwal?page=` | Serial yang punya episode tayang hari ini. |
| `/api/film/sanka-detail?id=…&tipe=` | Detail lengkap: sinopsis, genre, sutradara, pemeran (nama tokoh dan foto), trailer, daftar season, rekomendasi. |
| `/api/film/sanka-season?id=…&season=` | Daftar episode satu season sebuah serial. |
| `/api/film/sanka-artis?id=…` | Profil seorang pemeran atau sutradara beserta daftar film dan serialnya. |
| `/api/film/sanka-player?id=…&tipe=&season=&episode=` | Daftar server player sebuah film atau episode, dengan tanda bisa-tidaknya dipasang di situs lain dan navigasi episode. |
| `/api/film/sanka-embed?id=…&tipe=&season=&episode=&server=&nav=` | Halaman HTML berisi player, siap dipakai sebagai `src` iframe. Ada tombol ganti server dan episode; `nav=0` menyembunyikannya. |
| `/api/film/sanka-stream?id=…&tipe=&season=&episode=` | Link stream langsung (HLS `.m3u8`), header yang dibutuhkan, dan daftar subtitle. |
| `/api/film/sanka-download?id=…&tipe=&season=&episode=` | Link unduhan beserta resolusi dan ukuran. |

`id` adalah id TMDB (`19995`) atau slug Sankanime (`avatar-19995`); `tipe` adalah `movie` (default) atau `tv`, sesuai field `type` pada hasil pencarian.

Contoh memasang player film dan episode serial:

```html
<iframe src="https://domainmu/api/film/sanka-embed?id=19995"
        width="100%" style="aspect-ratio:16/9;border:0" allowfullscreen></iframe>
<iframe src="https://domainmu/api/film/sanka-embed?id=284833&tipe=tv&season=1&episode=3"
        width="100%" style="aspect-ratio:16/9;border:0" allowfullscreen></iframe>
```

Player berasal dari penyedia pihak ketiga dan bisa memuat iklan; kalau satu server tidak memutar, ganti server lewat tombol di bawah player. Link dari `sanka-stream` umumnya hanya mau diputar bila permintaannya membawa header `Referer`/`Origin` yang tercantum di jawabannya, jadi cocok untuk aplikasi atau bot, bukan untuk tag `<video>` biasa.

API Sankanime menolak IP server Vercel, jadi dipanggil lewat Supabase Edge Function:

1. Deploy `supabase/functions/film-proxy` ke proyek Supabase dengan verifikasi JWT dimatikan (`supabase functions deploy film-proxy --no-verify-jwt`), lalu isi secret `FILM_PROXY_KEY` dengan kunci acak (`supabase secrets set FILM_PROXY_KEY=…`).
2. Isi env `SANKA_PROXY_URL` (`https://<ref>.supabase.co/functions/v1/film-proxy`) dan `SANKA_PROXY_KEY` (kunci yang sama) di hosting, lalu deploy ulang.

API sumbernya membatasi 45 permintaan per menit, jadi jawaban disimpan sekitar lima menit di memori server dan panggilan keluar dibatasi; saat padat endpoint menjawab 429.

### LK21

| Endpoint | Keterangan |
| --- | --- |
| `/api/film/lk21-home` | Semua bagian beranda LK21: unggulan, film terbaru, serial, dan bagian per genre/negara. |
| `/api/film/lk21-list?urut=&page=` | Daftar film. `urut`: `populer`, `terbaru`, `rating`, `rilis`, `komentar`, `unggulan`. 24 judul per halaman. |
| `/api/film/lk21-genre?genre=…&page=` | Daftar film menurut `genre` (`action`), `negara` (`usa`), atau `tahun` (`2025`). Isi salah satu saja. |
| `/api/film/lk21-detail?slug=…` | Detail film atau serial: sinopsis, rating, genre, negara, sutradara, pemeran, trailer, film terkait, dan daftar episode untuk serial. |
| `/api/film/lk21-pemeran?slug=…` | Daftar pemeran dan sutradara sebuah judul, lengkap dengan tautan ke daftar film tiap orang. |
| `/api/film/lk21-artis?slug=…&peran=&page=` | Semua film seorang pemeran (`peran=artis`) atau sutradara (`peran=sutradara`). |
| `/api/search/lk21?q=…&page=&tipe=` | Cari judul di LK21 (`tipe`: `movie` atau `series`). Tidak butuh server perantara. |

LK21 tidak punya endpoint player: player videonya menolak diputar di luar situs LK21. Pakai endpoint Sankanime untuk memutar video.

LK21 menolak IP server Vercel dan IP Supabase, jadi endpoint `lk21-*` dititipkan lewat server perantara ("film-proxy") di VPS milik sendiri:

1. Di VPS Ubuntu, jalankan `scripts/film-proxy/install.sh` sebagai root (tambahkan `TUNNEL=1` bila port VPS tidak bisa dijangkau dari luar). Skrip mengetes dulu apakah IP VPS diterima, lalu memasang layanan `film-proxy` dan mencetak `PROXY_URL` serta `PROXY_KEY`.
2. Isi env `FILM_PROXY_URL` dan `FILM_PROXY_KEY` di hosting dengan dua nilai itu, lalu deploy ulang.

Tanpa kedua env itu endpoint `lk21-*` menjawab 503, dan menjawab 502 selama VPS mati. Pada mode terowongan alamatnya berganti setiap layanan dinyalakan ulang, jadi `FILM_PROXY_URL` harus ikut diperbarui.
