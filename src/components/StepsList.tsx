import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { StepRow } from "./StepRow";
import { reorderStepsOnDragEnd, type StepDraft } from "../lib/steps";

export interface StepsListProps {
  steps: StepDraft[];
  onReorder: (steps: StepDraft[]) => void;
  onEdit: (step: StepDraft) => void;
  onRemove: (stepId: string) => void;
}

export function StepsList({ steps, onReorder, onEdit, onRemove }: StepsListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    onReorder(reorderStepsOnDragEnd(steps, event));
    setActiveId(null);
    setOverId(null);
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={steps.map((step) => step.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul data-testid="steps-list" className="divide-y divide-border">
          {steps.map((step) => (
            <li key={step.id} className="relative">
              {activeId !== null && overId === step.id && activeId !== step.id && (
                <div
                  data-testid="insertion-indicator"
                  className="absolute inset-x-0 -top-px h-0.5 bg-primary"
                />
              )}
              <StepRow
                step={step}
                onEdit={() => onEdit(step)}
                onRemove={() => onRemove(step.id)}
              />
            </li>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
