import { Link } from "react-router-dom";
import { mockArticles } from "../../data/mockArticles";
import { usePlayback } from "../../app/playback/PlaybackContext";
import styles from "./ArticleListScreen.module.css";

export function ArticleListScreen() {
  const {
    state: { currentArticleId, queueArticleIds },
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
          <strong className={styles.metricValue}>{queueArticleIds.length}</strong>
        </div>
      </div>

      <ul className={styles.list}>
        {mockArticles.map((article, index) => {
          const isCurrent = article.id === currentArticleId;

          return (
            <li key={article.id} className={styles.item}>
              <div className={styles.trackIndex}>{String(index + 1).padStart(2, "0")}</div>
              <div className={styles.trackBody}>
                <div className={styles.metaRow}>
                  <span>{article.sourceType}</span>
                  <span>{article.author}</span>
                  <span>{article.durationMinutes} min</span>
                </div>
                <h2 className={styles.title}>{article.title}</h2>
                <p className={styles.summary}>{article.summary}</p>
                <div className={styles.footerRow}>
                  <div className={styles.tags}>
                    {article.tags.map((tag) => (
                      <span key={tag} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  {isCurrent ? (
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
