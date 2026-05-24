import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import {
  ArticleLibraryProvider,
  useArticleLibrary,
} from "./app/articles/ArticleLibraryContext";
import { AppShell } from "./app/layout/AppShell";
import { PlaybackProvider, usePlayback } from "./app/playback/PlaybackContext";
import { ArticleListScreen } from "./screens/articles/ArticleListScreen";
import { PlayerScreen } from "./screens/player/PlayerScreen";
import { QueueScreen } from "./screens/queue/QueueScreen";

export default function App() {
  return (
    <ArticleLibraryProvider>
      <PlaybackProvider>
        <PlaybackQueueSync />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<ArticleListScreen />} />
            <Route path="/player" element={<PlayerScreen />} />
            <Route path="/queue" element={<QueueScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </PlaybackProvider>
    </ArticleLibraryProvider>
  );
}

function PlaybackQueueSync() {
  const { articles, status } = useArticleLibrary();
  const { dispatch } = usePlayback();

  useEffect(() => {
    if (status !== "success" && status !== "empty") {
      return;
    }

    dispatch({
      type: "syncQueueWithArticles",
      articleIds: articles.map((article) => article.id),
    });
  }, [articles, dispatch, status]);

  return null;
}
