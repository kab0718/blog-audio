import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchArticleFromUrl } from "../../sources/articleFromUrl";
import { fetchQiitaArticles, searchQiitaArticles, type ArticleSearchConditions } from "../../sources/qiita/articles";
import { fetchZennDailyPopularArticles, searchZennArticles } from "../../sources/zenn/articles";
import type { Article } from "../../types/article";

export type ArticleLibraryStatus = "loading" | "success" | "empty" | "error";
export type SearchProvider = "all" | "qiita" | "zenn";
export type ArticleSearchRequest = ArticleSearchConditions & { provider: SearchProvider };
export type ArticleSearchState = {
  status: "idle" | "loading" | "success" | "empty" | "error";
  request: ArticleSearchRequest | null;
  resultRequest: ArticleSearchRequest | null;
  articles: Article[];
  errorMessage: string | null;
  failedProviders: Exclude<SearchProvider, "all">[];
  hasNextPage: boolean;
};

type ArticleLibraryState = { status: ArticleLibraryStatus; articles: Article[]; errorMessage: string | null };
type ArticleLibraryContextValue = ArticleLibraryState & {
  search: ArticleSearchState;
  retry: () => void;
  runSearch: (request: ArticleSearchRequest) => Promise<void>;
  retrySearch: () => Promise<void>;
  clearSearch: () => void;
  addArticleFromUrl: (url: string) => Promise<{ article: Article; wasAlreadyInLibrary: boolean }>;
  getArticleById: (articleId: string | null) => Article | undefined;
};

const initialState: ArticleLibraryState = { status: "loading", articles: [], errorMessage: null };
const initialSearchState: ArticleSearchState = { status: "idle", request: null, resultRequest: null, articles: [], errorMessage: null, failedProviders: [], hasNextPage: false };
const ArticleLibraryContext = createContext<ArticleLibraryContextValue | null>(null);

export function ArticleLibraryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ArticleLibraryState>(initialState);
  const [search, setSearch] = useState<ArticleSearchState>(initialSearchState);
  const [reloadKey, setReloadKey] = useState(0);
  const libraryRef = useRef<Article[]>([]);
  const manuallyAddedArticlesRef = useRef<Article[]>([]);
  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    let isActive = true;
    setState((current) => ({ ...current, status: "loading", errorMessage: null }));
    fetchArticleLibraryArticles().then((articles) => {
      if (!isActive) return;
      const merged = mergeArticles(articles, manuallyAddedArticlesRef.current);
      libraryRef.current = mergeArticles(libraryRef.current, merged);
      setState({ status: merged.length ? "success" : "empty", articles: merged, errorMessage: null });
    }).catch((error: unknown) => {
      if (!isActive) return;
      const articles = manuallyAddedArticlesRef.current;
      setState({ status: articles.length ? "success" : "error", articles, errorMessage: articles.length ? null : toErrorMessage(error, "Article sources could not be loaded") });
    });
    return () => { isActive = false; };
  }, [reloadKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  const runSearch = useCallback(async (request: ArticleSearchRequest) => {
    if (!request.query.trim() && !request.tag?.trim()) return;
    const requestId = ++searchRequestIdRef.current;
    const normalized = { ...request, query: request.query.trim(), tag: request.tag?.trim() || null };
    setSearch((current) => ({ ...current, status: "loading", request: normalized, errorMessage: null, failedProviders: [] }));
    const providers = normalized.provider === "all" ? (["qiita", "zenn"] as const) : [normalized.provider];
    const results = await Promise.allSettled(providers.map((provider) => provider === "qiita" ? searchQiitaArticles(normalized) : searchZennArticles(normalized)));
    if (requestId !== searchRequestIdRef.current) return;
    const articles = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const failedProviders = results.flatMap((result, index) => result.status === "rejected" ? [providers[index]] : []);
    if (failedProviders.length === providers.length) {
      const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      setSearch((current) => ({ ...current, status: "error", errorMessage: toErrorMessage(firstFailure?.reason, "記事を検索できませんでした。"), failedProviders }));
      return;
    }
    const deduplicated = mergeArticles([], articles);
    libraryRef.current = mergeArticles(libraryRef.current, deduplicated);
    setSearch({ status: deduplicated.length ? "success" : "empty", request: normalized, resultRequest: normalized, articles: deduplicated, errorMessage: null, failedProviders, hasNextPage: results.some((result) => result.status === "fulfilled" && result.value.length >= normalized.perPage) });
  }, []);

  const retrySearch = useCallback(async () => { if (search.request) await runSearch(search.request); }, [runSearch, search.request]);
  const clearSearch = useCallback(() => { searchRequestIdRef.current += 1; setSearch(initialSearchState); }, []);

  const addArticleFromUrl = useCallback(async (url: string) => {
    const article = await fetchArticleFromUrl(url);
    const existingArticle = findMatchingArticle(libraryRef.current, article);
    if (existingArticle) return { article: existingArticle, wasAlreadyInLibrary: true };
    manuallyAddedArticlesRef.current = mergeArticles(manuallyAddedArticlesRef.current, [article]);
    libraryRef.current = mergeArticles(libraryRef.current, [article]);
    setState((current) => ({ status: "success", articles: mergeArticles(current.articles, [article]), errorMessage: null }));
    return { article, wasAlreadyInLibrary: false };
  }, []);

  const getArticleById = useCallback((articleId: string | null) => articleId ? libraryRef.current.find((article) => article.id === articleId) : undefined, []);
  const value = useMemo(() => ({ ...state, search, retry, runSearch, retrySearch, clearSearch, addArticleFromUrl, getArticleById }), [state, search, retry, runSearch, retrySearch, clearSearch, addArticleFromUrl, getArticleById]);
  return <ArticleLibraryContext.Provider value={value}>{children}</ArticleLibraryContext.Provider>;
}

export function useArticleLibrary() {
  const context = useContext(ArticleLibraryContext);
  if (!context) throw new Error("useArticleLibrary must be used within an ArticleLibraryProvider");
  return context;
}

async function fetchArticleLibraryArticles() {
  const results = await Promise.allSettled([fetchZennDailyPopularArticles(), fetchQiitaArticles()]);
  const articles = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (articles.length || results.some((result) => result.status === "fulfilled")) return articles;
  throw new Error("Article sources could not be loaded");
}

function mergeArticles(primary: Article[], secondary: Article[]) {
  const merged = [...primary];
  secondary.forEach((article) => { if (!findMatchingArticle(merged, article)) merged.push(article); });
  return merged;
}
function findMatchingArticle(articles: Article[], article: Article) {
  const normalizedUrl = normalizeArticleUrl(article.url);
  return articles.find((existing) => existing.id === article.id || (existing.sourceType === article.sourceType && existing.sourceArticleId === article.sourceArticleId) || normalizeArticleUrl(existing.url) === normalizedUrl);
}
function normalizeArticleUrl(url: string) {
  try { const parsed = new URL(url); parsed.hash = ""; parsed.search = ""; return parsed.toString().replace(/\/$/, ""); } catch { return url.trim().replace(/\/$/, ""); }
}
function toErrorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
