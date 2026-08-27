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
  },
});
