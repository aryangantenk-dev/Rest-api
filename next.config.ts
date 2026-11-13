import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Encoder video (WebAssembly) dimuat langsung dari node_modules saat runtime.
  serverExternalPackages: ["h264-mp4-encoder"],
  // Font dan gambar dasar untuk endpoint canvas dibaca dari disk saat runtime, jadi harus ikut
  // dibundel ke fungsi serverless.
  outputFileTracingIncludes: {
    "/api/[...path]": ["./src/assets/fonts/**/*", "./src/assets/canvas/**/*"],
  },
};

export default nextConfig;
