import { useEffect, useState } from "react";
import { StepFieldsDialog, type StepDialogRequest } from "../components/StepFieldsDialog";
import { StepsList } from "../components/StepsList";
import { StepTypeMenu } from "../components/StepTypeMenu";
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
import { Label } from "../components/ui/label";
import {
  DEFAULT_DELAY_SECONDS,
  DELAY_MIN,
  DELAY_MAX,
  MAX_STEPS,
  type StepDraft,
  type StepType,
} from "../lib/steps";
import type { DraftActionBasicInfo } from "./BasicInfoScreen";

const SAVE_FAILURE_MESSAGE = "Não foi possível salvar a ação. Tente novamente.";

interface FetchedAction {
  steps?: StepDraft[];
  defaultDelaySeconds?: number;
}

interface SaveResult {
  success: boolean;
  action?: unknown;
  error?: string;
}

export interface StepsBuilderScreenProps {
  mode: "create" | "edit";
  actionId?: string;
  draft: DraftActionBasicInfo;
  onSave: (toastMessage: string) => void;
  onCancel: () => void;
}

function snapshotOf(steps: StepDraft[], defaultDelaySeconds: number): string {
  return JSON.stringify({ steps, defaultDelaySeconds });
}

export function StepsBuilderScreen({
  mode,
  actionId,
  draft,
  onSave,
  onCancel,
}: StepsBuilderScreenProps) {
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [defaultDelaySeconds, setDefaultDelaySeconds] = useState(
    String(DEFAULT_DELAY_SECONDS)
  );
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(
    mode === "create" ? snapshotOf([], DEFAULT_DELAY_SECONDS) : null
  );

  const [dialogRequest, setDialogRequest] = useState<StepDialogRequest | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !actionId) return;
    window.ipcRenderer.invoke("actions:get", actionId).then((result: FetchedAction | null) => {
      const loadedSteps = result?.steps ?? [];
      const loadedDelay = result?.defaultDelaySeconds ?? DEFAULT_DELAY_SECONDS;
      setSteps(loadedSteps);
      setDefaultDelaySeconds(String(loadedDelay));
      setInitialSnapshot(snapshotOf(loadedSteps, loadedDelay));
    });
  }, [mode, actionId]);

  const delayNumber = Number(defaultDelaySeconds);
  const isDelayValid =
    defaultDelaySeconds.trim() !== "" &&
    !Number.isNaN(delayNumber) &&
    delayNumber >= DELAY_MIN &&
    delayNumber <= DELAY_MAX;

  const isBasicInfoComplete = Boolean(
    draft.name && draft.targetApp && draft.monitorId !== null && draft.monitorId !== undefined
  );

  const canSave = steps.length > 0 && isDelayValid && isBasicInfoComplete;

  const isDirty =
    initialSnapshot !== null &&
    snapshotOf(steps, isDelayValid ? delayNumber : DELAY_MIN) !==
      initialSnapshot;

  function openAddDialog(type: StepType) {
    if (steps.length >= MAX_STEPS) return;
    setDialogRequest({ mode: "add", type });
    setDialogKey((k) => k + 1);
  }

  function openEditDialog(step: StepDraft) {
    setDialogRequest({ mode: "edit", step });
    setDialogKey((k) => k + 1);
  }

  function closeDialog() {
    setDialogRequest(null);
  }

  function handleDialogConfirm(step: StepDraft) {
    setSteps((prev) => {
      const index = prev.findIndex((existing) => existing.id === step.id);
      if (index === -1) return [...prev, step];
      const next = [...prev];
      next[index] = step;
      return next;
    });
    closeDialog();
  }

  function handleRemoveStep(stepId: string) {
    setSteps((prev) => prev.filter((step) => step.id !== stepId));
  }

  async function handleSave() {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    const payload = {
      ...(mode === "edit" && actionId ? { id: actionId } : {}),
      name: draft.name,
      monitorId: draft.monitorId,
      monitorBounds: draft.monitorBounds,
      targetApp: draft.targetApp,
      defaultDelaySeconds: delayNumber,
      steps,
    };

    let result: SaveResult | undefined;
    try {
      result = await window.ipcRenderer.invoke("actions:save", payload);
    } catch {
      result = { success: false };
    }
    setIsSaving(false);

    if (result?.success) {
      const successMessage =
        mode === "edit"
          ? `Ação '${draft.name}' editada com sucesso.`
          : `Ação '${draft.name}' criada com sucesso.`;
      onSave(successMessage);
    } else {
      setToastMessage(SAVE_FAILURE_MESSAGE);
    }
  }

  function handleCancelClick() {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onCancel();
    }
  }

  return (
    <div className="relative mx-auto flex h-screen max-w-xl flex-col gap-4 p-6">
      <h1 className="font-heading text-xl font-semibold">
        {mode === "create" ? "Adicionar ação" : "Editar ação"} — Passos
      </h1>

      <div className="flex-1 overflow-y-auto rounded-lg border border-border">
        {steps.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum passo adicionado ainda.
          </p>
        ) : (
          <StepsList
            steps={steps}
            onReorder={setSteps}
            onEdit={openEditDialog}
            onRemove={handleRemoveStep}
          />
        )}
      </div>

      <StepTypeMenu onSelectType={openAddDialog} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="steps-builder-delay">
          Atraso padrão entre passos (segundos)
        </Label>
        <Input
          id="steps-builder-delay"
          type="number"
          min={DELAY_MIN}
          max={DELAY_MAX}
          step={0.5}
          value={defaultDelaySeconds}
          onChange={(event) => setDefaultDelaySeconds(event.target.value)}
        />
      </div>

      <div className="mt-auto flex justify-end gap-2">
        <Button variant="outline" onClick={handleCancelClick}>
          Cancelar
        </Button>
        <Button disabled={!canSave || isSaving} onClick={handleSave}>
          Salvar
        </Button>
      </div>

      <StepFieldsDialog
        key={dialogKey}
        request={dialogRequest}
        targetApp={draft.targetApp}
        monitorBounds={draft.monitorBounds}
        onConfirm={handleDialogConfirm}
        onClose={closeDialog}
        onCaptureError={setToastMessage}
      />

      <AlertDialog
        open={showDiscardConfirm}
        onOpenChange={(open) => {
          if (!open) setShowDiscardConfirm(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas nesta ação. Elas serão perdidas se
              você sair agora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscardConfirm(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onCancel}>
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toast message={toastMessage} />
    </div>
  );
}
