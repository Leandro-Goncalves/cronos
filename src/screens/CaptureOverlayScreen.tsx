import { useEffect, useState } from "react";

export interface CaptureOverlayScreenProps {
  appName: string;
}

export function CaptureOverlayScreen({ appName }: CaptureOverlayScreenProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function handleReady() {
      setReady(true);
    }
    window.ipcRenderer.on("overlay:ready", handleReady);
    return () => {
      window.ipcRenderer.off("overlay:ready", handleReady);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        window.ipcRenderer.invoke("capture:cancel");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      className="flex h-screen w-screen items-center justify-center bg-black/15"
      onMouseDown={(event) => {
        if (!ready) return;
        if (event.button !== 0) return;
        window.ipcRenderer.invoke("capture:click", {
          x: Math.round(event.clientX),
          y: Math.round(event.clientY),
        });
      }}
    >
      {ready ? (
        <div
          data-testid="capture-overlay-surface"
          className="absolute inset-0 cursor-crosshair"
        />
      ) : (
        <p className="text-sm text-white">Abrindo {appName}...</p>
      )}
    </div>
  );
}
