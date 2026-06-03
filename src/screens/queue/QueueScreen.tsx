import { useArticleLibrary } from "../../app/articles/ArticleLibraryContext";
import { usePlayback } from "../../app/playback/PlaybackContext";
import { buildQueueItems } from "../../data/mockLibrary";
import { toQueueListItemViewModel } from "../../view-models/library";
import styles from "./QueueScreen.module.css";

export function QueueScreen() {
  const { getArticleById, status } = useArticleLibrary();
  const {
    state: { currentQueueItemId, queueItemIds },
    moveQueueItem,
    removeQueueItem,
  } = usePlayback();

  const queueItems = buildQueueItems(queueItemIds, currentQueueItemId);
  const currentQueueIndex = currentQueueItemId
    ? queueItemIds.indexOf(currentQueueItemId)
    : -1;
  const nextQueueItemId =
    currentQueueIndex >= 0
      ? queueItemIds[currentQueueIndex + 1] ?? null
      : queueItemIds[0] ?? null;

  return (
    <section className={styles.screen}>
      <div className={styles.intro}>
        <p className={styles.kicker}>Queue</p>
        <p className={styles.copy}>
          次に聴く記事を並べ替え、不要な待機記事を外せます。
        </p>
      </div>

      {queueItems.length === 0 ? (
        <div className={styles.emptyState}>{getEmptyQueueCopy(status)}</div>
      ) : nextQueueItemId ? (
        <div className={styles.nextUp}>
          <span className={styles.nextUpLabel}>Next up</span>
          <strong>
            {getArticleById(nextQueueItemId)?.title ?? "記事を確認中"}
          </strong>
        </div>
      ) : (
        <div className={styles.nextUp}>
          <span className={styles.nextUpLabel}>Next up</span>
          <strong>次の記事はありません</strong>
        </div>
      )}

      <ol className={styles.queueList}>
        {queueItems.map((queueItem, index) => {
          const article = getArticleById(queueItem.articleId);

          if (!article) {
            return null;
          }

          const viewModel = toQueueListItemViewModel(article, queueItem);
          const isCurrent = queueItem.id === currentQueueItemId;
          const isNext = queueItem.id === nextQueueItemId;
          const canMoveUp =
            !isCurrent &&
            index > 0 &&
            queueItemIds[index - 1] !== currentQueueItemId;
          const canMoveDown =
            !isCurrent &&
            index < queueItemIds.length - 1 &&
            queueItemIds[index + 1] !== currentQueueItemId;

          return (
            <li key={viewModel.id} className={styles.queueItem}>
              <div className={styles.position}>{viewModel.positionLabel}</div>
              <div className={styles.body}>
                <div className={styles.headlineRow}>
                  <h2 className={styles.title}>{viewModel.title}</h2>
                  <span
                    className={
                      isCurrent
                        ? styles.badgeActive
                        : isNext
                          ? styles.badgeNext
                        : styles.badge
                    }
                  >
                    {getQueueBadgeLabel(isCurrent, isNext)}
                  </span>
                </div>
                <p className={styles.meta}>{viewModel.metaLine}</p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.queueButton}
                    disabled={!canMoveUp}
                    onClick={() => moveQueueItem(queueItem.id, "up")}
                  >
                    上へ
                  </button>
                  <button
                    type="button"
                    className={styles.queueButton}
                    disabled={!canMoveDown}
                    onClick={() => moveQueueItem(queueItem.id, "down")}
                  >
                    下へ
                  </button>
                  <button
                    type="button"
                    className={styles.removeButton}
                    disabled={isCurrent}
                    onClick={() => removeQueueItem(queueItem.id)}
                  >
                    削除
                  </button>
                </div>
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
      return "記事一覧を読み込んでいます。取得後に記事をキューへ追加できます。";
    case "error":
      return "記事一覧を取得できないため、キューを作成できません。";
    case "empty":
      return "取得した記事一覧が空でした。";
    default:
      return "記事一覧から再生する記事を選択してください。";
  }
}

function getQueueBadgeLabel(isCurrent: boolean, isNext: boolean) {
  if (isCurrent) {
    return "Now";
  }

  return isNext ? "Next" : "Queued";
}
