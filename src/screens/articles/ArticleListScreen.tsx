import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { type SearchProvider, useArticleLibrary } from "../../app/articles/ArticleLibraryContext";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { useAudioTracks } from "../../app/tracks/AudioTrackContext";
import { toArticleListItemViewModel } from "../../view-models/library";
import styles from "./ArticleListScreen.module.css";

const ARTICLES_PER_PAGE = 8;
const providerLabels: Record<SearchProvider, string> = { all: "すべて", qiita: "Qiita", zenn: "Zenn" };

export function ArticleListScreen() {
  const library = useArticleLibrary();
  const { state: { currentQueueItemId, queueItemIds }, addArticleToQueue, playArticleNow } = usePlayback();
  const { getTrackByArticleId } = useAudioTracks();
  const [articleUrl, setArticleUrl] = useState("");
  const [urlStatus, setUrlStatus] = useState<"idle" | "adding" | "success" | "error">("idle");
  const [urlMessage, setUrlMessage] = useState<string | null>(null);
  const [provider, setProvider] = useState<SearchProvider>("all");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [normalPage, setNormalPage] = useState(1);
  const isSearchActive = library.search.status !== "idle";
  const normalPageCount = Math.max(1, Math.ceil(library.articles.length / ARTICLES_PER_PAGE));
  const displayedArticles = isSearchActive ? library.search.articles : library.articles.slice((normalPage - 1) * ARTICLES_PER_PAGE, normalPage * ARTICLES_PER_PAGE);
  const availableTags = useMemo(() => Array.from(new Set(library.articles.flatMap((article) => article.tags))).sort((a, b) => a.localeCompare(b, "ja")), [library.articles]);
  const appliedProvider = library.search.request?.provider ?? "all";
  const resultProvider = library.search.resultRequest?.provider ?? appliedProvider;
  const resultPage = library.search.resultRequest?.page ?? normalPage;

  const submitSearch = (page = 1, nextTag = tag) => library.runSearch({ provider, query, tag: nextTag, page, perPage: ARTICLES_PER_PAGE });
  const submitAppliedPage = (page: number) => {
    if (library.search.resultRequest) void library.runSearch({ ...library.search.resultRequest, page });
  };
  const handleSearchSubmit = (event: FormEvent) => { event.preventDefault(); void submitSearch(1); };
  const clearSearch = () => { setProvider("all"); setQuery(""); setTag(null); library.clearSearch(); };
  const handleTagSearch = (nextTag: string) => { setTag(nextTag); void submitSearch(1, nextTag); };

  const handleUrlSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!articleUrl.trim() || urlStatus === "adding") return;
    setUrlStatus("adding"); setUrlMessage(null);
    try {
      const { article, wasAlreadyInLibrary } = await library.addArticleFromUrl(articleUrl.trim());
      const wasQueued = queueItemIds.includes(article.id);
      addArticleToQueue(article.id);
      setUrlStatus("success"); setArticleUrl("");
      setUrlMessage(wasQueued ? `追加済みです: ${article.title}` : `${wasAlreadyInLibrary ? "既存の記事を" : "記事を"}キューに追加しました: ${article.title}`);
    } catch (error) { setUrlStatus("error"); setUrlMessage(error instanceof Error ? error.message : "URLから記事を追加できませんでした。"); }
  };

  return <section className={styles.screen}>
    <div className={styles.intro}><p className={styles.kicker}>記事一覧</p><p className={styles.copy}>聴きたい記事を探して、すぐ再生するかキューに追加できます。</p></div>
    <div className={styles.metrics}><div><span className={styles.metricLabel}>ライブラリ</span><strong className={styles.metricValue}>{library.articles.length}</strong></div><div><span className={styles.metricLabel}>キュー</span><strong className={styles.metricValue}>{queueItemIds.length}</strong></div></div>

    <form className={styles.urlForm} onSubmit={handleUrlSubmit}>
      <label className={styles.urlLabel} htmlFor="article-url">ブログURLから追加</label>
      <div className={styles.urlInputRow}><input id="article-url" className={styles.urlInput} inputMode="url" autoComplete="url" placeholder="https://zenn.dev/.../articles/..." value={articleUrl} onChange={(event) => setArticleUrl(event.target.value)} /><button className={styles.urlSubmitButton} disabled={urlStatus === "adding" || !articleUrl.trim()}>{urlStatus === "adding" ? "追加中" : "追加"}</button></div>
      {urlMessage ? <p className={`${styles.urlMessage} ${urlStatus === "error" ? styles.urlMessageError : ""}`}>{urlMessage}</p> : null}
    </form>

    <form className={styles.searchPanel} aria-label="provider記事検索" onSubmit={handleSearchSubmit}>
      <fieldset className={styles.providerFieldset}><legend className={styles.searchLabel}>検索対象</legend><div className={styles.providerOptions}>{(["all", "qiita", "zenn"] as const).map((value) => <label key={value} className={provider === value ? `${styles.providerOption} ${styles.providerOptionSelected}` : styles.providerOption}><input type="radio" name="provider" value={value} checked={provider === value} onChange={() => setProvider(value)} />{providerLabels[value]}</label>)}</div></fieldset>
      <label className={styles.searchLabel} htmlFor="article-search">キーワード</label>
      <div className={styles.searchInputRow}><input id="article-search" className={styles.searchInput} type="search" placeholder="例: React、音声生成" value={query} onChange={(event) => setQuery(event.target.value)} /><button className={styles.searchSubmitButton} disabled={library.search.status === "loading" || (!query.trim() && !tag)}>{library.search.status === "loading" ? "検索中" : "検索"}</button></div>
      {availableTags.length ? <div className={styles.filterTags} aria-label="タグから検索">{availableTags.map((value) => <button key={value} type="button" className={tag === value ? `${styles.filterTag} ${styles.filterTagSelected}` : styles.filterTag} aria-pressed={tag === value} disabled={library.search.status === "loading"} onClick={() => handleTagSearch(value)}>{value}</button>)}</div> : null}
      <div className={styles.searchFooter}><p className={styles.searchSummary}>{isSearchActive ? `${providerLabels[appliedProvider]}の検索・ページ ${library.search.request?.page ?? 1}` : "通常の記事一覧"}{tag ? ` ・ タグ: ${tag}` : ""}</p><button type="button" className={styles.clearSearchButton} disabled={!isSearchActive && !query && !tag && provider === "all"} onClick={clearSearch}>クリア</button></div>
    </form>

    {library.status === "loading" && !isSearchActive ? <State title="記事一覧を取得中" copy="最新の記事情報を読み込んでいます。" /> : null}
    {library.status === "error" && !isSearchActive ? <State title="記事一覧を取得できませんでした" copy={library.errorMessage ?? "記事 source に一時的にアクセスできません。"} action="再試行" onAction={library.retry} /> : null}
    {library.status === "empty" && !isSearchActive ? <State title="表示できる記事がありません" copy="取得した記事一覧が空でした。時間を置いて再試行できます。" action="再試行" onAction={library.retry} /> : null}
    {library.search.status === "loading" ? <State title={`${providerLabels[appliedProvider]}を検索中`} copy="検索結果を取得しています。現在の結果は取得完了まで保持されます。" /> : null}
    {library.search.status === "error" ? <State title={`${providerLabels[appliedProvider]}を検索できませんでした`} copy={library.search.errorMessage ?? "時間を置いて再試行してください。"} action="再試行" onAction={() => void library.retrySearch()} /> : null}
    {library.search.status === "empty" ? <State title={`${providerLabels[appliedProvider]}に該当記事がありません`} copy="通信エラーではありません。キーワードやタグを変えて検索してください。" /> : null}
    {library.search.failedProviders.length ? <div className={styles.warning} role="status">{library.search.failedProviders.map((value) => providerLabels[value]).join(" / ")} の取得に失敗しました。取得できた記事はそのまま操作できます。</div> : null}

    {displayedArticles.length ? <>
      <div className={styles.paginationSummary}><span>{displayedArticles.length} 件</span><span>{isSearchActive ? `${providerLabels[resultProvider]}・ページ ${resultPage} の結果` : "通常一覧"}</span></div>
      <ul className={styles.list}>{displayedArticles.map((article, index) => {
        const viewModel = toArticleListItemViewModel(article, getTrackByArticleId(article.id), { index: (resultPage - 1) * ARTICLES_PER_PAGE + index, isCurrent: article.id === currentQueueItemId, isQueued: queueItemIds.includes(article.id) });
        return <li key={viewModel.id} className={viewModel.isCurrent ? `${styles.item} ${styles.itemCurrent}` : styles.item}><div className={styles.trackIndex}>{viewModel.indexLabel}</div><div className={styles.trackBody}><div className={styles.metaRow}><span>{viewModel.sourceLabel}</span><span>{viewModel.author}</span><span>{viewModel.durationLabel}</span><span className={`${styles.statusBadge} ${styles[`statusBadge${capitalize(viewModel.trackStatusTone)}`]}`}>{viewModel.trackStatusLabel}</span></div><h2 className={styles.title}>{viewModel.title}</h2>{viewModel.summary ? <p className={styles.summary}>{viewModel.summary}</p> : null}<div className={styles.footerRow}>{viewModel.tags.length ? <div className={styles.tags}>{viewModel.tags.map((value) => <button key={value} type="button" className={styles.tagButton} disabled={library.search.status === "loading"} onClick={() => handleTagSearch(value)}>{value}</button>)}</div> : null}<div className={styles.actions}><span className={styles.queueStatus}>{viewModel.queueStatusLabel}</span><button type="button" className={styles.secondaryAction} disabled={viewModel.isQueued} onClick={() => addArticleToQueue(viewModel.id)}>{viewModel.isQueued ? "追加済み" : "キューに追加"}</button><Link className={styles.actionLink} to="/player" onClick={() => playArticleNow(viewModel.id)}>{viewModel.isCurrent ? "再生画面へ" : "今すぐ再生"}</Link></div></div></div></li>;
      })}</ul>
      {isSearchActive && library.search.resultRequest ? <nav className={styles.pagination} aria-label="検索結果ページ"><button type="button" className={styles.pageButton} disabled={resultPage <= 1 || library.search.status === "loading"} onClick={() => submitAppliedPage(resultPage - 1)}>前へ</button><span className={styles.pageStatus}>{resultPage}</span><button type="button" className={styles.pageButton} disabled={!library.search.hasNextPage || library.search.status === "loading"} onClick={() => submitAppliedPage(resultPage + 1)}>次へ</button></nav> : normalPageCount > 1 && !isSearchActive ? <nav className={styles.pagination} aria-label="通常記事一覧ページ"><button type="button" className={styles.pageButton} disabled={normalPage <= 1} onClick={() => setNormalPage((page) => page - 1)}>前へ</button><span className={styles.pageStatus}>{normalPage} / {normalPageCount}</span><button type="button" className={styles.pageButton} disabled={normalPage >= normalPageCount} onClick={() => setNormalPage((page) => page + 1)}>次へ</button></nav> : null}
    </> : null}
  </section>;
}

function State({ title, copy, action, onAction }: { title: string; copy: string; action?: string; onAction?: () => void }) {
  return <div className={styles.stateCard}><p className={styles.stateTitle}>{title}</p><p className={styles.stateCopy}>{copy}</p>{action ? <button type="button" className={styles.retryButton} onClick={onAction}>{action}</button> : null}</div>;
}

function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
