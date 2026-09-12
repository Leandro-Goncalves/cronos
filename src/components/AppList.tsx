import { AppWindow, Maximize2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAppIcons } from "../hooks/useAppIcons";
import { Toast } from "./Toast";
import { Button } from "./ui/button";

interface AppInfo {
  name: string;
  path: string;
  iconPath: string;
}

interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DisplayInfo {
  id: number;
  label: string;
  bounds: DisplayBounds;
}

const SELECTED_DISPLAY_STORAGE_KEY = "cronos:selectedDisplayId";

export function AppList() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [focusingPath, setFocusingPath] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<number | null>(
    null
  );

  useEffect(() => {
    window.ipcRenderer.invoke("apps:list").then((result: AppInfo[]) => {
      setApps(result);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    window.ipcRenderer.invoke("displays:list").then((result: DisplayInfo[]) => {
      setDisplays(result);
      let storedId: number | null = null;
      try {
        const stored = localStorage.getItem(SELECTED_DISPLAY_STORAGE_KEY);
        storedId = stored ? Number(stored) : null;
      } catch {
        storedId = null;
      }
      const validStored = result.find((d) => d.id === storedId);
      setSelectedDisplayId((validStored ?? result[0])?.id ?? null);
    });
  }, []);

  function handleSelectDisplay(id: number) {
    setSelectedDisplayId(id);
    try {
      localStorage.setItem(SELECTED_DISPLAY_STORAGE_KEY, String(id));
    } catch {
      // ignore persistence failures (e.g. private mode)
    }
  }

  const selectedDisplayBounds = useMemo(
    () => displays.find((d) => d.id === selectedDisplayId)?.bounds,
    [displays, selectedDisplayId]
  );

  const iconTargets = useMemo(
    () => apps.map((appInfo) => ({ key: appInfo.path, iconPath: appInfo.iconPath })),
    [apps]
  );
  const { getIcon } = useAppIcons(iconTargets);

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((appInfo) => appInfo.name.toLowerCase().includes(q));
  }, [apps, query]);

  async function handleOpen(appInfo: AppInfo) {
    setOpeningPath(appInfo.path);
    try {
      await window.ipcRenderer.invoke(
        "apps:open",
        appInfo.path,
        appInfo.iconPath,
        selectedDisplayBounds
      );
    } finally {
      setOpeningPath(null);
    }
  }

  async function handleFocus(appInfo: AppInfo) {
    setFocusingPath(appInfo.path);
    try {
      const found = await window.ipcRenderer.invoke(
        "apps:focus",
        appInfo.iconPath,
        selectedDisplayBounds
      );
      if (!found) {
        setToast(`${appInfo.name} não está em execução.`);
      }
    } finally {
      setFocusingPath(null);
    }
  }

  return (
    <div className="relative mx-auto flex h-screen max-w-xl flex-col gap-4 p-6">
      <h1 className="font-heading text-xl font-semibold">Aplicativos</h1>

      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar aplicativo..."
          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        {displays.length > 1 && (
          <select
            value={selectedDisplayId ?? ""}
            onChange={(event) => handleSelectDisplay(Number(event.target.value))}
            className="h-9 shrink-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {displays.map((display) => (
              <option key={display.id} value={display.id}>
                {display.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-border">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">
            Carregando aplicativos...
          </p>
        ) : filteredApps.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum aplicativo encontrado.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filteredApps.map((appInfo) => {
              const icon = getIcon(appInfo.iconPath);
              return (
                <li
                  key={appInfo.path}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {icon ? (
                      <img src={icon} alt="" className="size-5 shrink-0" />
                    ) : (
                      <AppWindow className="size-5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-sm">{appInfo.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleFocus(appInfo)}
                      disabled={focusingPath === appInfo.path}
                      title="Maximizar se já estiver aberto"
                    >
                      <Maximize2 />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpen(appInfo)}
                      disabled={openingPath === appInfo.path}
                    >
                      Abrir
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {filteredApps.length} de {apps.length} aplicativos
      </p>

      <Toast message={toast} />
    </div>
  );
}
