import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchArticleFromUrl } from "../../sources/articleFromUrl";
import { fetchQiitaArticles } from "../../sources/qiita/articles";
import { fetchZennDailyPopularArticles } from "../../sources/zenn/articles";
import type { Article } from "../../types/article";

export type ArticleLibraryStatus = "loading" | "success" | "empty" | "error";

type ArticleLibraryState = {
  status: ArticleLibraryStatus;
  articles: Article[];
  errorMessage: string | null;
};

type ArticleLibraryContextValue = ArticleLibraryState & {
  retry: () => void;
  addArticleFromUrl: (url: string) => Promise<{
    article: Article;
    wasAlreadyInLibrary: boolean;
  }>;
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
  const manuallyAddedArticlesRef = useRef<Article[]>([]);

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
          status:
            articles.length > 0 || manuallyAddedArticlesRef.current.length > 0
              ? "success"
              : "empty",
          articles: mergeArticles(articles, manuallyAddedArticlesRef.current),
          errorMessage: null,
        });
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        if (manuallyAddedArticlesRef.current.length > 0) {
          setState({
            status: "success",
            articles: manuallyAddedArticlesRef.current,
            errorMessage: null,
          });
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

  const addArticleFromUrl = useCallback(
    async (url: string) => {
      const article = await fetchArticleFromUrl(url);
      const existingArticle = findMatchingArticle(state.articles, article);

      if (existingArticle) {
        return {
          article: existingArticle,
          wasAlreadyInLibrary: true,
        };
      }

      manuallyAddedArticlesRef.current = mergeArticles(
        manuallyAddedArticlesRef.current,
        [article],
      );

      setState((currentState) => ({
        status: "success",
        articles: mergeArticles(currentState.articles, [article]),
        errorMessage: null,
      }));

      return {
        article,
        wasAlreadyInLibrary: false,
      };
    },
    [state.articles],
  );

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
      addArticleFromUrl,
      getArticleById,
    }),
    [addArticleFromUrl, getArticleById, retry, state],
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
    fetchZennDailyPopularArticles(),
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

function mergeArticles(primaryArticles: Article[], secondaryArticles: Article[]) {
  const mergedArticles = [...primaryArticles];

  secondaryArticles.forEach((article) => {
    if (!findMatchingArticle(mergedArticles, article)) {
      mergedArticles.push(article);
    }
  });

  return mergedArticles;
}

function findMatchingArticle(articles: Article[], article: Article) {
  const normalizedUrl = normalizeArticleUrl(article.url);

  return articles.find(
    (existingArticle) =>
      existingArticle.id === article.id ||
      (existingArticle.sourceType === article.sourceType &&
        existingArticle.sourceArticleId === article.sourceArticleId) ||
      normalizeArticleUrl(existingArticle.url) === normalizedUrl,
  );
}

function normalizeArticleUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = "";
    parsedUrl.search = "";

    return parsedUrl.toString().replace(/\/$/, "");
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}
