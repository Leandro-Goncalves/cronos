// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { StepsList } from "./StepsList";
import type { StepDraft } from "../lib/steps";

let capturedProps: ComponentProps<typeof import("@dnd-kit/core").DndContext> | null =
  null;

vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core");
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      capturedProps = props;
      return props.children;
    },
  };
});

const steps: StepDraft[] = [
  { id: "1", type: "click", position: { x: 1, y: 1 } },
  { id: "2", type: "wait", seconds: 3 },
  { id: "3", type: "manual-type", label: "Nome" },
];

describe("StepsList", () => {
  afterEach(() => {
    cleanup();
    capturedProps = null;
  });

  it("test_rendersOneRowPerStepInOrder", () => {
    render(
      <StepsList steps={steps} onReorder={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />
    );
    const rows = screen.getAllByTestId("step-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Click em (1, 1)");
    expect(rows[1]).toHaveTextContent("Esperar 3s");
    expect(rows[2]).toHaveTextContent("Manual: Nome");
  });

  it("test_editButtonClick_invokesOnEditWithStep", () => {
    const onEdit = vi.fn();
    render(
      <StepsList steps={steps} onReorder={vi.fn()} onEdit={onEdit} onRemove={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText("Editar passo: Esperar 3s"));
    expect(onEdit).toHaveBeenCalledWith(steps[1]);
  });

  it("test_removeButtonClick_invokesOnRemoveImmediatelyNoConfirmation", () => {
    const onRemove = vi.fn();
    render(
      <StepsList steps={steps} onReorder={vi.fn()} onEdit={vi.fn()} onRemove={onRemove} />
    );
    fireEvent.click(screen.getByLabelText("Remover passo: Esperar 3s"));
    expect(onRemove).toHaveBeenCalledWith("2");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("test_dragEnd_reordersArrayAndInvokesOnReorder", () => {
    const onReorder = vi.fn();
    render(
      <StepsList steps={steps} onReorder={onReorder} onEdit={vi.fn()} onRemove={vi.fn()} />
    );

    act(() => {
      capturedProps?.onDragEnd?.({
        active: { id: "1" },
        over: { id: "3" },
      } as never);
    });

    expect(onReorder).toHaveBeenCalledWith([steps[1], steps[2], steps[0]]);
  });

  it("test_duringDrag_showsLiveInsertionIndicator", () => {
    render(
      <StepsList steps={steps} onReorder={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />
    );

    expect(screen.queryByTestId("insertion-indicator")).not.toBeInTheDocument();

    act(() => {
      capturedProps?.onDragStart?.({ active: { id: "1" } } as never);
    });
    act(() => {
      capturedProps?.onDragOver?.({
        active: { id: "1" },
        over: { id: "3" },
      } as never);
    });

    expect(screen.getByTestId("insertion-indicator")).toBeInTheDocument();
  });
});
