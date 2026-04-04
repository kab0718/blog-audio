import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { mockArticles } from "../../data/mockArticles";

type PlaybackStatus = "idle" | "ready";

type PlaybackState = {
  currentArticleId: string | null;
  queueArticleIds: string[];
  status: PlaybackStatus;
};

type PlaybackAction =
  | { type: "setCurrentArticle"; articleId: string }
  | { type: "setQueue"; articleIds: string[] };

type PlaybackContextValue = {
  state: PlaybackState;
  dispatch: Dispatch<PlaybackAction>;
};

const initialState: PlaybackState = {
  currentArticleId: mockArticles[0]?.id ?? null,
  queueArticleIds: mockArticles.map((article) => article.id),
  status: "ready",
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction,
): PlaybackState {
  switch (action.type) {
    case "setCurrentArticle":
      return {
        ...state,
        currentArticleId: action.articleId,
      };
    case "setQueue":
      return {
        ...state,
        queueArticleIds: action.articleIds,
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
