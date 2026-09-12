import { useEffect, useState } from "react";

export interface IconTarget {
  key: string;
  iconPath: string;
}

const iconCache = new Map<string, string | null>();
const ICON_FETCH_CONCURRENCY = 6;

/**
 * Loads each target's icon (deduped by iconPath) through a concurrency-limited
 * worker pool into a shared cache, and re-renders callers as results arrive.
 */
export function useAppIcons(targets: IconTarget[]) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const pending = targets
      .map((target) => target.iconPath)
      .filter((iconPath, index, all) => all.indexOf(iconPath) === index && !iconCache.has(iconPath));

    if (pending.length === 0) return;

    let cancelled = false;
    let nextIndex = 0;

    async function worker() {
      while (!cancelled) {
        const current = nextIndex++;
        if (current >= pending.length) return;
        const iconPath = pending[current];
        const dataUrl = await window.ipcRenderer.invoke("apps:icon", iconPath);
        if (cancelled) return;
        iconCache.set(iconPath, dataUrl);
        setTick((tick) => tick + 1);
      }
    }

    const workers = Array.from({ length: ICON_FETCH_CONCURRENCY }, () => worker());
    Promise.all(workers);

    return () => {
      cancelled = true;
    };
  }, [targets]);

  function getIcon(iconPath: string): string | null | undefined {
    return iconCache.get(iconPath);
  }

  return { getIcon };
}
