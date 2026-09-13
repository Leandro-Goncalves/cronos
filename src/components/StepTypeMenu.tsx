import {
  Clock,
  KeyRound,
  Keyboard,
  MousePointerClick,
  PenLine,
  Plus,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { StepType } from "../lib/steps";

export interface StepTypeMenuProps {
  onSelectType: (type: StepType) => void;
}

const AUTOMATIC_ITEMS: { type: StepType; label: string; icon: typeof MousePointerClick }[] = [
  { type: "click", label: "Click", icon: MousePointerClick },
  { type: "auto-type", label: "Digitar", icon: Keyboard },
  { type: "press-key", label: "Pressionar", icon: KeyRound },
  { type: "wait", label: "Esperar", icon: Clock },
];

const MANUAL_ITEMS: { type: StepType; label: string; icon: typeof PenLine }[] = [
  { type: "manual-type", label: "Digitar", icon: PenLine },
];

export function StepTypeMenu({ onSelectType }: StepTypeMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>
        <Plus />
        Adicionar passo
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Automático</DropdownMenuLabel>
          {AUTOMATIC_ITEMS.map(({ type, label, icon: Icon }) => (
            <DropdownMenuItem key={type} onClick={() => onSelectType(type)}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Manual</DropdownMenuLabel>
          {MANUAL_ITEMS.map(({ type, label, icon: Icon }) => (
            <DropdownMenuItem key={type} onClick={() => onSelectType(type)}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
