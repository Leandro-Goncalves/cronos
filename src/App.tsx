import { useEffect, useState } from "react";
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
import { RunningScreen } from "./screens/RunningScreen";
import { StepsBuilderScreen } from "./screens/StepsBuilderScreen";

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
      <StepsBuilderScreen
        mode={screen.mode}
        actionId={screen.actionId}
        draft={screen.draft}
        onSave={(toastMessage) => returnToList(toastMessage)}
        onCancel={() => returnToList()}
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
    return <RunningScreen request={screen.request} onComplete={returnToList} />;
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

export default App;
