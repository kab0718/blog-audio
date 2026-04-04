import { mockArticles } from "../../data/mockArticles";
import { usePlayback } from "../../app/playback/PlaybackContext";
import styles from "./QueueScreen.module.css";

export function QueueScreen() {
  const {
    state: { currentArticleId, queueArticleIds },
  } = usePlayback();

  const queuedArticles = queueArticleIds
    .map((articleId) => mockArticles.find((article) => article.id === articleId))
    .filter((article) => article !== undefined);

  return (
    <section className={styles.screen}>
      <div className={styles.intro}>
        <p className={styles.kicker}>Queue</p>
        <p className={styles.copy}>
          連続再生を支える並びだけ先に見せ、操作ロジックは後続タスクへ分離する。
        </p>
      </div>

      <ol className={styles.queueList}>
        {queuedArticles.map((article, index) => {
          const isCurrent = article.id === currentArticleId;

          return (
            <li key={article.id} className={styles.queueItem}>
              <div className={styles.position}>{String(index + 1).padStart(2, "0")}</div>
              <div className={styles.body}>
                <div className={styles.headlineRow}>
                  <h2 className={styles.title}>{article.title}</h2>
                  <span className={isCurrent ? styles.badgeActive : styles.badge}>
                    {isCurrent ? "Now" : "Queued"}
                  </span>
                </div>
                <p className={styles.meta}>
                  {article.sourceType} ・ {article.author} ・ {article.durationMinutes} min
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
