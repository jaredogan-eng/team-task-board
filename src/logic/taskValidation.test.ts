import { describe, it, expect } from "vitest";
import { validateTaskInput } from "./taskValidation";

describe("validateTaskInput", () => {
    // --- Title checks (TTB-1, TTB-2) ---

    it("rejects an empty title", () => {
        const result = validateTaskInput({
            title: "",
            priority: "medium",
        });
        expect(result.valid).toBe(false);
    });

    it("rejects a whitespace-only title", () => {
        // NOTE: this currently FAILS — see BUGS_REPORT.md #3.
        // validateTaskInput only checks title.length === 0, so "   " (length 3)
        // passes through as valid. This test documents the expected behavior.
        const result = validateTaskInput({
            title: "   ",
            priority: "medium",
        });
        expect(result.valid).toBe(false);
    });

    it("accepts a normal, non-empty title", () => {
        const result = validateTaskInput({
            title: "Write test cases",
            priority: "medium",
        });
        expect(result.valid).toBe(true);
    });

    // --- Priority checks (TTB-1) ---

    it("rejects an invalid priority value", () => {
        const result = validateTaskInput({
            // @ts-expect-error intentionally invalid for this test
            title: "Some task",
            priority: "urgent",
        });
        expect(result.valid).toBe(false);
    });

    it("accepts each of the three valid priorities", () => {
        for (const priority of ["low", "medium", "high"] as const) {
            const result = validateTaskInput({ title: "Some task", priority });
            expect(result.valid).toBe(true);
        }
    });

    // --- Due date checks (TTB-1, TTB-2) ---

    it("accepts a task with no due date at all", () => {
        const result = validateTaskInput({
            title: "Some task",
            priority: "medium",
        });
        expect(result.valid).toBe(true);
    });

    it("rejects a malformed due date string", () => {
        const result = validateTaskInput({
            title: "Some task",
            priority: "medium",
            dueDate: "not-a-real-date",
        });
        expect(result.valid).toBe(false);
    });

    it("accepts a due date of today", () => {
        const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
        const result = validateTaskInput({
            title: "Some task",
            priority: "medium",
            dueDate: today,
        });
        expect(result.valid).toBe(true);
    });

    it("accepts a due date in the future", () => {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        const result = validateTaskInput({
            title: "Some task",
            priority: "medium",
            dueDate: tomorrow,
        });
        expect(result.valid).toBe(true);
    });

    it("rejects a due date in the past", () => {
        // NOTE: this currently FAILS — see BUGS_REPORT.md #4.
        // validateTaskInput never compares dueDate against today's date at all,
        // so any parseable date, including ones in the past, is accepted.
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        const result = validateTaskInput({
            title: "Some task",
            priority: "medium",
            dueDate: yesterday,
        });
        expect(result.valid).toBe(false);
    });
});
