import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskItem } from "./TaskItem";
import type { Task } from "../types/task";

const baseTask: Task = {
  id: "1",
  title: "Write report",
  completed: false,
  priority: "medium",
  dueDate: null,
  archived: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("TaskItem", () => {
  it("calls onEdit with the toggled completed value when the checkbox is clicked", () => {
    // NOTE: this currently FAILS — see BUGS_REPORT.md #1.
    // handleToggle only updates local component state and never calls onEdit,
    // so the checkbox click never actually persists. This test encodes the
    // correct expected behavior.
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<TaskItem task={baseTask} onEdit={onEdit} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onEdit).toHaveBeenCalledWith(baseTask.id, { completed: true });
  });

  it("calls onDelete with the task's id when Delete is clicked", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<TaskItem task={baseTask} onEdit={onEdit} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith(baseTask.id);
  });

  it("opens the edit row when Edit is clicked, pre-filled with the current title", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<TaskItem task={baseTask} onEdit={onEdit} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    expect(screen.getByLabelText(/edit title/i)).toHaveValue(baseTask.title);
  });
});
