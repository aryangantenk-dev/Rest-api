import type { Endpoint } from "./types";
import { binaryResponse, fetchRaw, fetchText, need, num, opt } from "./helpers";

export const aiEndpoints: Endpoint[] = [
  {
    category: "ai", slug: "chat", kind: "json",
    title: "AI Chat",
    description: "Ngobrol dengan model bahasa AI. Atur kepribadian lewat parameter system. Tanpa API key.",
    params: [
      { name: "text", required: true, description: "Pertanyaan atau perintah untuk AI.", example: "Jelaskan apa itu REST API dalam 2 kalimat" },
      { name: "system", description: "Instruksi peran/kepribadian AI.", example: "Kamu adalah asisten yang ramah dan menjawab dalam bahasa Indonesia." },
    ],
    handler: async ({ sp }) => {
      const text = need(sp, "text", 1500);
      const system = opt(sp, "system", "Kamu adalah asisten AI yang membantu dan menjawab dengan bahasa Indonesia yang jelas dan ringkas.").slice(0, 600);
      const answer = await fetchText(`https://text.pollinations.ai/${encodeURIComponent(text)}?system=${encodeURIComponent(system)}&model=openai`);
      return { question: text, answer: answer.trim() };
    },
  },
  {
    category: "ai", slug: "image", kind: "image",
    title: "AI Image Generator",
    description: "Hasilkan gambar dari deskripsi teks (text-to-image). Mendukung ukuran dan seed kustom.",
    params: [
      { name: "prompt", required: true, description: "Deskripsi gambar. Bahasa Inggris memberi hasil terbaik.", example: "a cozy cabin in snowy mountains at dusk, cinematic lighting" },
      { name: "width", description: "Lebar (256–1280). Default 768.", example: "768" },
      { name: "height", description: "Tinggi (256–1280). Default 768.", example: "768" },
      { name: "seed", description: "Seed agar hasil bisa diulang.", example: "42" },
    ],
    handler: async ({ sp }) => {
      const prompt = need(sp, "prompt", 800);
      const w = Math.round(num(sp, "width", 768, 256, 1280));
      const h = Math.round(num(sp, "height", 768, 256, 1280));
      const seed = Math.round(num(sp, "seed", Math.floor(Math.random() * 1e6), 0, 1e9));
      const res = await fetchRaw(
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`,
        undefined,
        60000,
      );
      const buf = await res.arrayBuffer();
      return binaryResponse(buf, res.headers.get("content-type") ?? "image/jpeg", "public, max-age=86400");
    },
  },
];
