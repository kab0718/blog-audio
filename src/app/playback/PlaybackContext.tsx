import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
import type { PlaybackState, PlayerStatus } from "../../types/playback";

type PlaybackAction =
  | { type: "setCurrentQueueItem"; queueItemId: string }
  | { type: "setQueue"; queueItemIds: string[] }
  | { type: "syncQueueWithArticles"; articleIds: string[] }
  | { type: "setPlayerStatus"; playerStatus: PlayerStatus };

type PlaybackContextValue = {
  state: PlaybackState;
  dispatch: Dispatch<PlaybackAction>;
};

const initialState: PlaybackState = {
  currentQueueItemId: null,
  queueItemIds: [],
  playerStatus: "idle",
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

      return {
        ...state,
        currentQueueItemId,
        queueItemIds: action.articleIds,
      };
    }
    case "setPlayerStatus":
      return {
        ...state,
        playerStatus: action.playerStatus,
      };
    default:
      return state;
  }
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(playbackReducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);

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
