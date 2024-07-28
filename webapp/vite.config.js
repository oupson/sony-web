import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import wasm from "vite-plugin-wasm";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: "esnext", //browsers can handle the latest ES features
  },
  plugins: [
    preact(),
    wasm(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Sony Headphones",
        short_name: "Headphones",
        theme_color: "#E1B07E",
        background_color: "#3a4e48",
        icons: [
          {
            src: "/logo.svg",
            sizes: "256x256",
            purpose: "maskable",
          },
          {
            src: "/logo.svg",
            sizes: "256x256",
            purpose: "any",
          },
        ],
      },
    }),
  ],
});
