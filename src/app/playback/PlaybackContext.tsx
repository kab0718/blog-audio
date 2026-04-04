import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { initialQueueItemIds, mockArticles } from "../../data/mockLibrary";
import type { PlaybackState, PlayerStatus } from "../../types/playback";

type PlaybackAction =
  | { type: "setCurrentQueueItem"; queueItemId: string }
  | { type: "setQueue"; queueItemIds: string[] }
  | { type: "setPlayerStatus"; playerStatus: PlayerStatus };

type PlaybackContextValue = {
  state: PlaybackState;
  dispatch: Dispatch<PlaybackAction>;
};

const initialState: PlaybackState = {
  currentQueueItemId: mockArticles[0]?.id ?? null,
  queueItemIds: initialQueueItemIds,
  playerStatus: "paused",
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
