import { useEffect, useState } from "react";
import {
  ActionsListScreen,
  type FullActionRecord,
} from "./screens/ActionsListScreen";

type Screen =
  | { kind: "actions-list" }
  | { kind: "wizard"; mode: "create" }
  | {
      kind: "wizard";
      mode: "edit";
      actionId: string;
      action: FullActionRecord;
    }
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

  function goToEditWizard(actionId: string, action: FullActionRecord) {
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
    <ActionsListScreen
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

export default App;
