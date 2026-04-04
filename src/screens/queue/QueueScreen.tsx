import {
  buildQueueItems,
  getArticleById,
} from "../../data/mockLibrary";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { toQueueListItemViewModel } from "../../view-models/library";
import styles from "./QueueScreen.module.css";

export function QueueScreen() {
  const {
    state: { currentQueueItemId, queueItemIds },
  } = usePlayback();

  const queueItems = buildQueueItems(queueItemIds, currentQueueItemId);

  return (
    <section className={styles.screen}>
      <div className={styles.intro}>
        <p className={styles.kicker}>Queue</p>
        <p className={styles.copy}>
          連続再生を支える並びだけ先に見せ、操作ロジックは後続タスクへ分離する。
        </p>
      </div>

      <ol className={styles.queueList}>
        {queueItems.map((queueItem) => {
          const article = getArticleById(queueItem.articleId);

          if (!article) {
            return null;
          }

          const viewModel = toQueueListItemViewModel(article, queueItem);

          return (
            <li key={viewModel.id} className={styles.queueItem}>
              <div className={styles.position}>{viewModel.positionLabel}</div>
              <div className={styles.body}>
                <div className={styles.headlineRow}>
                  <h2 className={styles.title}>{viewModel.title}</h2>
                  <span
                    className={
                      queueItem.queueState === "current" ? styles.badgeActive : styles.badge
                    }
                  >
                    {viewModel.badgeLabel}
                  </span>
                </div>
                <p className={styles.meta}>{viewModel.metaLine}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
