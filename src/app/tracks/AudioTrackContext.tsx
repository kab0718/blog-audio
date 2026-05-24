import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadArticleContent } from "../../content/articleContentService";
import { generateNarrationScript } from "../../narration/articleNarration";
import {
  createFailedAudioTrack,
  createGeneratingAudioTrack,
  generateAudioTrack,
} from "../../tracks/audioTrackService";
import type { Article } from "../../types/article";
import type { AudioTrack } from "../../types/audioTrack";

type AudioTrackContextValue = {
  tracksByArticleId: Record<string, AudioTrack>;
  getTrackByArticleId: (articleId: string | null) => AudioTrack | undefined;
  ensureTrackForArticle: (article: Article) => Promise<AudioTrack>;
  retryTrackForArticle: (article: Article) => Promise<AudioTrack>;
};

const AudioTrackContext = createContext<AudioTrackContextValue | null>(null);

export function AudioTrackProvider({ children }: { children: ReactNode }) {
  const [tracksByArticleId, setTracksByArticleId] = useState<
    Record<string, AudioTrack>
  >({});
  const inFlightRequests = useRef(new Map<string, Promise<AudioTrack>>());

  const setTrack = useCallback((track: AudioTrack) => {
    setTracksByArticleId((currentTracks) => ({
      ...currentTracks,
      [track.articleId]: track,
    }));
  }, []);

  const ensureTrackForArticle = useCallback(
    (article: Article) => {
      const cachedTrack = tracksByArticleId[article.id];

      if (cachedTrack?.status === "ready" || cachedTrack?.status === "failed") {
        return Promise.resolve(cachedTrack);
      }

      const inFlightRequest = inFlightRequests.current.get(article.id);

      if (inFlightRequest) {
        return inFlightRequest;
      }

      const generatingTrack = createGeneratingAudioTrack(article);
      setTrack(generatingTrack);

      const request = buildTrackForArticle(article)
        .then((track) => {
          setTrack(track);
          return track;
        })
        .catch((error: unknown) => {
          const failedTrack = createFailedAudioTrack(
            article,
            error instanceof Error
              ? error.message
              : "Audio track could not be generated",
          );
          setTrack(failedTrack);
          return failedTrack;
        })
        .finally(() => {
          inFlightRequests.current.delete(article.id);
        });

      inFlightRequests.current.set(article.id, request);

      return request;
    },
    [setTrack, tracksByArticleId],
  );

  const retryTrackForArticle = useCallback(
    (article: Article) => {
      inFlightRequests.current.delete(article.id);
      setTrack(createGeneratingAudioTrack(article));

      const request = buildTrackForArticle(article)
        .then((track) => {
          setTrack(track);
          return track;
        })
        .catch((error: unknown) => {
          const failedTrack = createFailedAudioTrack(
            article,
            error instanceof Error
              ? error.message
              : "Audio track could not be generated",
          );
          setTrack(failedTrack);
          return failedTrack;
        })
        .finally(() => {
          inFlightRequests.current.delete(article.id);
        });

      inFlightRequests.current.set(article.id, request);

      return request;
    },
    [setTrack],
  );

  const getTrackByArticleId = useCallback(
    (articleId: string | null) => {
      if (!articleId) {
        return undefined;
      }

      return tracksByArticleId[articleId];
    },
    [tracksByArticleId],
  );

  const value = useMemo(
    () => ({
      tracksByArticleId,
      getTrackByArticleId,
      ensureTrackForArticle,
      retryTrackForArticle,
    }),
    [
      ensureTrackForArticle,
      getTrackByArticleId,
      retryTrackForArticle,
      tracksByArticleId,
    ],
  );

  return (
    <AudioTrackContext.Provider value={value}>
      {children}
    </AudioTrackContext.Provider>
  );
}

export function useAudioTracks() {
  const context = useContext(AudioTrackContext);

  if (!context) {
    throw new Error("useAudioTracks must be used within an AudioTrackProvider");
  }

  return context;
}

async function buildTrackForArticle(article: Article) {
  const content = await loadArticleContent(article);
  const narration = generateNarrationScript(content);

  if (narration.status === "failed") {
    throw new Error(narration.errorMessage);
  }

  return generateAudioTrack(article, narration.script);
}
