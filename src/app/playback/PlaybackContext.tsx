import {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { PlaybackState, PlayerStatus } from "../../types/playback";
import {
  readPersistedPlaybackState,
  writePersistedPlaybackState,
} from "./playbackPersistence";

const DEFAULT_PLAYBACK_RATE = 1;
const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;

type PlaybackAction =
  | {
      type: "setCurrentQueueItem";
      queueItemId: string;
      playerStatus?: PlayerStatus;
    }
  | {
      type: "playArticleNow";
      articleId: string;
      playerStatus?: PlayerStatus;
    }
  | { type: "addArticleToQueue"; articleId: string }
  | { type: "removeQueueItem"; queueItemId: string }
  | { type: "moveQueueItem"; queueItemId: string; direction: "up" | "down" }
  | { type: "setQueue"; queueItemIds: string[] }
  | { type: "syncQueueWithArticles"; articleIds: string[] }
  | {
      type: "hydratePlaybackState";
      queueItemIds: string[];
      currentQueueItemId: string | null;
      positionSeconds: number;
    }
  | { type: "clearQueue" }
  | { type: "setPlayerStatus"; playerStatus: PlayerStatus }
  | { type: "setPlaybackPosition"; positionSeconds: number }
  | { type: "setPlaybackDuration"; durationSeconds: number | null }
  | { type: "setPlaybackRate"; playbackRate: number }
  | { type: "setSleepTimer"; endsAt: number }
  | { type: "clearSleepTimer" }
  | { type: "expireSleepTimer" }
  | { type: "setSeeking"; isSeeking: boolean }
  | { type: "setPlaybackError"; playbackError: string | null }
  | { type: "resetTrackProgress"; durationSeconds?: number | null }
  | { type: "advanceToNext"; autoplay?: boolean };

type PlaybackContextValue = {
  state: PlaybackState;
  dispatch: Dispatch<PlaybackAction>;
  play: () => void;
  pause: () => void;
  seek: (positionSeconds: number) => void;
  playArticleNow: (
    articleId: string,
    options?: { playerStatus?: PlayerStatus },
  ) => void;
  addArticleToQueue: (articleId: string) => void;
  removeQueueItem: (queueItemId: string) => void;
  moveQueueItem: (queueItemId: string, direction: "up" | "down") => void;
  clearQueue: () => void;
  selectQueueItem: (
    queueItemId: string,
    options?: { playerStatus?: PlayerStatus },
  ) => void;
  next: (options?: { autoplay?: boolean }) => void;
  setDuration: (durationSeconds: number | null) => void;
  setPlaybackRate: (playbackRate: number) => void;
  setSleepTimer: (durationMinutes: number) => void;
  clearSleepTimer: () => void;
  setSeeking: (isSeeking: boolean) => void;
  reportPlaybackError: (playbackError: string | null) => void;
  resetTrackProgress: (durationSeconds?: number | null) => void;
};

const initialState: PlaybackState = {
  currentQueueItemId: null,
  queueItemIds: [],
  playerStatus: "idle",
  playbackRate: DEFAULT_PLAYBACK_RATE,
  sleepTimerEndsAt: null,
  positionSeconds: 0,
  durationSeconds: null,
  isSeeking: false,
  playbackError: null,
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction,
): PlaybackState {
  switch (action.type) {
    case "setCurrentQueueItem":
      return {
        ...state,
        currentQueueItemId: action.queueItemId,
        queueItemIds: appendUnique(state.queueItemIds, action.queueItemId),
        playerStatus: action.playerStatus ?? "idle",
        ...createResetTrackProgressState(),
      };
    case "playArticleNow":
      return {
        ...state,
        currentQueueItemId: action.articleId,
        queueItemIds: appendUnique(state.queueItemIds, action.articleId),
        playerStatus: action.playerStatus ?? "idle",
        ...createResetTrackProgressState(),
      };
    case "addArticleToQueue":
      if (state.queueItemIds.includes(action.articleId)) {
        return state;
      }

      return {
        ...state,
        queueItemIds: [...state.queueItemIds, action.articleId],
      };
    case "removeQueueItem":
      if (action.queueItemId === state.currentQueueItemId) {
        return state;
      }

      return {
        ...state,
        queueItemIds: state.queueItemIds.filter(
          (queueItemId) => queueItemId !== action.queueItemId,
        ),
      };
    case "moveQueueItem":
      return {
        ...state,
        queueItemIds: moveQueueItem(
          state.queueItemIds,
          action.queueItemId,
          action.direction,
          state.currentQueueItemId,
        ),
      };
    case "setQueue":
      return {
        ...state,
        queueItemIds: action.queueItemIds,
      };
    case "syncQueueWithArticles": {
      const availableArticleIds = new Set(action.articleIds);
      const queueItemIds = state.queueItemIds.filter((queueItemId) =>
        availableArticleIds.has(queueItemId),
      );
      const currentQueueItemId =
        state.currentQueueItemId &&
        queueItemIds.includes(state.currentQueueItemId)
          ? state.currentQueueItemId
          : queueItemIds[0] ?? null;

      if (
        state.currentQueueItemId === currentQueueItemId &&
        areStringArraysEqual(state.queueItemIds, queueItemIds)
      ) {
        return state;
      }

      const currentChanged = state.currentQueueItemId !== currentQueueItemId;

      return {
        ...state,
        currentQueueItemId,
        queueItemIds,
        ...(currentChanged ? createResetTrackProgressState() : {}),
      };
    }
    case "hydratePlaybackState": {
      const queueItemIds = uniqueStrings(action.queueItemIds);
      const currentQueueItemId =
        action.currentQueueItemId &&
        queueItemIds.includes(action.currentQueueItemId)
          ? action.currentQueueItemId
          : queueItemIds[0] ?? null;

      return {
        ...state,
        currentQueueItemId,
        queueItemIds,
        playerStatus: "idle",
        positionSeconds: clampPosition(
          action.positionSeconds,
          state.durationSeconds,
        ),
        durationSeconds: null,
        isSeeking: false,
        playbackError: null,
      };
    }
    case "clearQueue":
      return {
        ...state,
        currentQueueItemId: null,
        queueItemIds: [],
        playerStatus: "idle",
        ...createResetTrackProgressState(),
      };
    case "setPlayerStatus":
      return {
        ...state,
        playerStatus: action.playerStatus,
        playbackError:
          action.playerStatus === "playing" ? null : state.playbackError,
      };
    case "setPlaybackPosition":
      return {
        ...state,
        positionSeconds: clampPosition(
          action.positionSeconds,
          state.durationSeconds,
        ),
      };
    case "setPlaybackDuration":
      const durationSeconds = normalizeDuration(action.durationSeconds);

      return {
        ...state,
        durationSeconds,
        positionSeconds: clampPosition(state.positionSeconds, durationSeconds),
      };
    case "setPlaybackRate":
      return {
        ...state,
        playbackRate: normalizePlaybackRate(action.playbackRate),
      };
    case "setSleepTimer":
      return {
        ...state,
        sleepTimerEndsAt: action.endsAt,
      };
    case "clearSleepTimer":
      return {
        ...state,
        sleepTimerEndsAt: null,
      };
    case "expireSleepTimer":
      return {
        ...state,
        playerStatus: "paused",
        sleepTimerEndsAt: null,
      };
    case "setSeeking":
      return {
        ...state,
        isSeeking: action.isSeeking,
      };
    case "setPlaybackError":
      return {
        ...state,
        playbackError: action.playbackError,
        playerStatus: action.playbackError ? "paused" : state.playerStatus,
      };
    case "resetTrackProgress":
      return {
        ...state,
        ...createResetTrackProgressState(action.durationSeconds),
      };
    case "advanceToNext": {
      const currentIndex = state.currentQueueItemId
        ? state.queueItemIds.indexOf(state.currentQueueItemId)
        : -1;
      const nextQueueItemId =
        currentIndex >= 0
          ? state.queueItemIds[currentIndex + 1]
          : state.queueItemIds[0] ?? null;

      if (!nextQueueItemId) {
        return {
          ...state,
          playerStatus: "paused",
          isSeeking: false,
        };
      }

      return {
        ...state,
        currentQueueItemId: nextQueueItemId,
        playerStatus: action.autoplay ? "playing" : "idle",
        ...createResetTrackProgressState(),
      };
    }
    default:
      return state;
  }
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    playbackReducer,
    initialState,
    getInitialPlaybackState,
  );
  const persistenceTimeoutRef = useRef<number | null>(null);
  const lastPersistenceWriteAtRef = useRef(0);

  useEffect(() => {
    if (!state.sleepTimerEndsAt) {
      return;
    }

    const delayMs = Math.max(0, state.sleepTimerEndsAt - Date.now());
    const timeoutId = window.setTimeout(() => {
      dispatch({ type: "expireSleepTimer" });
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state.sleepTimerEndsAt]);

  useEffect(() => {
    const elapsedMs = Date.now() - lastPersistenceWriteAtRef.current;
    const shouldWriteImmediately =
      elapsedMs >= 1500 || state.playerStatus !== "playing";

    if (persistenceTimeoutRef.current !== null) {
      window.clearTimeout(persistenceTimeoutRef.current);
      persistenceTimeoutRef.current = null;
    }

    const writeState = () => {
      writePersistedPlaybackState(state);
      lastPersistenceWriteAtRef.current = Date.now();
      persistenceTimeoutRef.current = null;
    };

    if (shouldWriteImmediately) {
      writeState();
      return;
    }

    persistenceTimeoutRef.current = window.setTimeout(
      writeState,
      1500 - elapsedMs,
    );

    return () => {
      if (persistenceTimeoutRef.current !== null) {
        window.clearTimeout(persistenceTimeoutRef.current);
        persistenceTimeoutRef.current = null;
      }
    };
  }, [
    state.currentQueueItemId,
    state.playerStatus,
    state.positionSeconds,
    state.queueItemIds,
  ]);

  const play = useCallback(
    () => dispatch({ type: "setPlayerStatus", playerStatus: "playing" }),
    [],
  );
  const pause = useCallback(
    () => dispatch({ type: "setPlayerStatus", playerStatus: "paused" }),
    [],
  );
  const seek = useCallback(
    (positionSeconds: number) =>
      dispatch({ type: "setPlaybackPosition", positionSeconds }),
    [],
  );
  const playArticleNow = useCallback(
    (articleId: string, options?: { playerStatus?: PlayerStatus }) =>
      dispatch({
        type: "playArticleNow",
        articleId,
        playerStatus: options?.playerStatus,
      }),
    [],
  );
  const addArticleToQueue = useCallback(
    (articleId: string) => dispatch({ type: "addArticleToQueue", articleId }),
    [],
  );
  const removeQueueItem = useCallback(
    (queueItemId: string) =>
      dispatch({ type: "removeQueueItem", queueItemId }),
    [],
  );
  const moveQueueItemCallback = useCallback(
    (queueItemId: string, direction: "up" | "down") =>
      dispatch({ type: "moveQueueItem", queueItemId, direction }),
    [],
  );
  const clearQueue = useCallback(() => dispatch({ type: "clearQueue" }), []);
  const selectQueueItem = useCallback(
    (queueItemId: string, options?: { playerStatus?: PlayerStatus }) =>
      dispatch({
        type: "setCurrentQueueItem",
        queueItemId,
        playerStatus: options?.playerStatus,
      }),
    [],
  );
  const next = useCallback(
    (options?: { autoplay?: boolean }) =>
      dispatch({ type: "advanceToNext", autoplay: options?.autoplay }),
    [],
  );
  const setDuration = useCallback(
    (durationSeconds: number | null) =>
      dispatch({ type: "setPlaybackDuration", durationSeconds }),
    [],
  );
  const setPlaybackRate = useCallback(
    (playbackRate: number) =>
      dispatch({ type: "setPlaybackRate", playbackRate }),
    [],
  );
  const setSleepTimer = useCallback((durationMinutes: number) => {
    const safeDurationMinutes = Math.max(1, Math.floor(durationMinutes));
    dispatch({
      type: "setSleepTimer",
      endsAt: Date.now() + safeDurationMinutes * 60 * 1000,
    });
  }, []);
  const clearSleepTimer = useCallback(
    () => dispatch({ type: "clearSleepTimer" }),
    [],
  );
  const setSeeking = useCallback(
    (isSeeking: boolean) => dispatch({ type: "setSeeking", isSeeking }),
    [],
  );
  const reportPlaybackError = useCallback(
    (playbackError: string | null) =>
      dispatch({ type: "setPlaybackError", playbackError }),
    [],
  );
  const resetTrackProgress = useCallback(
    (durationSeconds?: number | null) =>
      dispatch({ type: "resetTrackProgress", durationSeconds }),
    [],
  );

  const value = useMemo(
    () => ({
      state,
      dispatch,
      play,
      pause,
      seek,
      playArticleNow,
      addArticleToQueue,
      removeQueueItem,
      moveQueueItem: moveQueueItemCallback,
      clearQueue,
      selectQueueItem,
      next,
      setDuration,
      setPlaybackRate,
      setSleepTimer,
      clearSleepTimer,
      setSeeking,
      reportPlaybackError,
      resetTrackProgress,
    }),
    [
      addArticleToQueue,
      clearQueue,
      clearSleepTimer,
      moveQueueItemCallback,
      next,
      pause,
      play,
      playArticleNow,
      reportPlaybackError,
      resetTrackProgress,
      removeQueueItem,
      seek,
      selectQueueItem,
      setDuration,
      setPlaybackRate,
      setSeeking,
      setSleepTimer,
      state,
    ],
  );

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const context = useContext(PlaybackContext);

  if (!context) {
    throw new Error("usePlayback must be used within a PlaybackProvider");
  }

  return context;
}

function areStringArraysEqual(first: string[], second: string[]) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function appendUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value];
}

function uniqueStrings(values: string[]) {
  const seenValues = new Set<string>();
  const uniqueValues: string[] = [];

  values.forEach((value) => {
    if (!value || seenValues.has(value)) {
      return;
    }

    seenValues.add(value);
    uniqueValues.push(value);
  });

  return uniqueValues;
}

function moveQueueItem(
  queueItemIds: string[],
  queueItemId: string,
  direction: "up" | "down",
  currentQueueItemId: string | null,
) {
  if (queueItemId === currentQueueItemId) {
    return queueItemIds;
  }

  const currentIndex = queueItemIds.indexOf(queueItemId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= queueItemIds.length ||
    queueItemIds[targetIndex] === currentQueueItemId
  ) {
    return queueItemIds;
  }

  const nextQueueItemIds = [...queueItemIds];
  const targetQueueItemId = nextQueueItemIds[targetIndex];

  nextQueueItemIds[targetIndex] = queueItemId;
  nextQueueItemIds[currentIndex] = targetQueueItemId;

  return nextQueueItemIds;
}

function createResetTrackProgressState(durationSeconds?: number | null) {
  return {
    positionSeconds: 0,
    durationSeconds: normalizeDuration(durationSeconds ?? null),
    isSeeking: false,
    playbackError: null,
  };
}

function normalizeDuration(durationSeconds: number | null) {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
    return null;
  }

  return Math.max(0, durationSeconds);
}

function clampPosition(positionSeconds: number, durationSeconds: number | null) {
  const safePositionSeconds = Number.isFinite(positionSeconds)
    ? Math.max(0, positionSeconds)
    : 0;

  if (durationSeconds === null) {
    return safePositionSeconds;
  }

  return Math.min(safePositionSeconds, durationSeconds);
}

function normalizePlaybackRate(playbackRate: number) {
  if (!Number.isFinite(playbackRate)) {
    return DEFAULT_PLAYBACK_RATE;
  }

  return Math.min(
    MAX_PLAYBACK_RATE,
    Math.max(MIN_PLAYBACK_RATE, Number(playbackRate.toFixed(2))),
  );
}

function getInitialPlaybackState(state: PlaybackState): PlaybackState {
  const persistedState = readPersistedPlaybackState();

  if (!persistedState) {
    return state;
  }

  return playbackReducer(state, {
    type: "hydratePlaybackState",
    queueItemIds: persistedState.queueItemIds,
    currentQueueItemId: persistedState.currentQueueItemId,
    positionSeconds: persistedState.positionSeconds,
  });
}
