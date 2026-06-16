import { useEffect, useMemo, useRef } from "react";
import { useArticleLibrary } from "../../app/articles/ArticleLibraryContext";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { useAudioTracks } from "../../app/tracks/AudioTrackContext";
import { toNowPlayingViewModel } from "../../view-models/library";
import styles from "./PlayerScreen.module.css";

const PLAYBACK_RATE_PRESETS = [0.8, 1, 1.2, 1.5, 2];
const SLEEP_TIMER_PRESETS_MINUTES = [15, 30, 45, 60];

export function PlayerScreen() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { getArticleById, status } = useArticleLibrary();
  const {
    state: {
      currentQueueItemId,
      durationSeconds,
      isSeeking,
      playbackError,
      playbackRate,
      playerStatus,
      positionSeconds,
      queueItemIds,
      sleepTimerEndsAt,
    },
    clearSleepTimer,
    next,
    pause,
    play,
    reportPlaybackError,
    resetTrackProgress,
    seek,
    selectQueueItem,
    setDuration,
    setPlaybackRate,
    setSeeking,
    setSleepTimer,
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
  const resolvedDurationSeconds = getResolvedDurationSeconds(
    durationSeconds,
    track?.durationSeconds,
    article?.estimatedDurationSeconds ?? 0,
  );
  const displayPositionSeconds = clampSeconds(
    positionSeconds,
    resolvedDurationSeconds,
  );
  const canSeek = canPlay && resolvedDurationSeconds > 0;

  useEffect(() => {
    resetTrackProgress(track?.durationSeconds ?? null);
  }, [currentQueueItemId, resetTrackProgress, track?.durationSeconds]);

  useEffect(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.playbackRate = playbackRate;
    }
  }, [playbackRate, playbackUrl]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (!canPlay || playerStatus !== "playing") {
      audio.pause();

      if (!canPlay && playerStatus === "playing") {
        pause();
      }

      return;
    }

    void audio.play().catch(() => {
      reportPlaybackError("音声を再生できませんでした。");
    });
  }, [canPlay, pause, playbackUrl, playerStatus, reportPlaybackError]);

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

  const startPlayback = () => {
    const audio = audioRef.current;

    if (!audio || !canPlay) {
      return;
    }

    void audio
      .play()
      .then(() => {
        reportPlaybackError(null);
        play();
      })
      .catch(() => {
        reportPlaybackError("音声を再生できませんでした。");
      });
  };

  const handlePrimaryAction = () => {
    if (track?.status === "failed") {
      void retryTrackForArticle(article);
      pause();
      return;
    }

    if (!canPlay) {
      return;
    }

    if (playerStatus === "playing") {
      audioRef.current?.pause();
      pause();
      return;
    }

    startPlayback();
  };

  const moveToQueueItem = (
    queueItemId: string | null,
    options?: { autoplay?: boolean },
  ) => {
    if (!queueItemId) {
      return;
    }

    selectQueueItem(queueItemId, {
      playerStatus: options?.autoplay ? "playing" : "idle",
    });
  };

  const handleSeek = (value: string) => {
    const audio = audioRef.current;
    const nextPositionSeconds = clampSeconds(
      Number(value),
      resolvedDurationSeconds,
    );

    if (!audio || !canSeek) {
      return;
    }

    setSeeking(true);
    audio.currentTime = nextPositionSeconds;
    seek(nextPositionSeconds);
    setSeeking(false);
  };

  return (
    <section className={styles.screen}>
      {playbackUrl ? (
        <audio
          ref={audioRef}
          src={playbackUrl}
          onError={() => {
            reportPlaybackError("音声リソースを読み込めませんでした。");
          }}
          onEnded={() => {
            next({ autoplay: Boolean(nextQueueItemId) });
          }}
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration);
            event.currentTarget.playbackRate = playbackRate;
          }}
          onTimeUpdate={(event) => {
            if (!isSeeking) {
              seek(event.currentTarget.currentTime);
            }
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

      <div className={styles.progressPanel}>
        <div className={styles.timeRow}>
          <span>{formatTimeLabel(displayPositionSeconds)}</span>
          <span>{formatDurationTimeLabel(resolvedDurationSeconds)}</span>
        </div>
        <input
          className={styles.seekBar}
          type="range"
          min="0"
          max={Math.max(1, Math.round(resolvedDurationSeconds))}
          step="1"
          value={Math.round(displayPositionSeconds)}
          disabled={!canSeek}
          aria-label="再生位置"
          onChange={(event) => handleSeek(event.target.value)}
        />
        <p className={styles.progressCopy}>
          {canSeek
            ? "再生位置を調整できます。"
            : getSeekUnavailableCopy(track?.status)}
        </p>
        {playbackError ? (
          <p className={styles.errorCopy}>{playbackError}</p>
        ) : null}
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
          onClick={() => next({ autoplay: playerStatus === "playing" })}
        >
          Next
        </button>
      </div>

      <div className={styles.settingsPanel}>
        <div className={styles.settingGroup}>
          <div className={styles.settingHeader}>
            <span className={styles.label}>Speed</span>
            <strong>{formatPlaybackRateLabel(playbackRate)}</strong>
          </div>
          <div className={styles.segmentedControl}>
            {PLAYBACK_RATE_PRESETS.map((rate) => (
              <button
                key={rate}
                type="button"
                className={
                  playbackRate === rate
                    ? `${styles.segmentButton} ${styles.segmentButtonActive}`
                    : styles.segmentButton
                }
                onClick={() => setPlaybackRate(rate)}
              >
                {formatPlaybackRateLabel(rate)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.settingGroup}>
          <div className={styles.settingHeader}>
            <span className={styles.label}>Sleep timer</span>
            <strong>{formatSleepTimerLabel(sleepTimerEndsAt)}</strong>
          </div>
          <div className={styles.segmentedControl}>
            {SLEEP_TIMER_PRESETS_MINUTES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={styles.segmentButton}
                onClick={() => setSleepTimer(minutes)}
              >
                {minutes}m
              </button>
            ))}
            <button
              type="button"
              className={
                sleepTimerEndsAt
                  ? styles.segmentButton
                  : `${styles.segmentButton} ${styles.segmentButtonActive}`
              }
              onClick={clearSleepTimer}
            >
              Off
            </button>
          </div>
        </div>
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

function getResolvedDurationSeconds(
  playbackDurationSeconds: number | null,
  trackDurationSeconds: number | null | undefined,
  estimatedDurationSeconds: number,
) {
  return (
    normalizeDuration(playbackDurationSeconds) ??
    normalizeDuration(trackDurationSeconds) ??
    normalizeDuration(estimatedDurationSeconds) ??
    0
  );
}

function normalizeDuration(durationSeconds: number | null | undefined) {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
    return null;
  }

  return Math.max(0, durationSeconds);
}

function clampSeconds(positionSeconds: number, durationSeconds: number) {
  if (!Number.isFinite(positionSeconds)) {
    return 0;
  }

  if (durationSeconds <= 0) {
    return Math.max(0, positionSeconds);
  }

  return Math.min(Math.max(0, positionSeconds), durationSeconds);
}

function formatTimeLabel(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDurationTimeLabel(totalSeconds: number) {
  const safeSeconds =
    totalSeconds > 0 ? Math.max(1, Math.ceil(totalSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPlaybackRateLabel(playbackRate: number) {
  return `${playbackRate.toFixed(1).replace(/\.0$/, "")}x`;
}

function formatSleepTimerLabel(sleepTimerEndsAt: number | null) {
  if (!sleepTimerEndsAt) {
    return "Off";
  }

  const remainingSeconds = Math.max(
    0,
    Math.ceil((sleepTimerEndsAt - Date.now()) / 1000),
  );
  const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));

  return `${remainingMinutes} min left`;
}

function getSeekUnavailableCopy(status: string | undefined) {
  switch (status) {
    case "failed":
      return "音声生成に失敗したため、シークできません。";
    case "ready":
      return "再生時間を取得するとシークできます。";
    case "generating":
    default:
      return "音声トラックを準備中です。";
  }
}
