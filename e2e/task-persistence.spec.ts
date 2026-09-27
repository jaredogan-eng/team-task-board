import { test, expect } from "@playwright/test";

test("creating a task persists across a page reload", async ({ page }) => {
  await page.goto("/");

  const title = `E2E test task ${Date.now()}`;

  await page.getByLabel("Task title").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();

  // The task should appear immediately after creating it.
  await expect(page.getByText(title)).toBeVisible();

  // The real test: does it survive a reload, i.e. was it actually persisted
  // to localStorage rather than just held in React state? (TTB-1, TTB-8)
  await page.reload();

  await expect(page.getByText(title)).toBeVisible();
});
