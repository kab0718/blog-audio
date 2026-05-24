import { useArticleLibrary } from "../../app/articles/ArticleLibraryContext";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { buildQueueItems } from "../../data/mockLibrary";
import { toQueueListItemViewModel } from "../../view-models/library";
import styles from "./QueueScreen.module.css";

export function QueueScreen() {
  const { getArticleById, status } = useArticleLibrary();
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

      {queueItems.length === 0 ? (
        <div className={styles.emptyState}>{getEmptyQueueCopy(status)}</div>
      ) : null}

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
                      queueItem.queueState === "current"
                        ? styles.badgeActive
                        : styles.badge
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

function getEmptyQueueCopy(status: string) {
  switch (status) {
    case "loading":
      return "記事一覧を読み込んでいます。取得後にキューへ同期されます。";
    case "error":
      return "記事一覧を取得できないため、キューを作成できません。";
    case "empty":
      return "取得した記事一覧が空でした。";
    default:
      return "記事一覧から再生する記事を選択してください。";
  }
}
