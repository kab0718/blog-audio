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
  };
});
