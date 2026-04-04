import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./app/layout/AppShell";
import { PlaybackProvider } from "./app/playback/PlaybackContext";
import { ArticleListScreen } from "./screens/articles/ArticleListScreen";
import { PlayerScreen } from "./screens/player/PlayerScreen";
import { QueueScreen } from "./screens/queue/QueueScreen";

export default function App() {
  return (
    <PlaybackProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<ArticleListScreen />} />
          <Route path="/player" element={<PlayerScreen />} />
          <Route path="/queue" element={<QueueScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </PlaybackProvider>
  );
}
