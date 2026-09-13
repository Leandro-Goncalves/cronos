import { AppWindow, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Toast } from "../components/Toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
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

function actionCountLabel(count: number): string {
  return count === 1 ? "1 ação salva" : `${count} ações salvas`;
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
  const [isDeleting, setIsDeleting] = useState(false);

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

  async function handleDeleteConfirm() {
    if (!deleteRequest || isDeleting) return;
    const { id, name } = deleteRequest;
    setIsDeleting(true);
    let result: { success: boolean } | undefined;
    try {
      result = await window.ipcRenderer.invoke("actions:delete", id);
    } catch {
      result = { success: false };
    }
    if (result?.success) {
      setActions((prev) => prev.filter((action) => action.id !== id));
      setToastMessage(`Ação '${name}' excluída com sucesso.`);
    } else {
      setToastMessage("Não foi possível excluir a ação. Tente novamente.");
    }
    setIsDeleting(false);
    setDeleteRequest(null);
  }

  return (
    <div className="relative mx-auto flex h-screen max-w-xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-xl font-semibold">Ações</h1>
          {!loading && actions.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {actionCountLabel(actions.length)}
            </p>
          )}
        </div>
        <Button size="sm" onClick={onCreate}>
          Adicionar ação
        </Button>
      </div>

      <Input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar ação..."
      />

      <div className="flex-1 overflow-y-auto rounded-lg border border-border">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">
            Carregando ações...
          </p>
        ) : actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 p-8 text-center">
            <p className="text-sm font-medium">Nenhuma ação criada ainda.</p>
            <p className="mb-1.5 max-w-xs text-xs text-muted-foreground">
              Grave uma sequência de cliques e digitações uma vez, depois
              repita com um clique sempre que precisar.
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
                    data-testid="action-row"
                    onClick={() => onExecute(action.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        onExecute(action.id);
                      }
                    }}
                    className="group flex cursor-pointer items-center justify-between gap-2 px-3 py-2 hover:bg-muted"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {icon ? (
                        <img src={icon} alt="" className="size-5 shrink-0" />
                      ) : (
                        <AppWindow className="size-5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex min-w-0 flex-col">
                        <span
                          data-testid="action-row-name"
                          className="truncate text-sm font-medium"
                        >
                          {action.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {action.targetApp.name} ·{" "}
                          {stepCountLabel(action.steps.length)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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

      <AlertDialog
        open={deleteRequest !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteRequest(null);
        }}
      >
        <AlertDialogContent data-testid="delete-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ação</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir a ação "{deleteRequest?.name}"? Essa ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              onClick={() => setDeleteRequest(null)}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toast message={toastMessage} />
    </div>
  );
}
