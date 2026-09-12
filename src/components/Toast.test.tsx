// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

describe("Toast", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("test_toast_rendersMessage", () => {
    render(<Toast message="Ação criada com sucesso." />);
    expect(screen.getByText("Ação criada com sucesso.")).toBeInTheDocument();
  });

  it("test_toast_rendersNothingWhenMessageIsNull", () => {
    const { container } = render(<Toast message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("test_toast_autoDismissesAfterDuration", () => {
    vi.useFakeTimers();
    render(<Toast message="Ação excluída com sucesso." duration={2500} />);
    expect(
      screen.getByText("Ação excluída com sucesso.")
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(
      screen.queryByText("Ação excluída com sucesso.")
    ).not.toBeInTheDocument();
  });
});
