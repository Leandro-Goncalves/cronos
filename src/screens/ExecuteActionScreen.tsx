import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export interface ExecutionRequest {
  actionId: string;
  manualValues: Record<string, string>;
}

interface ManualField {
  stepId: string;
  label: string;
  placeholder?: string;
}

interface RawStep {
  id: string;
  type: string;
  label?: string;
  placeholder?: string;
}

interface RawAction {
  id: string;
  name: string;
  steps: RawStep[];
}

interface ExecuteActionScreenProps {
  actionId: string;
  onConfirm: (request: ExecutionRequest) => void;
  onCancel: () => void;
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function ExecuteActionScreen({
  actionId,
  onConfirm,
  onCancel,
}: ExecuteActionScreenProps) {
  const [manualFields, setManualFields] = useState<ManualField[] | null>(
    null
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    let cancelled = false;

    window.ipcRenderer
      .invoke("actions:get", actionId)
      .then((action: RawAction | null) => {
        if (cancelled) return;

        const manual: ManualField[] = (action?.steps ?? [])
          .filter((step) => step.type === "manual-type")
          .map((step) => ({
            stepId: step.id,
            label: step.label ?? "",
            placeholder: step.placeholder,
          }));

        if (manual.length === 0) {
          onConfirmRef.current({ actionId, manualValues: {} });
          return;
        }

        setManualFields(manual);
        setValues(Object.fromEntries(manual.map((field) => [field.stepId, ""])));
      });

    return () => {
      cancelled = true;
    };
  }, [actionId]);

  if (!manualFields) {
    return null;
  }

  const allFieldsFilled = manualFields.every((field) =>
    isNonEmpty(values[field.stepId] ?? "")
  );

  function handleExecutar() {
    const manualValues = Object.fromEntries(
      manualFields!.map((field) => [field.stepId, values[field.stepId].trim()])
    );
    onConfirm({ actionId, manualValues });
  }

  return (
    <div className="mx-auto flex h-screen max-w-xl flex-col gap-4 p-6">
      <h1 className="font-heading text-xl font-semibold">Executar ação</h1>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {manualFields.map((field) => (
          <div key={field.stepId} className="flex flex-col gap-1.5">
            <Label htmlFor={`manual-field-${field.stepId}`}>
              {field.label}
            </Label>
            <Input
              id={`manual-field-${field.stepId}`}
              value={values[field.stepId] ?? ""}
              placeholder={field.placeholder}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  [field.stepId]: event.target.value,
                }))
              }
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onCancel()}>
          Cancelar
        </Button>
        <Button onClick={handleExecutar} disabled={!allFieldsFilled}>
          Executar
        </Button>
      </div>
    </div>
  );
}
