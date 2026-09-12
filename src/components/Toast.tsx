import { useEffect, useState } from "react";

interface ToastProps {
  message: string | null;
  duration?: number;
}

export function Toast({ message, duration = 2500 }: ToastProps) {
  const [visible, setVisible] = useState(message !== null);

  useEffect(() => {
    if (message === null) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timeout = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timeout);
  }, [message, duration]);

  if (!visible || message === null) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
      {message}
    </div>
  );
}
