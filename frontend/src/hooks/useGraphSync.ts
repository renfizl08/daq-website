import { useEffect, useRef, useState } from "react";
import { getSharedGraphs, saveSharedGraphs } from "../api/datasets";

export type GraphSyncStatus = "local" | "saving" | "shared" | "error";

const localKey = (slug: string) => `daq-graphs-${slug}`;
const syncedKey = (slug: string) => `daq-graphs-synced-${slug}`;

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable; syncing then just treats this as unsynced.
  }
}

/**
 * Keeps a dataset's saved graphs in sync with the server (last write wins).
 * Opening a dataset adopts the server copy unless this browser has local edits
 * that were never pushed; pushing needs the upload password.
 */
export function useGraphSync(
  slug: string,
  items: unknown[],
  password: string,
  onRemote: (graphs: Record<string, unknown>[]) => void,
) {
  const [status, setStatus] = useState<GraphSyncStatus>("local");
  const [loaded, setLoaded] = useState(false);
  const serialized = JSON.stringify(items);
  const adopted = useRef(false);
  // Captured before the page's own persistence effect overwrites localStorage.
  const initialLocal = useRef(localStorage.getItem(localKey(slug)));
  const mountSerialized = useRef(serialized);
  const latestSerialized = useRef(serialized);
  latestSerialized.current = serialized;
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    getSharedGraphs(slug)
      .then(({ graphs }) => {
        if (cancelled) return;
        if (graphs) {
          const remote = JSON.stringify(graphs);
          const local = initialLocal.current;
          const unsyncedLocalEdits =
            local !== null && local !== localStorage.getItem(syncedKey(slug));
          const editedWhileLoading =
            latestSerialized.current !== mountSerialized.current;
          if (!unsyncedLocalEdits && !editedWhileLoading) {
            if (local !== remote) {
              adopted.current = true;
              onRemoteRef.current(graphs);
            }
            remember(syncedKey(slug), remote);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (adopted.current) {
      // Graphs were just replaced from the server; they are in sync by definition.
      adopted.current = false;
      remember(syncedKey(slug), serialized);
    }
  }, [serialized, slug]);

  useEffect(() => {
    if (!loaded) return;
    if (serialized === localStorage.getItem(syncedKey(slug))) {
      setStatus("shared");
      return;
    }
    if (!password) {
      setStatus("local");
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setStatus("saving");
      saveSharedGraphs(slug, items, password)
        .then(() => {
          if (cancelled) return;
          remember(syncedKey(slug), serialized);
          setStatus("shared");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
    // items is covered by serialized
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, password, serialized, slug]);

  return status;
}
