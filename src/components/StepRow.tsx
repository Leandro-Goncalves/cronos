import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Clock,
  GripVertical,
  KeyRound,
  Keyboard,
  MousePointerClick,
  Pencil,
  PenLine,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { summarizeStep, type StepDraft, type StepType } from "../lib/steps";

const STEP_ICONS: Record<StepType, typeof MousePointerClick> = {
  click: MousePointerClick,
  "auto-type": Keyboard,
  "press-key": KeyRound,
  wait: Clock,
  "manual-type": PenLine,
};

export interface StepRowProps {
  step: StepDraft;
  onEdit: () => void;
  onRemove: () => void;
}

export function StepRow({ step, onEdit, onRemove }: StepRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id });

  const Icon = STEP_ICONS[step.type];
  const summary = summarizeStep(step);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="step-row"
      className="flex items-center gap-2 px-3 py-2"
    >
      <button
        type="button"
        aria-label={`Reordenar: ${summary}`}
        className="touch-none cursor-grab text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-sm">{summary}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Editar passo: ${summary}`}
        onClick={onEdit}
      >
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Remover passo: ${summary}`}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
