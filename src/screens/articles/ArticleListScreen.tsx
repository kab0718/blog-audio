import { Link } from "react-router-dom";
import { useArticleLibrary } from "../../app/articles/ArticleLibraryContext";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { getAudioTrackByArticleId } from "../../data/mockLibrary";
import { toArticleListItemViewModel } from "../../view-models/library";
import styles from "./ArticleListScreen.module.css";

export function ArticleListScreen() {
  const { articles, errorMessage, retry, status } = useArticleLibrary();
  const {
    state: { currentQueueItemId, queueItemIds },
    dispatch,
  } = usePlayback();

  return (
    <section className={styles.screen}>
      <div className={styles.intro}>
        <p className={styles.kicker}>Browse</p>
        <p className={styles.copy}>
          技術記事をトラック単位で並べ、再生画面とキュー管理へ自然に繋げる。
        </p>
      </div>

      <div className={styles.metrics}>
        <div>
          <span className={styles.metricLabel}>Articles</span>
          <strong className={styles.metricValue}>{articles.length}</strong>
        </div>
        <div>
          <span className={styles.metricLabel}>Queued</span>
          <strong className={styles.metricValue}>{queueItemIds.length}</strong>
        </div>
      </div>

      {status === "loading" ? (
        <div className={styles.stateCard}>
          <p className={styles.stateTitle}>Zenn の最新記事を取得中</p>
          <p className={styles.stateCopy}>
            記事メタ情報を読み込み、共通 Article 形式へ正規化しています。
          </p>
        </div>
      ) : null}

      {status === "error" ? (
        <div className={styles.stateCard}>
          <p className={styles.stateTitle}>記事一覧を取得できませんでした</p>
          <p className={styles.stateCopy}>
            {errorMessage ?? "Zenn の記事一覧に一時的にアクセスできません。"}
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
            Zenn から取得した一覧が空でした。時間を置いて再試行できます。
          </p>
          <button type="button" className={styles.retryButton} onClick={retry}>
            再試行
          </button>
        </div>
      ) : null}

      {status === "success" ? (
        <ul className={styles.list}>
          {articles.map((article, index) => {
            const viewModel = toArticleListItemViewModel(
              article,
              getAudioTrackByArticleId(article.id),
              {
                index,
                isCurrent: article.id === currentQueueItemId,
              },
            );

            return (
              <li key={viewModel.id} className={styles.item}>
                <div className={styles.trackIndex}>{viewModel.indexLabel}</div>
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
                        {viewModel.tags.map((tag) => (
                          <span key={tag} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <Link
                      className={styles.actionLink}
                      to="/player"
                      onClick={() => {
                        dispatch({
                          type: "setCurrentQueueItem",
                          queueItemId: viewModel.id,
                        });
                      }}
                    >
                      {viewModel.isCurrent ? "再生画面へ" : "この順で聴く"}
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function capitalizeStatus(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
