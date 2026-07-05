import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useArticleLibrary } from "../../app/articles/ArticleLibraryContext";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { useAudioTracks } from "../../app/tracks/AudioTrackContext";
import type { Article } from "../../types/article";
import {
  getSourceLabel,
  toArticleListItemViewModel,
} from "../../view-models/library";
import styles from "./ArticleListScreen.module.css";

const ARTICLES_PER_PAGE = 8;

export function ArticleListScreen() {
  const { addArticleFromUrl, articles, errorMessage, retry, status } =
    useArticleLibrary();
  const {
    state: { currentQueueItemId, queueItemIds },
    addArticleToQueue,
    playArticleNow,
  } = usePlayback();
  const { getTrackByArticleId } = useAudioTracks();
  const [currentPage, setCurrentPage] = useState(1);
  const [articleUrl, setArticleUrl] = useState("");
  const [urlAddStatus, setUrlAddStatus] = useState<
    "idle" | "adding" | "success" | "error"
  >("idle");
  const [urlAddMessage, setUrlAddMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const filteredArticles = useMemo(
    () => filterArticles(articles, searchQuery, selectedTag),
    [articles, searchQuery, selectedTag],
  );
  const availableTags = useMemo(() => getAvailableTags(articles), [articles]);
  const hasSearchConditions =
    searchQuery.trim().length > 0 || selectedTag !== null;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE),
  );
  const visibleArticles = useMemo(() => {
    const startIndex = (currentPage - 1) * ARTICLES_PER_PAGE;

    return filteredArticles.slice(startIndex, startIndex + ARTICLES_PER_PAGE);
  }, [currentPage, filteredArticles]);
  const pageStartIndex =
    filteredArticles.length > 0
      ? (currentPage - 1) * ARTICLES_PER_PAGE + 1
      : 0;
  const pageEndIndex = Math.min(
    currentPage * ARTICLES_PER_PAGE,
    filteredArticles.length,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedTag]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.min(Math.max(1, page), totalPages));
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const handleUrlSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedUrl = articleUrl.trim();

    if (!trimmedUrl || urlAddStatus === "adding") {
      return;
    }

    setUrlAddStatus("adding");
    setUrlAddMessage(null);

    try {
      const { article, wasAlreadyInLibrary } =
        await addArticleFromUrl(trimmedUrl);
      const wasAlreadyQueued = queueItemIds.includes(article.id);

      addArticleToQueue(article.id);
      setUrlAddStatus("success");
      setUrlAddMessage(
        wasAlreadyQueued
          ? `追加済みです: ${article.title}`
          : `${wasAlreadyInLibrary ? "既存の記事を" : "記事を"}キューに追加しました: ${article.title}`,
      );
      setArticleUrl("");

      if (!wasAlreadyInLibrary && !hasSearchConditions) {
        setCurrentPage(
          Math.max(1, Math.ceil((articles.length + 1) / ARTICLES_PER_PAGE)),
        );
      }
    } catch (error: unknown) {
      setUrlAddStatus("error");
      setUrlAddMessage(
        error instanceof Error
          ? error.message
          : "URLから記事を追加できませんでした。",
      );
    }
  };

  return (
    <section className={styles.screen}>
      <div className={styles.intro}>
        <p className={styles.kicker}>記事一覧</p>
        <p className={styles.copy}>
          聴きたい記事を選んで、すぐ再生するかキューに追加できます。
        </p>
      </div>

      <div className={styles.metrics}>
        <div>
          <span className={styles.metricLabel}>記事数</span>
          <strong className={styles.metricValue}>{articles.length}</strong>
        </div>
        <div>
          <span className={styles.metricLabel}>キュー</span>
          <strong className={styles.metricValue}>{queueItemIds.length}</strong>
        </div>
      </div>

      <form className={styles.urlForm} onSubmit={handleUrlSubmit}>
        <label className={styles.urlLabel} htmlFor="article-url">
          ブログURLから追加
        </label>
        <div className={styles.urlInputRow}>
          <input
            id="article-url"
            className={styles.urlInput}
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="https://zenn.dev/.../articles/..."
            value={articleUrl}
            onChange={(event) => {
              setArticleUrl(event.target.value);
              if (urlAddStatus !== "adding") {
                setUrlAddStatus("idle");
                setUrlAddMessage(null);
              }
            }}
          />
          <button
            type="submit"
            className={styles.urlSubmitButton}
            disabled={urlAddStatus === "adding" || articleUrl.trim().length === 0}
          >
            {urlAddStatus === "adding" ? "追加中" : "追加"}
          </button>
        </div>
        {urlAddMessage ? (
          <p
            className={
              urlAddStatus === "error"
                ? `${styles.urlMessage} ${styles.urlMessageError}`
                : styles.urlMessage
            }
          >
            {urlAddMessage}
          </p>
        ) : null}
      </form>

      {status === "success" ? (
        <section className={styles.searchPanel} aria-label="記事検索">
          <label className={styles.searchLabel} htmlFor="article-search">
            記事を検索
          </label>
          <div className={styles.searchInputRow}>
            <input
              id="article-search"
              className={styles.searchInput}
              type="search"
              placeholder="タイトル、著者、タグで検索"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <button
              type="button"
              className={styles.clearSearchButton}
              disabled={!hasSearchConditions}
              onClick={() => {
                setSearchQuery("");
                setSelectedTag(null);
              }}
            >
              クリア
            </button>
          </div>
          {availableTags.length > 0 ? (
            <div className={styles.filterTags} aria-label="タグで絞り込み">
              {availableTags.map((tag) => {
                const isSelected = selectedTag === tag;

                return (
                  <button
                    key={tag}
                    type="button"
                    className={
                      isSelected
                        ? `${styles.filterTag} ${styles.filterTagSelected}`
                        : styles.filterTag
                    }
                    aria-pressed={isSelected}
                    onClick={() => setSelectedTag(isSelected ? null : tag)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          ) : null}
          <p className={styles.searchSummary}>
            検索結果 {filteredArticles.length} / {articles.length} 件
            {selectedTag ? ` ・ タグ: ${selectedTag}` : ""}
          </p>
        </section>
      ) : null}

      {status === "loading" ? (
        <div className={styles.stateCard}>
          <p className={styles.stateTitle}>記事一覧を取得中</p>
          <p className={styles.stateCopy}>
            最新の記事情報を読み込んでいます。
          </p>
        </div>
      ) : null}

      {status === "error" ? (
        <div className={styles.stateCard}>
          <p className={styles.stateTitle}>記事一覧を取得できませんでした</p>
          <p className={styles.stateCopy}>
            {errorMessage ?? "記事 source に一時的にアクセスできません。"}
          </p>
          <button type="button" className={styles.retryButton} onClick={retry}>
            再試行
          </button>
        </div>
      ) : null}

      {status === "empty" ? (
        <div className={styles.stateCard}>
          <p className={styles.stateTitle}>表示できる記事がありません</p>
          <p className={styles.stateCopy}>
            取得した記事一覧が空でした。時間を置いて再試行できます。
          </p>
          <button type="button" className={styles.retryButton} onClick={retry}>
            再試行
          </button>
        </div>
      ) : null}

      {status === "success" ? (
        <>
          {filteredArticles.length === 0 ? (
            <div className={styles.stateCard}>
              <p className={styles.stateTitle}>条件に合う記事がありません</p>
              <p className={styles.stateCopy}>
                キーワードやタグ条件を変えると、取得済みの記事からもう一度探せます。
              </p>
            </div>
          ) : (
            <>
              <div className={styles.paginationSummary}>
                <span>
                  {pageStartIndex}-{pageEndIndex} / {filteredArticles.length} 件
                </span>
                <span>
                  ページ {currentPage} / {totalPages}
                </span>
              </div>

              <ul className={styles.list}>
                {visibleArticles.map((article, index) => {
                  const articleIndex =
                    (currentPage - 1) * ARTICLES_PER_PAGE + index;
                  const isQueued = queueItemIds.includes(article.id);
                  const viewModel = toArticleListItemViewModel(
                    article,
                    getTrackByArticleId(article.id),
                    {
                      index: articleIndex,
                      isCurrent: article.id === currentQueueItemId,
                      isQueued,
                    },
                  );

                  return (
                    <li
                      key={viewModel.id}
                      className={
                        viewModel.isCurrent
                          ? `${styles.item} ${styles.itemCurrent}`
                          : styles.item
                      }
                    >
                      <div className={styles.trackIndex}>
                        {viewModel.indexLabel}
                      </div>
                      <div className={styles.trackBody}>
                        <div className={styles.metaRow}>
                          <span>{viewModel.sourceLabel}</span>
                          <span>{viewModel.author}</span>
                          <span>{viewModel.durationLabel}</span>
                          <span
                            className={`${styles.statusBadge} ${styles[`statusBadge${capitalizeStatus(viewModel.trackStatusTone)}`]}`}
                          >
                            {viewModel.trackStatusLabel}
                          </span>
                        </div>
                        <h2 className={styles.title}>{viewModel.title}</h2>
                        {viewModel.summary ? (
                          <p className={styles.summary}>{viewModel.summary}</p>
                        ) : null}
                        <div className={styles.footerRow}>
                          {viewModel.tags.length > 0 ? (
                            <div className={styles.tags}>
                              {viewModel.tags.map((tag) => {
                                const isSelected = selectedTag === tag;

                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    className={
                                      isSelected
                                        ? `${styles.tagButton} ${styles.tagButtonSelected}`
                                        : styles.tagButton
                                    }
                                    aria-pressed={isSelected}
                                    onClick={() =>
                                      setSelectedTag(isSelected ? null : tag)
                                    }
                                  >
                                    {tag}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                          <div className={styles.actions}>
                            <span className={styles.queueStatus}>
                              {viewModel.queueStatusLabel}
                            </span>
                            <button
                              type="button"
                              className={styles.secondaryAction}
                              disabled={viewModel.isQueued}
                              onClick={() => addArticleToQueue(viewModel.id)}
                            >
                              {viewModel.isQueued ? "追加済み" : "キューに追加"}
                            </button>
                            <Link
                              className={styles.actionLink}
                              to="/player"
                              onClick={() => {
                                playArticleNow(viewModel.id);
                              }}
                            >
                              {viewModel.isCurrent ? "再生画面へ" : "今すぐ再生"}
                            </Link>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {totalPages > 1 ? (
                <nav className={styles.pagination} aria-label="記事一覧ページ">
                  <button
                    type="button"
                    className={styles.pageButton}
                    disabled={currentPage === 1}
                    onClick={() => goToPage(currentPage - 1)}
                  >
                    前へ
                  </button>
                  <span className={styles.pageStatus}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className={styles.pageButton}
                    disabled={currentPage === totalPages}
                    onClick={() => goToPage(currentPage + 1)}
                  >
                    次へ
                  </button>
                </nav>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

function filterArticles(
  articles: Article[],
  searchQuery: string,
  selectedTag: string | null,
) {
  const searchTerms = normalizeSearchText(searchQuery)
    .split(/\s+/)
    .filter(Boolean);

  return articles.filter((article) => {
    if (selectedTag && !article.tags.includes(selectedTag)) {
      return false;
    }

    if (searchTerms.length === 0) {
      return true;
    }

    const searchableText = normalizeSearchText(
      [
        article.title,
        article.author,
        article.summary ?? "",
        article.tags.join(" "),
        getSourceLabel(article.sourceType),
      ].join(" "),
    );

    return searchTerms.every((term) => searchableText.includes(term));
  });
}

function getAvailableTags(articles: Article[]) {
  const seenTags = new Set<string>();

  articles.forEach((article) => {
    article.tags.forEach((tag) => {
      if (tag.trim()) {
        seenTags.add(tag);
      }
    });
  });

  return Array.from(seenTags).sort((a, b) =>
    a.localeCompare(b, "ja", { sensitivity: "base" }),
  );
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function capitalizeStatus(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
