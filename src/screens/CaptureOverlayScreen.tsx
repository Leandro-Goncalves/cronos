export interface CaptureOverlayScreenProps {
  appName: string;
}

export function CaptureOverlayScreen({ appName }: CaptureOverlayScreenProps) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-black/15">
      <p className="text-sm text-white">Abrindo {appName}...</p>
    </div>
  );
}
