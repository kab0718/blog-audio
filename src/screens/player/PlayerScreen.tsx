import { useEffect, useMemo, useRef } from "react";
import { useArticleLibrary } from "../../app/articles/ArticleLibraryContext";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { useAudioTracks } from "../../app/tracks/AudioTrackContext";
import { toNowPlayingViewModel } from "../../view-models/library";
import styles from "./PlayerScreen.module.css";

export function PlayerScreen() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { getArticleById, status } = useArticleLibrary();
  const {
    state: { currentQueueItemId, playerStatus, queueItemIds },
    dispatch,
  } = usePlayback();
  const { getTrackByArticleId, retryTrackForArticle } = useAudioTracks();

  const article = getArticleById(currentQueueItemId);
  const currentQueueIndex = currentQueueItemId
    ? queueItemIds.indexOf(currentQueueItemId)
    : -1;
  const previousQueueItemId = useMemo(() => {
    if (currentQueueIndex <= 0) {
      return null;
    }

    return queueItemIds[currentQueueIndex - 1] ?? null;
  }, [currentQueueIndex, queueItemIds]);
  const nextQueueItemId = useMemo(() => {
    if (currentQueueIndex < 0) {
      return null;
    }

    return queueItemIds[currentQueueIndex + 1] ?? null;
  }, [currentQueueIndex, queueItemIds]);

  const track = article ? getTrackByArticleId(article.id) : undefined;
  const playbackUrl =
    track?.status === "ready" ? track.playbackResource?.url : undefined;
  const canPlay = Boolean(playbackUrl);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (!canPlay || playerStatus !== "playing") {
      audio.pause();
      return;
    }

    void audio.play().catch(() => {
      dispatch({ type: "setPlayerStatus", playerStatus: "paused" });
    });
  }, [canPlay, dispatch, playbackUrl, playerStatus]);

  if (!article) {
    return (
      <section className={styles.screen}>
        <div className={styles.hero}>
          <p className={styles.kicker}>Player</p>
          <h2 className={styles.title}>再生対象なし</h2>
          <p className={styles.meta}>{getEmptyPlayerCopy(status)}</p>
        </div>
        <div className={styles.emptyState}>
          記事一覧の取得後、記事を選ぶとここに再生対象が表示されます。
        </div>
      </section>
    );
  }

  const viewModel = toNowPlayingViewModel(article, track, playerStatus);

  const handlePrimaryAction = () => {
    if (track?.status === "failed") {
      void retryTrackForArticle(article);
      dispatch({ type: "setPlayerStatus", playerStatus: "idle" });
      return;
    }

    if (!canPlay) {
      return;
    }

    dispatch({
      type: "setPlayerStatus",
      playerStatus: playerStatus === "playing" ? "paused" : "playing",
    });
  };

  const moveToQueueItem = (queueItemId: string | null) => {
    if (!queueItemId) {
      return;
    }

    dispatch({ type: "setCurrentQueueItem", queueItemId });
    dispatch({ type: "setPlayerStatus", playerStatus: "idle" });
  };

  return (
    <section className={styles.screen}>
      {playbackUrl ? (
        <audio
          ref={audioRef}
          src={playbackUrl}
          onEnded={() => {
            dispatch({ type: "setPlayerStatus", playerStatus: "paused" });
          }}
        />
      ) : null}

      <div className={styles.hero}>
        <p className={styles.kicker}>Player</p>
        <h2 className={styles.title}>{viewModel.title}</h2>
        <p className={styles.meta}>{viewModel.metaLine}</p>
      </div>

      <div className={styles.wavePlane} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className={styles.readout}>
        <div>
          <span className={styles.label}>Audio track</span>
          <p className={styles.value}>
            {viewModel.audioTrackLabel} / {viewModel.audioTrackCopy}
          </p>
        </div>
        <div>
          <span className={styles.label}>Playback state</span>
          <p className={styles.value}>
            {viewModel.playerStatusLabel} / {viewModel.playbackResourceCopy}
          </p>
        </div>
      </div>

      <div className={styles.controlRail}>
        <button
          type="button"
          className={styles.control}
          disabled={!previousQueueItemId}
          onClick={() => moveToQueueItem(previousQueueItemId)}
        >
          Prev
        </button>
        <button
          type="button"
          className={`${styles.control} ${styles.controlPrimary}`}
          disabled={track?.status !== "failed" && !canPlay}
          onClick={handlePrimaryAction}
        >
          {viewModel.primaryActionLabel}
        </button>
        <button
          type="button"
          className={styles.control}
          disabled={!nextQueueItemId}
          onClick={() => moveToQueueItem(nextQueueItemId)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

function getEmptyPlayerCopy(status: string) {
  switch (status) {
    case "loading":
      return "記事一覧を読み込んでいます。";
    case "error":
      return "記事一覧を取得できないため、再生対象を選べません。";
    case "empty":
      return "表示できる記事がありません。";
    default:
      return "記事一覧から再生する記事を選択してください。";
  }
}
