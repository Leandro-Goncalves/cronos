import { useEffect, useState } from "react";
import { AppPicker, type AppInfo } from "../components/AppPicker";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

export interface MonitorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DisplayInfo {
  id: number;
  label: string;
  bounds: MonitorBounds;
}

const NAME_MAX_LENGTH = 60;

export interface BasicInfoScreenProps {
  mode: "create" | "edit";
}

export function BasicInfoScreen({ mode }: BasicInfoScreenProps) {
  const [name, setName] = useState("");
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [monitorId, setMonitorId] = useState<number | null>(null);
  const [monitorBounds, setMonitorBounds] = useState<MonitorBounds | null>(
    null
  );
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null);

  useEffect(() => {
    window.ipcRenderer
      .invoke("displays:list")
      .then((result: DisplayInfo[]) => {
        setDisplays(result);
        if (result.length === 1) {
          setMonitorId(result[0].id);
          setMonitorBounds(result[0].bounds);
        }
      });
  }, []);

  const trimmedName = name.trim();
  const isNameValid =
    trimmedName.length >= 1 && trimmedName.length <= NAME_MAX_LENGTH;
  const monitorValid =
    displays.length === 0 ? false : displays.length === 1 ? true : monitorId !== null;
  const canConfirm =
    isNameValid && selectedApp !== null && monitorValid && monitorBounds !== null;

  function handleSelectMonitor(value: string | null) {
    if (value === null) return;
    const id = Number(value);
    setMonitorId(id);
    setMonitorBounds(displays.find((display) => display.id === id)?.bounds ?? null);
  }

  return (
    <div className="mx-auto flex h-screen max-w-xl flex-col gap-4 overflow-y-auto p-6">
      <h1 className="font-heading text-xl font-semibold">
        {mode === "create" ? "Adicionar ação" : "Editar ação"}
      </h1>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="basic-info-name">Nome da ação</Label>
        <Input
          id="basic-info-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nome da ação"
        />
      </div>

      {displays.length >= 2 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="basic-info-monitor">Monitor</Label>
          <Select
            value={monitorId !== null ? String(monitorId) : null}
            onValueChange={handleSelectMonitor}
          >
            <SelectTrigger id="basic-info-monitor" className="w-full">
              <SelectValue placeholder="Selecione um monitor" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {displays.map((display) => (
                  <SelectItem key={display.id} value={String(display.id)}>
                    {display.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Aplicativo</Label>
        <AppPicker value={selectedApp} onChange={setSelectedApp} />
      </div>

      <div className="mt-auto flex justify-end gap-2">
        <Button variant="outline">Cancelar</Button>
        <Button disabled={!canConfirm}>Confirmar</Button>
      </div>
    </div>
  );
}
