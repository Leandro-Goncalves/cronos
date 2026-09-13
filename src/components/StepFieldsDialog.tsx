import { useEffect, useRef, useState } from "react";
import {
  captureScreenPosition,
  getCaptureErrorMessage,
  type CaptureMonitorBounds,
  type CaptureTargetApp,
} from "../lib/captureScreenPosition";
import {
  AUTO_TYPE_TEXT_MAX,
  MANUAL_LABEL_MAX,
  MANUAL_PLACEHOLDER_MAX,
  PRESS_KEY_MODIFIER_OPTIONS,
  PRESS_KEY_OPTIONS,
  WAIT_SECONDS_MAX,
  WAIT_SECONDS_MIN,
  type StepDraft,
  type StepType,
} from "../lib/steps";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export type StepDialogRequest =
  | { mode: "add"; type: StepType }
  | { mode: "edit"; step: StepDraft };

const STEP_TYPE_TITLES: Record<StepType, string> = {
  click: "Click",
  "auto-type": "Digitar",
  "press-key": "Pressionar",
  wait: "Esperar",
  "manual-type": "Manual: Digitar",
};

export interface StepFieldsDialogProps {
  request: StepDialogRequest | null;
  targetApp: CaptureTargetApp;
  monitorBounds: CaptureMonitorBounds;
  onConfirm: (step: StepDraft) => void;
  onClose: () => void;
  onCaptureError: (message: string) => void;
}

export function StepFieldsDialog({
  request,
  targetApp,
  monitorBounds,
  onConfirm,
  onClose,
  onCaptureError,
}: StepFieldsDialogProps) {
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {request && (
          <StepFieldsForm
            request={request}
            targetApp={targetApp}
            monitorBounds={monitorBounds}
            onConfirm={onConfirm}
            onClose={onClose}
            onCaptureError={onCaptureError}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Phase = "form" | "capturing";

function StepFieldsForm({
  request,
  targetApp,
  monitorBounds,
  onConfirm,
  onClose,
  onCaptureError,
}: {
  request: StepDialogRequest;
  targetApp: CaptureTargetApp;
  monitorBounds: CaptureMonitorBounds;
  onConfirm: (step: StepDraft) => void;
  onClose: () => void;
  onCaptureError: (message: string) => void;
}) {
  const type: StepType =
    request.mode === "add" ? request.type : request.step.type;
  const existingStep = request.mode === "edit" ? request.step : null;
  const isAddClick = request.mode === "add" && type === "click";

  const [phase, setPhase] = useState<Phase>(isAddClick ? "capturing" : "form");
  const [cancelledNotice, setCancelledNotice] = useState(false);

  const [text, setText] = useState(
    existingStep?.type === "auto-type" ? existingStep.text : ""
  );
  const [key, setKey] = useState(
    existingStep?.type === "press-key" ? existingStep.key : PRESS_KEY_OPTIONS[0].value
  );
  const [modifiers, setModifiers] = useState<string[]>(
    existingStep?.type === "press-key" ? existingStep.modifiers : []
  );
  const [seconds, setSeconds] = useState(
    existingStep?.type === "wait" ? String(existingStep.seconds) : ""
  );
  const [label, setLabel] = useState(
    existingStep?.type === "manual-type" ? existingStep.label : ""
  );
  const [placeholder, setPlaceholder] = useState(
    existingStep?.type === "manual-type" ? existingStep.placeholder ?? "" : ""
  );

  const hasStartedRef = useRef(false);

  async function runCapture(captureText: string) {
    setPhase("capturing");
    setCancelledNotice(false);
    const result = await captureScreenPosition({ targetApp, monitorBounds });

    if (result.status === "captured" && result.position) {
      const position = result.position;
      if (existingStep) {
        onConfirm({ ...existingStep, position } as StepDraft);
        return;
      }
      if (type === "click") {
        onConfirm({ id: crypto.randomUUID(), type: "click", position });
        return;
      }
      onConfirm({
        id: crypto.randomUUID(),
        type: "auto-type",
        position,
        text: captureText,
      });
      return;
    }

    if (result.status === "cancelled") {
      if (existingStep) {
        onClose();
        return;
      }
      setCancelledNotice(true);
      setPhase("form");
      return;
    }

    onCaptureError(getCaptureErrorMessage(targetApp.name));
    if (existingStep) {
      setPhase("form");
      return;
    }
    onClose();
  }

  useEffect(() => {
    if (isAddClick && !hasStartedRef.current) {
      hasStartedRef.current = true;
      runCapture(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirmAutoTypeText() {
    runCapture(text);
  }

  function handleRefazerPosicao() {
    runCapture(text);
  }

  function handleSaveFields() {
    if (type === "press-key") {
      onConfirm({
        id: existingStep?.id ?? crypto.randomUUID(),
        type: "press-key",
        key,
        modifiers,
      });
      return;
    }
    if (type === "wait") {
      onConfirm({
        id: existingStep?.id ?? crypto.randomUUID(),
        type: "wait",
        seconds: Number(seconds),
      });
      return;
    }
    if (type === "manual-type") {
      onConfirm({
        id: existingStep?.id ?? crypto.randomUUID(),
        type: "manual-type",
        label: label.trim(),
        placeholder: placeholder.trim() ? placeholder.trim() : undefined,
      });
      return;
    }
    if (type === "auto-type" && existingStep) {
      onConfirm({ ...existingStep, text } as StepDraft);
    }
  }

  function toggleModifier(value: string) {
    setModifiers((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    );
  }

  const isTextValid = text.length >= 1 && text.length <= AUTO_TYPE_TEXT_MAX;
  const secondsNumber = Number(seconds);
  const isSecondsValid =
    /^\d+$/.test(seconds) &&
    secondsNumber >= WAIT_SECONDS_MIN &&
    secondsNumber <= WAIT_SECONDS_MAX;
  const trimmedLabel = label.trim();
  const isLabelValid =
    trimmedLabel.length >= 1 && trimmedLabel.length <= MANUAL_LABEL_MAX;

  const title =
    request.mode === "add"
      ? `Adicionar passo: ${STEP_TYPE_TITLES[type]}`
      : `Editar passo: ${STEP_TYPE_TITLES[type]}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

      {phase === "capturing" && (
        <DialogDescription>
          Aguardando clique na posição desejada em {targetApp.name}...
        </DialogDescription>
      )}

      {phase === "form" && cancelledNotice && (
        <p className="text-xs text-muted-foreground">Captura cancelada.</p>
      )}

      {phase === "form" && type === "click" && (
        <div className="flex flex-col gap-3">
          {existingStep?.type === "click" && (
            <p className="text-sm">
              Posição atual: ({existingStep.position.x}, {existingStep.position.y})
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {request.mode === "add" ? "Cancelar" : "Fechar"}
            </Button>
            <Button onClick={handleRefazerPosicao}>
              {request.mode === "add" ? "Tentar novamente" : "Refazer posição"}
            </Button>
          </div>
        </div>
      )}

      {phase === "form" && type === "auto-type" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="step-auto-type-text">Texto a digitar</Label>
            <Input
              id="step-auto-type-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Texto a digitar"
              maxLength={AUTO_TYPE_TEXT_MAX}
            />
          </div>

          {existingStep?.type === "auto-type" && (
            <p className="text-sm">
              Posição atual: ({existingStep.position.x}, {existingStep.position.y})
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            {existingStep ? (
              <>
                <Button variant="outline" onClick={handleRefazerPosicao}>
                  Refazer posição
                </Button>
                <Button disabled={!isTextValid} onClick={handleSaveFields}>
                  Salvar
                </Button>
              </>
            ) : (
              <Button
                disabled={!isTextValid}
                onClick={handleConfirmAutoTypeText}
              >
                Capturar posição
              </Button>
            )}
          </DialogFooter>
        </div>
      )}

      {phase === "form" && type === "press-key" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="step-press-key">Tecla</Label>
            <Select
              items={PRESS_KEY_OPTIONS}
              value={key}
              onValueChange={(value) => value && setKey(value)}
            >
              <SelectTrigger id="step-press-key" className="w-full">
                <SelectValue placeholder="Selecione uma tecla" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PRESS_KEY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Modificadores</Label>
            <div className="flex gap-4">
              {PRESS_KEY_MODIFIER_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`step-modifier-${option.value}`}
                    checked={modifiers.includes(option.value)}
                    onCheckedChange={() => toggleModifier(option.value)}
                  />
                  <Label htmlFor={`step-modifier-${option.value}`}>
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSaveFields}>Salvar</Button>
          </DialogFooter>
        </div>
      )}

      {phase === "form" && type === "wait" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="step-wait-seconds">Segundos</Label>
            <Input
              id="step-wait-seconds"
              type="number"
              min={WAIT_SECONDS_MIN}
              max={WAIT_SECONDS_MAX}
              value={seconds}
              onChange={(event) => setSeconds(event.target.value)}
              placeholder="Segundos"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!isSecondsValid} onClick={handleSaveFields}>
              Salvar
            </Button>
          </DialogFooter>
        </div>
      )}

      {phase === "form" && type === "manual-type" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="step-manual-label">Rótulo do campo</Label>
            <Input
              id="step-manual-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Rótulo do campo"
              maxLength={MANUAL_LABEL_MAX}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="step-manual-placeholder">
              Texto de exemplo (opcional)
            </Label>
            <Input
              id="step-manual-placeholder"
              value={placeholder}
              onChange={(event) => setPlaceholder(event.target.value)}
              placeholder="Texto de exemplo"
              maxLength={MANUAL_PLACEHOLDER_MAX}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!isLabelValid} onClick={handleSaveFields}>
              Salvar
            </Button>
          </DialogFooter>
        </div>
      )}
    </>
  );
}
