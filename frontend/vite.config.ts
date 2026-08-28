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
    // QuestなどLAN上のHTTPSクライアントからのAPIアクセスは、この同一オリジンの
    // プロキシを通す。HTTPのGoサーバーへ直接fetchすると混在コンテンツで遮断され、
    // SecureなゲストCookieも正しく扱えないため。
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
