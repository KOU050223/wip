import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  // WebXR(VRモード)はセキュアコンテキスト必須のため、basicSsl()がHTTPS化を担う。
  // host:trueでLAN内のQuest実機からもアクセスできるようにする。
  server: {
    host: true,
    // Workers AIを使うWorkerは、ローカルでは8787番で起動する。
    // ブラウザからはViteと同一オリジンに見せ、LANのHTTPS画面でも安全に中継する。
    proxy: {
      "/ai": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
