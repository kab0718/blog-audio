import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import {
  ArticleLibraryProvider,
  useArticleLibrary,
} from "./app/articles/ArticleLibraryContext";
import { AppShell } from "./app/layout/AppShell";
import { PlaybackProvider, usePlayback } from "./app/playback/PlaybackContext";
import { AudioTrackProvider, useAudioTracks } from "./app/tracks/AudioTrackContext";
import { ArticleListScreen } from "./screens/articles/ArticleListScreen";
import { PlayerScreen } from "./screens/player/PlayerScreen";
import { QueueScreen } from "./screens/queue/QueueScreen";

export default function App() {
  return (
    <ArticleLibraryProvider>
      <AudioTrackProvider>
        <PlaybackProvider>
          <AudioTrackQueueSync />
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<ArticleListScreen />} />
              <Route path="/player" element={<PlayerScreen />} />
              <Route path="/queue" element={<QueueScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </PlaybackProvider>
      </AudioTrackProvider>
    </ArticleLibraryProvider>
  );
}

function AudioTrackQueueSync() {
  const { getArticleById, status } = useArticleLibrary();
  const {
    state: { currentQueueItemId, queueItemIds },
  } = usePlayback();
  const { ensureTrackForArticle } = useAudioTracks();

  useEffect(() => {
    if (status !== "success" || !currentQueueItemId) {
      return;
    }

    const currentIndex = queueItemIds.indexOf(currentQueueItemId);
    const articleIdsToPrepare = [
      currentQueueItemId,
      currentIndex >= 0 ? queueItemIds[currentIndex + 1] : null,
    ].filter((articleId): articleId is string => Boolean(articleId));

    articleIdsToPrepare.forEach((articleId) => {
      const article = getArticleById(articleId);

      if (article) {
        void ensureTrackForArticle(article);
      }
    });
  }, [
    currentQueueItemId,
    ensureTrackForArticle,
    getArticleById,
    queueItemIds,
    status,
  ]);

  return null;
}
