export interface CaptureTargetApp {
  name: string;
  path: string;
  iconPath: string;
}

export interface CaptureMonitorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CapturePositionRequest {
  targetApp: CaptureTargetApp;
  monitorBounds: CaptureMonitorBounds;
}

export interface CapturePositionResult {
  status: "captured" | "cancelled" | "error";
  position?: { x: number; y: number };
}

export function captureScreenPosition(
  request: CapturePositionRequest
): Promise<CapturePositionResult> {
  return window.ipcRenderer.invoke("capture:start", request);
}

export function getCaptureErrorMessage(appName: string): string {
  return `Não foi possível abrir ${appName} para capturar a posição.`;
}
