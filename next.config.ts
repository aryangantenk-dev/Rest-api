import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Font untuk endpoint canvas dibaca dari disk saat runtime, jadi harus ikut
  // dibundel ke fungsi serverless.
  outputFileTracingIncludes: {
    "/api/[...path]": ["./src/assets/fonts/**/*"],
  },
};

export default nextConfig;
