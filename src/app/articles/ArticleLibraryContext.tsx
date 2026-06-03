import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchQiitaArticles } from "../../sources/qiita/articles";
import { fetchZennLatestArticles } from "../../sources/zenn/articles";
import type { Article } from "../../types/article";

export type ArticleLibraryStatus = "loading" | "success" | "empty" | "error";

type ArticleLibraryState = {
  status: ArticleLibraryStatus;
  articles: Article[];
  errorMessage: string | null;
};

type ArticleLibraryContextValue = ArticleLibraryState & {
  retry: () => void;
  getArticleById: (articleId: string | null) => Article | undefined;
};

const initialState: ArticleLibraryState = {
  status: "loading",
  articles: [],
  errorMessage: null,
};

const ArticleLibraryContext =
  createContext<ArticleLibraryContextValue | null>(null);

export function ArticleLibraryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ArticleLibraryState>(initialState);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    setState((currentState) => ({
      status: "loading",
      articles: currentState.articles,
      errorMessage: null,
    }));

    fetchArticleLibraryArticles()
      .then((articles) => {
        if (!isActive) {
          return;
        }

        setState({
          status: articles.length > 0 ? "success" : "empty",
          articles,
          errorMessage: null,
        });
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setState({
          status: "error",
          articles: [],
          errorMessage:
            error instanceof Error
              ? error.message
              : "Article sources could not be loaded",
        });
      });

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  const retry = useCallback(() => {
    setReloadKey((currentKey) => currentKey + 1);
  }, []);

  const getArticleById = useCallback(
    (articleId: string | null) => {
      if (!articleId) {
        return undefined;
      }

      return state.articles.find((article) => article.id === articleId);
    },
    [state.articles],
  );

  const value = useMemo(
    () => ({
      ...state,
      retry,
      getArticleById,
    }),
    [getArticleById, retry, state],
  );

  return (
    <ArticleLibraryContext.Provider value={value}>
      {children}
    </ArticleLibraryContext.Provider>
  );
}

export function useArticleLibrary() {
  const context = useContext(ArticleLibraryContext);

  if (!context) {
    throw new Error(
      "useArticleLibrary must be used within an ArticleLibraryProvider",
    );
  }

  return context;
}

async function fetchArticleLibraryArticles() {
  const articleResults = await Promise.allSettled([
    fetchZennLatestArticles(),
    fetchQiitaArticles(),
  ]);

  const articles = articleResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (articles.length > 0 || articleResults.some(isFulfilledArticleResult)) {
    return articles;
  }

  throw new Error("Article sources could not be loaded");
}

function isFulfilledArticleResult(
  result: PromiseSettledResult<Article[]>,
): result is PromiseFulfilledResult<Article[]> {
  return result.status === "fulfilled";
}
