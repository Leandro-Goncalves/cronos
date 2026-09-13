import { useEffect, useState } from "react";
import { Toast } from "./components/Toast";
import {
  captureScreenPosition,
  getCaptureErrorMessage,
} from "./lib/captureScreenPosition";
import {
  ActionsListScreen,
  type FullActionRecord,
} from "./screens/ActionsListScreen";
import {
  BasicInfoScreen,
  type DraftActionBasicInfo,
  type EditableActionBasicInfo,
} from "./screens/BasicInfoScreen";
import {
  ExecuteActionScreen,
  type ExecutionRequest,
} from "./screens/ExecuteActionScreen";

type Screen =
  | { kind: "actions-list" }
  | { kind: "wizard"; mode: "create" }
  | {
      kind: "wizard";
      mode: "edit";
      actionId: string;
      action: FullActionRecord;
    }
  | {
      kind: "steps-builder";
      mode: "create" | "edit";
      actionId?: string;
      draft: DraftActionBasicInfo;
    }
  | { kind: "execute"; actionId: string }
  | { kind: "running"; request: ExecutionRequest };

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

  function goToRunning(request: ExecutionRequest) {
    setScreen({ kind: "running", request });
  }

  if (screen.kind === "wizard") {
    return (
      <BasicInfoScreen
        mode={screen.mode}
        action={
          screen.mode === "edit"
            ? (screen.action as unknown as EditableActionBasicInfo)
            : undefined
        }
        onConfirm={(draft) =>
          setScreen({
            kind: "steps-builder",
            mode: screen.mode,
            actionId: screen.mode === "edit" ? screen.actionId : undefined,
            draft,
          })
        }
        onCancel={() => returnToList()}
      />
    );
  }

  if (screen.kind === "steps-builder") {
    return (
      <StepsBuilderPlaceholderScreen
        draft={screen.draft}
        onBack={returnToList}
      />
    );
  }

  if (screen.kind === "execute") {
    return (
      <ExecuteActionScreen
        actionId={screen.actionId}
        onConfirm={goToRunning}
        onCancel={returnToList}
      />
    );
  }

  if (screen.kind === "running") {
    return (
      <PlaceholderScreen
        title="Executando ação (em construção)"
        onBack={returnToList}
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
  onBack: (toastMessage?: string) => void;
}) {
  return (
    <div className="mx-auto flex h-screen max-w-xl flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <button className="text-sm underline" onClick={() => onBack()}>
        Voltar
      </button>
      <button
        className="text-sm underline"
        onClick={() => onBack("Ação executada com sucesso.")}
      >
        Simular sucesso (temporário)
      </button>
    </div>
  );
}

type CaptureOutcome =
  | { kind: "captured"; x: number; y: number }
  | { kind: "cancelled" };

function StepsBuilderPlaceholderScreen({
  draft,
  onBack,
}: {
  draft: DraftActionBasicInfo;
  onBack: (toastMessage?: string) => void;
}) {
  const [outcome, setOutcome] = useState<CaptureOutcome | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  async function handleSimulateCapture() {
    setOutcome(null);
    setErrorToast(null);
    const result = await captureScreenPosition({
      targetApp: draft.targetApp,
      monitorBounds: draft.monitorBounds,
    });
    if (result.status === "captured" && result.position) {
      setOutcome({ kind: "captured", x: result.position.x, y: result.position.y });
    } else if (result.status === "cancelled") {
      setOutcome({ kind: "cancelled" });
    } else {
      setErrorToast(getCaptureErrorMessage(draft.targetApp.name));
    }
  }

  return (
    <div className="relative mx-auto flex h-screen max-w-xl flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm text-muted-foreground">
        Passos da ação (em construção)
      </p>
      <button className="text-sm underline" onClick={() => onBack()}>
        Voltar
      </button>
      <button
        className="text-sm underline"
        onClick={handleSimulateCapture}
      >
        Simular captura de posição (temporário)
      </button>
      {outcome?.kind === "captured" && (
        <p className="text-xs text-muted-foreground">
          Posição capturada: ({outcome.x}, {outcome.y})
        </p>
      )}
      {outcome?.kind === "cancelled" && (
        <p className="text-xs text-muted-foreground">Captura cancelada.</p>
      )}
      <Toast message={errorToast} />
    </div>
  );
}

export default App;
