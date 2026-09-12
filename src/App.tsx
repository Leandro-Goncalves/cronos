import { useEffect, useState } from "react";

interface ActionRecord {
  id: string;
  name: string;
  [key: string]: unknown;
}

type Screen =
  | { kind: "actions-list" }
  | { kind: "wizard"; mode: "create" }
  | { kind: "wizard"; mode: "edit"; actionId: string; action: ActionRecord }
  | { kind: "execute"; actionId: string };

function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "actions-list" });
  const [pendingToast, setPendingToast] = useState<string | null>(null);

  useEffect(() => {
    function handleDataWarning(_event: unknown, message: string) {
      setPendingToast(message);
    }
    window.ipcRenderer.on("actions:data-warning", handleDataWarning);
    return () => {
      window.ipcRenderer.off("actions:data-warning", handleDataWarning);
    };
  }, []);

  function returnToList(toastMessage?: string) {
    setPendingToast(toastMessage ?? null);
    setScreen({ kind: "actions-list" });
  }

  function goToCreateWizard() {
    setScreen({ kind: "wizard", mode: "create" });
  }

  function goToEditWizard(actionId: string, action: ActionRecord) {
    setScreen({ kind: "wizard", mode: "edit", actionId, action });
  }

  function goToExecute(actionId: string) {
    setScreen({ kind: "execute", actionId });
  }

  if (screen.kind === "wizard") {
    const title =
      screen.mode === "create"
        ? "Adicionar ação (em construção)"
        : `Editar "${screen.action.name}" (em construção)`;
    return <PlaceholderScreen title={title} onBack={() => returnToList()} />;
  }

  if (screen.kind === "execute") {
    return (
      <PlaceholderScreen
        title="Executar ação (em construção)"
        onBack={() => returnToList()}
      />
    );
  }

  return (
    <ActionsListPlaceholder
      initialToast={pendingToast}
      onCreate={goToCreateWizard}
      onEdit={goToEditWizard}
      onExecute={goToExecute}
    />
  );
}

function PlaceholderScreen({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="mx-auto flex h-screen max-w-xl flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <button className="text-sm underline" onClick={onBack}>
        Voltar
      </button>
    </div>
  );
}

interface ActionsListPlaceholderProps {
  initialToast: string | null;
  onCreate: () => void;
  onEdit: (id: string, action: ActionRecord) => void;
  onExecute: (id: string) => void;
}

function ActionsListPlaceholder({
  initialToast,
  onCreate,
  onEdit,
  onExecute,
}: ActionsListPlaceholderProps) {
  return (
    <div className="mx-auto flex h-screen max-w-xl flex-col items-center justify-center gap-3 p-6">
      <p className="text-sm text-muted-foreground">
        Lista de ações (em construção)
      </p>
      {initialToast && (
        <p className="text-xs text-muted-foreground">{initialToast}</p>
      )}
      <button className="text-sm underline" onClick={onCreate}>
        Adicionar ação
      </button>
      <button
        className="text-sm underline"
        onClick={() =>
          onEdit("stub-id", { id: "stub-id", name: "Ação de exemplo" })
        }
      >
        Editar (exemplo)
      </button>
      <button className="text-sm underline" onClick={() => onExecute("stub-id")}>
        Executar (exemplo)
      </button>
    </div>
  );
}

export default App;
