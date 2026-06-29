import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { blogAudioApiPlugin } from "./server/blogAudioApi";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [
      react(),
      blogAudioApiPlugin({
        googleApplicationCredentials: env.GOOGLE_APPLICATION_CREDENTIALS,
        googleCloudProject: env.GOOGLE_CLOUD_PROJECT,
        googleCloudTtsApiKey: env.GOOGLE_CLOUD_TTS_API_KEY,
        googleCloudTtsLanguageCode: env.GOOGLE_CLOUD_TTS_LANGUAGE_CODE,
        googleCloudTtsVoice: env.GOOGLE_CLOUD_TTS_VOICE,
        googleCloudTtsAudioEncoding: env.GOOGLE_CLOUD_TTS_AUDIO_ENCODING,
      }),
    ],
  };
});
