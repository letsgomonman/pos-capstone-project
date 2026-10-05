import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Inisialisasi Serwist untuk PWA
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

// Konfigurasi standar Next.js
const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  // Tambahkan konfigurasi Next.js lain di sini jika diperlukan nanti
};

// Bungkus nextConfig dengan withSerwist
export default withSerwist(nextConfig);