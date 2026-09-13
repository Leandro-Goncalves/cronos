import { useEffect, useRef } from "react";
import type { ExecutionRequest } from "./ExecuteActionScreen";

interface ExecutionResult {
  success: boolean;
  actionName?: string;
  errorMessage?: string;
}

interface RunningScreenProps {
  request: ExecutionRequest;
  onComplete: (toastMessage: string) => void;
}

export function RunningScreen({ request, onComplete }: RunningScreenProps) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let cancelled = false;

    window.ipcRenderer
      .invoke("execution:run", request)
      .then((result: ExecutionResult) => {
        if (cancelled) return;

        const toastMessage = result.success
          ? `Ação '${result.actionName}' executada com sucesso.`
          : result.errorMessage ?? "Não foi possível executar a ação.";

        onCompleteRef.current(toastMessage);
      });

    return () => {
      cancelled = true;
    };
  }, [request]);

  return null;
}
