import { Link } from "react-router-dom";
import { getAudioTrackByArticleId, mockArticles } from "../../data/mockLibrary";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { toArticleListItemViewModel } from "../../view-models/library";
import styles from "./ArticleListScreen.module.css";

export function ArticleListScreen() {
  const {
    state: { currentQueueItemId, queueItemIds },
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
          <strong className={styles.metricValue}>{mockArticles.length}</strong>
        </div>
        <div>
          <span className={styles.metricLabel}>Queued</span>
          <strong className={styles.metricValue}>{queueItemIds.length}</strong>
        </div>
      </div>

      <ul className={styles.list}>
        {mockArticles.map((article, index) => {
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
                <p className={styles.summary}>{viewModel.summary}</p>
                <div className={styles.footerRow}>
                  <div className={styles.tags}>
                    {viewModel.tags.map((tag) => (
                      <span key={tag} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  {viewModel.isCurrent ? (
                    <Link className={styles.actionLink} to="/player">
                      再生画面へ
                    </Link>
                  ) : (
                    <Link className={styles.actionLink} to="/queue">
                      キューを見る
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function capitalizeStatus(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
