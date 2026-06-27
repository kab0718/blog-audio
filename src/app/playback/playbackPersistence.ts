import type { PlaybackState } from "../../types/playback";

const PLAYBACK_STATE_STORAGE_KEY = "blog-audio:playback-state:v1";
const PLAYBACK_STATE_SCHEMA_VERSION = 1;

export type PersistedPlaybackState = {
  schemaVersion: typeof PLAYBACK_STATE_SCHEMA_VERSION;
  queueItemIds: string[];
  currentQueueItemId: string | null;
  positionSeconds: number;
  savedAt: number;
};

export function readPersistedPlaybackState(): PersistedPlaybackState | null {
  try {
    const serializedPayload = getPlaybackStorage()?.getItem(
      PLAYBACK_STATE_STORAGE_KEY,
    );

    if (!serializedPayload) {
      return null;
    }

    return toPersistedPlaybackState(JSON.parse(serializedPayload));
  } catch {
    return null;
  }
}

export function writePersistedPlaybackState(state: PlaybackState) {
  try {
    getPlaybackStorage()?.setItem(
      PLAYBACK_STATE_STORAGE_KEY,
      JSON.stringify(toStoragePayload(state)),
    );
  } catch {
    // Persistence must never block playback controls.
  }
}

function toStoragePayload(state: PlaybackState): PersistedPlaybackState {
  return {
    schemaVersion: PLAYBACK_STATE_SCHEMA_VERSION,
    queueItemIds: normalizeQueueItemIds(state.queueItemIds),
    currentQueueItemId: normalizeCurrentQueueItemId(
      state.currentQueueItemId,
      state.queueItemIds,
    ),
    positionSeconds: normalizePositionSeconds(state.positionSeconds),
    savedAt: Date.now(),
  };
}

function toPersistedPlaybackState(
  payload: unknown,
): PersistedPlaybackState | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (payload.schemaVersion !== PLAYBACK_STATE_SCHEMA_VERSION) {
    return null;
  }

  if (!Array.isArray(payload.queueItemIds)) {
    return null;
  }

  const queueItemIds = normalizeQueueItemIds(payload.queueItemIds);
  const currentQueueItemId =
    typeof payload.currentQueueItemId === "string"
      ? payload.currentQueueItemId
      : null;

  return {
    schemaVersion: PLAYBACK_STATE_SCHEMA_VERSION,
    queueItemIds,
    currentQueueItemId: normalizeCurrentQueueItemId(
      currentQueueItemId,
      queueItemIds,
    ),
    positionSeconds: normalizePositionSeconds(payload.positionSeconds),
    savedAt: normalizeSavedAt(payload.savedAt),
  };
}

function normalizeQueueItemIds(queueItemIds: unknown[]) {
  const seenIds = new Set<string>();
  const normalizedIds: string[] = [];

  queueItemIds.forEach((queueItemId) => {
    if (typeof queueItemId !== "string") {
      return;
    }

    const trimmedId = queueItemId.trim();

    if (!trimmedId || seenIds.has(trimmedId)) {
      return;
    }

    seenIds.add(trimmedId);
    normalizedIds.push(trimmedId);
  });

  return normalizedIds;
}

function normalizeCurrentQueueItemId(
  currentQueueItemId: string | null,
  queueItemIds: string[],
) {
  return currentQueueItemId && queueItemIds.includes(currentQueueItemId)
    ? currentQueueItemId
    : queueItemIds[0] ?? null;
}

function normalizePositionSeconds(positionSeconds: unknown) {
  return typeof positionSeconds === "number" &&
    Number.isFinite(positionSeconds)
    ? Math.max(0, positionSeconds)
    : 0;
}

function normalizeSavedAt(savedAt: unknown) {
  return typeof savedAt === "number" && Number.isFinite(savedAt) ? savedAt : 0;
}

function getPlaybackStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
