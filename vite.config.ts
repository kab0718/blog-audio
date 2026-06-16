import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { blogAudioApiPlugin } from "./server/blogAudioApi";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [
      react(),
      blogAudioApiPlugin({
        openAiApiKey: env.OPENAI_API_KEY,
      }),
    ],
    server: {
      proxy: {
        "/api/zenn": {
          target: "https://zenn.dev",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/zenn/, "/api"),
        },
        "/api/qiita": {
          target: "https://qiita.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/qiita/, "/api/v2"),
        },
      },
    },
  };
});
