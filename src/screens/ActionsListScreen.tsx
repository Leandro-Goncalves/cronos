import { AppWindow, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Toast } from "../components/Toast";
import { Button } from "../components/ui/button";
import { useAppIcons } from "../hooks/useAppIcons";

export interface ActionSummary {
  id: string;
  name: string;
  targetApp: { name: string; iconPath: string };
  steps: unknown[];
  createdAt: string;
}

export interface FullActionRecord {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface DeleteRequest {
  id: string;
  name: string;
}

interface ActionsListScreenProps {
  initialToast?: string | null;
  onCreate: () => void;
  onEdit: (id: string, action: FullActionRecord) => void;
  onExecute: (id: string) => void;
}

function stepCountLabel(count: number): string {
  return count === 1 ? "1 passo" : `${count} passos`;
}

export function ActionsListScreen({
  initialToast,
  onCreate,
  onEdit,
  onExecute,
}: ActionsListScreenProps) {
  const [actions, setActions] = useState<ActionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(
    initialToast ?? null
  );
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(
    null
  );

  useEffect(() => {
    if (initialToast) {
      setToastMessage(initialToast);
    }
  }, [initialToast]);

  useEffect(() => {
    window.ipcRenderer
      .invoke("actions:list")
      .then((result: ActionSummary[]) => {
        setActions(result);
        setLoading(false);
      });
  }, []);

  const sortedActions = useMemo(
    () =>
      [...actions].sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
      ),
    [actions]
  );

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedActions;
    return sortedActions.filter((action) =>
      action.name.toLowerCase().includes(q)
    );
  }, [sortedActions, query]);

  const iconTargets = useMemo(
    () =>
      actions.map((action) => ({
        key: action.id,
        iconPath: action.targetApp.iconPath,
      })),
    [actions]
  );
  const { getIcon } = useAppIcons(iconTargets);

  async function handleEditClick(action: ActionSummary) {
    const fullAction: FullActionRecord = await window.ipcRenderer.invoke(
      "actions:get",
      action.id
    );
    onEdit(action.id, fullAction);
  }

  function handleDeleteClick(action: ActionSummary) {
    setDeleteRequest({ id: action.id, name: action.name });
  }

  return (
    <div className="relative mx-auto flex h-screen max-w-xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold">Ações</h1>
        <Button size="sm" onClick={onCreate}>
          Adicionar ação
        </Button>
      </div>

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar ação..."
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      <div className="flex-1 overflow-y-auto rounded-lg border border-border">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">
            Carregando ações...
          </p>
        ) : actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma ação criada ainda.
            </p>
            <Button onClick={onCreate}>Adicionar ação</Button>
          </div>
        ) : filteredActions.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhuma ação encontrada.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filteredActions.map((action) => {
              const icon = getIcon(action.targetApp.iconPath);
              return (
                <li key={action.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onExecute(action.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        onExecute(action.id);
                      }
                    }}
                    className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 hover:bg-muted"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {icon ? (
                        <img src={icon} alt="" className="size-5 shrink-0" />
                      ) : (
                        <AppWindow className="size-5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {action.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {action.targetApp.name} ·{" "}
                          {stepCountLabel(action.steps.length)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Editar ${action.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEditClick(action);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Excluir ${action.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteClick(action);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {deleteRequest && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-6">
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-background p-4 shadow-lg">
            <p className="text-sm">
              Excluir a ação "{deleteRequest.name}"? Essa ação não pode ser
              desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteRequest(null)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteRequest(null)}
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} />
    </div>
  );
}
