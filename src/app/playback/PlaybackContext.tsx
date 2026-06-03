import {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import type { PlaybackState, PlayerStatus } from "../../types/playback";

type PlaybackAction =
  | {
      type: "setCurrentQueueItem";
      queueItemId: string;
      playerStatus?: PlayerStatus;
    }
  | { type: "setQueue"; queueItemIds: string[] }
  | { type: "syncQueueWithArticles"; articleIds: string[] }
  | { type: "setPlayerStatus"; playerStatus: PlayerStatus }
  | { type: "setPlaybackPosition"; positionSeconds: number }
  | { type: "setPlaybackDuration"; durationSeconds: number | null }
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
  selectQueueItem: (
    queueItemId: string,
    options?: { playerStatus?: PlayerStatus },
  ) => void;
  next: (options?: { autoplay?: boolean }) => void;
  setDuration: (durationSeconds: number | null) => void;
  setSeeking: (isSeeking: boolean) => void;
  reportPlaybackError: (playbackError: string | null) => void;
  resetTrackProgress: (durationSeconds?: number | null) => void;
};

const initialState: PlaybackState = {
  currentQueueItemId: null,
  queueItemIds: [],
  playerStatus: "idle",
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
        playerStatus: action.playerStatus ?? "idle",
        ...createResetTrackProgressState(),
      };
    case "setQueue":
      return {
        ...state,
        queueItemIds: action.queueItemIds,
      };
    case "syncQueueWithArticles": {
      const currentQueueItemId =
        state.currentQueueItemId &&
        action.articleIds.includes(state.currentQueueItemId)
          ? state.currentQueueItemId
          : action.articleIds[0] ?? null;

      if (
        state.currentQueueItemId === currentQueueItemId &&
        areStringArraysEqual(state.queueItemIds, action.articleIds)
      ) {
        return state;
      }

      const currentChanged = state.currentQueueItemId !== currentQueueItemId;

      return {
        ...state,
        currentQueueItemId,
        queueItemIds: action.articleIds,
        ...(currentChanged ? createResetTrackProgressState() : {}),
      };
    }
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
        positionSeconds: Math.max(0, action.positionSeconds),
      };
    case "setPlaybackDuration":
      return {
        ...state,
        durationSeconds: normalizeDuration(action.durationSeconds),
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
        currentIndex >= 0 ? state.queueItemIds[currentIndex + 1] : null;

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
  const [state, dispatch] = useReducer(playbackReducer, initialState);
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
      selectQueueItem,
      next,
      setDuration,
      setSeeking,
      reportPlaybackError,
      resetTrackProgress,
    }),
    [
      next,
      pause,
      play,
      reportPlaybackError,
      resetTrackProgress,
      seek,
      selectQueueItem,
      setDuration,
      setSeeking,
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
