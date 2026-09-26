import type { Task, TaskInput } from "../types/task";

const STORAGE_KEY = "team-task-board:tasks";
const ARTIFICIAL_DELAY_MS = 200;

/**
 * Flip this to true to simulate the persistence layer rejecting writes.
 * Useful for verifying error-handling paths in the UI.
 */
export const SIMULATE_FAILURE = false

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ARTIFICIAL_DELAY_MS);
  });
}

function readFromStorage(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Task[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeToStorage(tasks: Task[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function generateId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

export async function getTasks(): Promise<Task[]> {
  return delay(readFromStorage());
}

export async function createTask(input: TaskInput): Promise<Task> {
  if (SIMULATE_FAILURE) {
    await delay(null);
    throw new Error("Simulated save failure.");
  }
  const now = new Date().toISOString();
  const task: Task = {
    id: generateId(),
    title: input.title,
    completed: false,
    priority: input.priority,
    dueDate: input.dueDate,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  const tasks = readFromStorage();
  tasks.push(task);
  writeToStorage(tasks);
  return delay(task);
}

export async function updateTask(
  id: string,
  updates: Partial<Omit<Task, "id" | "createdAt">>
): Promise<Task> {
  if (SIMULATE_FAILURE) {
    await delay(null);
    throw new Error("Simulated save failure.");
  }
  const tasks = readFromStorage();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) {
    throw new Error(`Task ${id} not found.`);
  }
  const updated: Task = {
    ...tasks[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  tasks[idx] = updated;
  writeToStorage(tasks);
  return delay(updated);
}

export async function deleteTask(id: string): Promise<Task[]> {
  if (SIMULATE_FAILURE) {
    await delay(null);
    throw new Error("Simulated save failure.");
  }
  const tasks = readFromStorage();
  const remaining = tasks.filter((t) => t.id !== id);
  return delay(remaining);
}
