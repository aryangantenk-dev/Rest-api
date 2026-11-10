import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { fetchJson, need, num, opt } from "./helpers";

const weatherCodes: Record<number, string> = {
  0: "Cerah", 1: "Cerah berawan", 2: "Berawan sebagian", 3: "Mendung", 45: "Berkabut", 48: "Kabut beku",
  51: "Gerimis ringan", 53: "Gerimis", 55: "Gerimis lebat", 61: "Hujan ringan", 63: "Hujan sedang", 65: "Hujan lebat",
  71: "Salju ringan", 73: "Salju", 75: "Salju lebat", 80: "Hujan lokal ringan", 81: "Hujan lokal", 82: "Hujan lokal deras",
  95: "Badai petir", 96: "Badai petir disertai es", 99: "Badai petir disertai es lebat",
};

type Geo = { results?: { name: string; latitude: number; longitude: number; country: string; admin1?: string; timezone: string }[] };

export const infoEndpoints: Endpoint[] = [
  {
    category: "info", slug: "cuaca", kind: "json",
    title: "Cuaca",
    description: "Kondisi cuaca saat ini dan prakiraan 3 hari untuk kota mana pun di dunia.",
    params: [{ name: "kota", required: true, description: "Nama kota.", example: "Bandung" }],
    handler: async ({ sp }) => {
      const kota = need(sp, "kota", 80);
      const geo = await fetchJson<Geo>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(kota)}&count=1&language=id`);
      const place = geo.results?.[0];
      if (!place) throw new HttpError(404, "Kota tidak ditemukan.");
      const w = await fetchJson<{
        current: Record<string, number>;
        daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] };
      }>(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,pressure_msl&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto`,
      );
      return {
        location: { name: place.name, region: place.admin1 ?? null, country: place.country, latitude: place.latitude, longitude: place.longitude, timezone: place.timezone },
        current: {
          condition: weatherCodes[w.current.weather_code] ?? "Tidak diketahui", temperatureC: w.current.temperature_2m, feelsLikeC: w.current.apparent_temperature,
          humidity: w.current.relative_humidity_2m, windKmh: w.current.wind_speed_10m, pressureHpa: w.current.pressure_msl,
        },
        forecast: w.daily.time.map((d, i) => ({
          date: d, condition: weatherCodes[w.daily.weather_code[i]] ?? "Tidak diketahui", minC: w.daily.temperature_2m_min[i], maxC: w.daily.temperature_2m_max[i], rainChance: w.daily.precipitation_probability_max[i],
        })),
      };
    },
  },
  {
    category: "info", slug: "gempa", kind: "json",
    title: "Gempa Terkini BMKG",
    description: "Data gempa bumi terbaru langsung dari BMKG, atau daftar gempa dirasakan terkini.",
    params: [{ name: "type", description: "latest (terbaru), felt (dirasakan), m5 (M 5.0+). Default latest.", example: "latest" }],
    handler: async ({ sp }) => {
      const type = opt(sp, "type", "latest");
      const file = ({ latest: "autogempa", felt: "gempadirasakan", m5: "gempaterkini" } as Record<string, string>)[type];
      if (!file) throw new HttpError(400, "type harus latest, felt, atau m5.");
      const d = await fetchJson<{ Infogempa: { gempa: unknown } }>(`https://data.bmkg.go.id/DataMKG/TEWS/${file}.json`);
      const g = d.Infogempa.gempa as Record<string, string> | Record<string, string>[];
      const fix = (x: Record<string, string>) => ({
        date: x.Tanggal, time: x.Jam, magnitude: x.Magnitude, depth: x.Kedalaman, coordinates: x.Coordinates,
        region: x.Wilayah, potential: x.Potensi ?? null, felt: x.Dirasakan ?? null,
        shakemap: x.Shakemap ? `https://static.bmkg.go.id/${x.Shakemap}` : null,
      });
      return Array.isArray(g) ? g.map(fix) : fix(g);
    },
  },
  {
    category: "info", slug: "kurs", kind: "json",
    title: "Kurs Mata Uang",
    description: "Kurs terkini antar mata uang dunia dan konversi nominal secara langsung.",
    params: [
      { name: "from", description: "Kode mata uang asal. Default USD.", example: "USD" },
      { name: "to", description: "Kode mata uang tujuan. Default IDR.", example: "IDR" },
      { name: "amount", description: "Nominal. Default 1.", example: "100" },
    ],
    handler: async ({ sp }) => {
      const from = opt(sp, "from", "USD").toUpperCase();
      const to = opt(sp, "to", "IDR").toUpperCase();
      const amount = num(sp, "amount", 1, 0, 1e12);
      if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw new HttpError(400, "Gunakan kode mata uang 3 huruf (mis. USD, IDR, EUR).");
      const d = await fetchJson<{ result: string; rates: Record<string, number>; time_last_update_utc: string }>(`https://open.er-api.com/v6/latest/${from}`);
      if (d.result !== "success" || !(to in d.rates)) throw new HttpError(404, "Kode mata uang tidak ditemukan.");
      const rate = d.rates[to];
      return { from, to, amount, rate, result: Math.round(rate * amount * 100) / 100, updatedAt: d.time_last_update_utc };
    },
  },
  {
    category: "info", slug: "crypto", kind: "json",
    title: "Harga Kripto",
    description: "Harga aset kripto terkini dalam IDR dan USD lengkap dengan perubahan 24 jam.",
    params: [{ name: "coin", required: true, description: "ID koin CoinGecko (bitcoin, ethereum, solana, ...).", example: "bitcoin" }],
    handler: async ({ sp }) => {
      const coin = need(sp, "coin", 60).toLowerCase();
      const d = await fetchJson<Record<string, Record<string, number>>>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=idr,usd&include_24hr_change=true&include_market_cap=true`,
      );
      const r = d[coin];
      if (!r) throw new HttpError(404, "Koin tidak ditemukan. Gunakan ID CoinGecko, mis. 'bitcoin'.");
      return { coin, usd: r.usd, idr: r.idr, change24hUsd: r.usd_24h_change, change24hIdr: r.idr_24h_change, marketCapUsd: r.usd_market_cap };
    },
  },
  {
    category: "info", slug: "wikipedia", kind: "json",
    title: "Wikipedia",
    description: "Ringkasan artikel Wikipedia beserta gambar dan tautan artikelnya.",
    params: [
      { name: "q", required: true, description: "Judul artikel / kata kunci.", example: "Candi Borobudur" },
      { name: "lang", description: "Kode bahasa Wikipedia. Default id.", example: "id" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 150);
      const lang = opt(sp, "lang", "id").toLowerCase();
      if (!/^[a-z]{2,3}$/.test(lang)) throw new HttpError(400, "Kode bahasa tidak valid.");
      const s = await fetchJson<{ query?: { search?: { title: string }[] } }>(
        `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json`,
      );
      const title = s.query?.search?.[0]?.title;
      if (!title) throw new HttpError(404, "Artikel tidak ditemukan.");
      const d = await fetchJson<{ title: string; description?: string; extract: string; thumbnail?: { source: string }; content_urls: { desktop: { page: string } } }>(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      );
      return { title: d.title, description: d.description ?? null, summary: d.extract, thumbnail: d.thumbnail?.source ?? null, url: d.content_urls.desktop.page };
    },
  },
  {
    category: "info", slug: "github", kind: "json",
    title: "GitHub User",
    description: "Profil publik pengguna GitHub: repo, pengikut, bio, dan lainnya.",
    params: [{ name: "username", required: true, description: "Username GitHub.", example: "torvalds" }],
    handler: async ({ sp }) => {
      const u = need(sp, "username", 40);
      if (!/^[a-zA-Z0-9-]+$/.test(u)) throw new HttpError(400, "Username tidak valid.");
      const d = await fetchJson<Record<string, unknown>>(`https://api.github.com/users/${u}`, { headers: { accept: "application/vnd.github+json" } });
      return {
        username: d.login, name: d.name, bio: d.bio, avatar: d.avatar_url, url: d.html_url, company: d.company, location: d.location, blog: d.blog,
        publicRepos: d.public_repos, followers: d.followers, following: d.following, createdAt: d.created_at,
      };
    },
  },
  {
    category: "info", slug: "npm", kind: "json",
    title: "Paket NPM",
    description: "Informasi versi terbaru, lisensi, dan dependensi sebuah paket di NPM.",
    params: [{ name: "name", required: true, description: "Nama paket.", example: "next" }],
    handler: async ({ sp }) => {
      const name = need(sp, "name", 214);
      if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) throw new HttpError(400, "Nama paket tidak valid.");
      const d = await fetchJson<Record<string, unknown> & { dependencies?: Record<string, string>; repository?: { url?: string } | string; author?: { name?: string } | string }>(
        `https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`,
      );
      return {
        name: d.name, version: d.version, description: d.description, license: d.license, homepage: d.homepage,
        repository: typeof d.repository === "string" ? d.repository : d.repository?.url ?? null,
        author: typeof d.author === "string" ? d.author : d.author?.name ?? null,
        keywords: d.keywords ?? [], dependencies: Object.keys(d.dependencies ?? {}),
        install: `npm install ${d.name}`,
      };
    },
  },
  {
    category: "info", slug: "negara", kind: "json",
    title: "Info Negara",
    description: "Data negara: ibu kota, populasi, mata uang, bahasa, bendera, dan wilayah.",
    params: [{ name: "name", required: true, description: "Nama negara (Inggris atau Indonesia).", example: "Indonesia" }],
    handler: async ({ sp }) => {
      const name = need(sp, "name", 80);
      const d = await fetchJson<{
        name: string; alpha2Code: string; capital?: string; region: string; subregion?: string; population: number; area?: number;
        currencies?: { code: string; name: string; symbol: string }[]; languages?: { name: string }[]; flags: { png: string; svg: string };
        callingCodes?: string[]; timezones?: string[]; demonym?: string; borders?: string[];
      }[]>(`https://www.apicountries.com/name/${encodeURIComponent(name)}`);
      const c = Array.isArray(d) ? d[0] : undefined;
      if (!c) throw new HttpError(404, "Negara tidak ditemukan.");
      return {
        name: c.name, code: c.alpha2Code, capital: c.capital ?? null, region: c.region, subregion: c.subregion ?? null, demonym: c.demonym ?? null,
        population: c.population, areaKm2: c.area ?? null, currencies: c.currencies ?? [], languages: (c.languages ?? []).map((l) => l.name),
        callingCode: c.callingCodes?.[0] ? `+${c.callingCodes[0]}` : null, timezones: c.timezones ?? [], borders: c.borders ?? [], flag: c.flags.png,
      };
    },
  },
  {
    category: "info", slug: "libur", kind: "json",
    title: "Hari Libur Nasional",
    description: "Daftar hari libur nasional Indonesia (atau negara lain) pada tahun tertentu.",
    params: [
      { name: "year", description: "Tahun. Default tahun ini.", example: "2026" },
      { name: "country", description: "Kode negara 2 huruf. Default ID.", example: "ID" },
    ],
    handler: async ({ sp }) => {
      const year = Math.round(num(sp, "year", new Date().getFullYear(), 1990, 2100));
      const country = opt(sp, "country", "ID").toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, "Kode negara harus 2 huruf.");
      const d = await fetchJson<{ date: string; localName: string; name: string }[]>(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
      return { year, country, total: d.length, holidays: d.map((h) => ({ date: h.date, name: h.localName, englishName: h.name })) };
    },
  },
  {
    category: "info", slug: "lirik", kind: "json",
    title: "Lirik Lagu",
    description: "Cari lirik lagu berdasarkan nama artis dan judul.",
    params: [
      { name: "artist", required: true, description: "Nama artis.", example: "Coldplay" },
      { name: "title", required: true, description: "Judul lagu.", example: "Yellow" },
    ],
    handler: async ({ sp }) => {
      const artist = need(sp, "artist", 100), title = need(sp, "title", 100);
      const d = await fetchJson<{ lyrics?: string }>(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
      if (!d.lyrics) throw new HttpError(404, "Lirik tidak ditemukan.");
      return { artist, title, lyrics: d.lyrics.replace(/\r/g, "").trim() };
    },
  },
  {
    category: "info", slug: "kamus", kind: "json",
    title: "Kamus Bahasa Inggris",
    description: "Arti kata, kelas kata, contoh kalimat, dan pelafalan dalam bahasa Inggris.",
    params: [{ name: "word", required: true, description: "Kata bahasa Inggris.", example: "serendipity" }],
    handler: async ({ sp }) => {
      const word = need(sp, "word", 60);
      const d = await fetchJson<{ word: string; phonetic?: string; phonetics: { audio?: string }[]; meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[]; synonyms: string[] }[] }[]>(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      );
      const e = d[0];
      return {
        word: e.word, phonetic: e.phonetic ?? null, audio: e.phonetics.find((p) => p.audio)?.audio ?? null,
        meanings: e.meanings.map((m) => ({ partOfSpeech: m.partOfSpeech, definitions: m.definitions.slice(0, 3), synonyms: m.synonyms.slice(0, 6) })),
      };
    },
  },
];
