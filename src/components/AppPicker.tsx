import { AppWindow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "cn";
import { useAppIcons } from "../hooks/useAppIcons";
import { Input } from "./ui/input";

export interface AppInfo {
  name: string;
  path: string;
  iconPath: string;
}

interface AppPickerProps {
  value: AppInfo | null;
  onChange: (appInfo: AppInfo) => void;
}

export function AppPicker({ value, onChange }: AppPickerProps) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.ipcRenderer.invoke("apps:list").then((result: AppInfo[]) => {
      setApps(result);
      setLoading(false);
    });
  }, []);

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

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar aplicativo..."
      />

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
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
              const selected = value?.path === appInfo.path;
              return (
                <li key={appInfo.path}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    data-testid="app-picker-row"
                    onClick={() => onChange(appInfo)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onChange(appInfo);
                      }
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-muted",
                      selected && "bg-accent"
                    )}
                  >
                    {icon ? (
                      <img src={icon} alt="" className="size-5 shrink-0" />
                    ) : (
                      <AppWindow className="size-5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-sm">{appInfo.name}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
