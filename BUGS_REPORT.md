# QA Findings — Team Task Board

This report covers manual testing of the Team Task Board app against the acceptance
criteria in TTB-0 through TTB-9, plus code-level root-cause analysis where the
source was reviewed directly.

## Summary

Two high-severity persistence bugs were found that affect the app's core reliability
promise (TTB-3, TTB-4, TTB-8): completing a task and deleting a task both appear to
work in the UI but are never actually written to storage. A related pair of bugs in
`App.tsx` means failed saves are sometimes reported to the user as successful, or
silently discard unsaved edits — undermining TTB-9's entire purpose. Several
validation gaps were also found in the shared `validateTaskInput` logic, and a few
TTB-5/TTB-7 acceptance criteria couldn't be fully exercised because the UI has no
control for the relevant feature (archiving, in particular). See **Architecture
observation** near the end for the pattern connecting several of these.

---

## High severity

### 1. Completing a task does not persist
**Ticket:** TTB-4
**File:** `src/components/TaskItem.tsx`

**Steps to reproduce:**
1. Check the checkbox on any task.
2. Observe the strikethrough/completed styling apply immediately.
3. Refresh the page.

**Expected:** Task remains marked complete after refresh (per TTB-4 and TTB-8).
**Actual:** Task reverts to incomplete. Switching filter tabs and back has the same
effect, since it also causes `TaskItem` to re-render from the original (unsaved) data.

**Root cause:** `handleToggle` only updates local component state:
```js
function handleToggle() {
  setCompleted((prev) => !prev);
}
```
It never calls the `onEdit` prop, which is the function that actually persists a
change (see `handleSaveEdit`, which correctly calls `await onEdit(...)`). The toggle
is not wired to the persistence layer at all.

**Suggested fix:** Call `onEdit(task.id, { completed: !completed })` instead of only
updating local state.

---

### 2. Deleted tasks reappear after refresh (and deletes can "undo" each other)
**Ticket:** TTB-3, TTB-8
**File:** `src/api/fakeTaskApi.ts`

**Steps to reproduce:**
1. Delete Task A. It disappears from the list.
2. Delete Task B. Task A reappears in the list immediately (before any refresh).
3. Refresh the page.

**Expected:** Deleted tasks stay deleted permanently (TTB-3: "no undo, no recovery").
**Actual:** Neither delete persists. After refresh, both A and B are back. Deleting a
second task causes an already-deleted task to visibly reappear in the same session.

**Root cause:** `deleteTask` computes the correct filtered list but never writes it
back to storage:
```js
export async function deleteTask(id: string): Promise<Task[]> {
  if (SIMULATE_FAILURE) { ... }
  const tasks = readFromStorage();
  const remaining = tasks.filter((t) => t.id !== id);
  return delay(remaining); // <-- writeToStorage(remaining) is never called
}
```
Compare to `createTask`/`updateTask`, both of which call `writeToStorage(...)` before
returning. Since storage is never updated, the *next* delete re-reads the original,
unmodified list from storage — which is why a previously "deleted" task reappears as
soon as another delete happens.

**Additional note:** Because `deleteTask` doesn't throw (except when
`SIMULATE_FAILURE` is on), the UI shows a success toast on every delete, even though
nothing was actually saved — a false-positive success signal.

**Suggested fix:** Add `writeToStorage(remaining);` before the return statement.

---

### 3. Whitespace-only titles are accepted
**Ticket:** TTB-1, TTB-2
**File:** `src/logic/taskValidation.ts`

**Steps to reproduce:** Enter only spaces as a task title (create or edit) and save.

**Expected:** Rejected, same as an empty title (explicit TTB-1 acceptance criterion).
**Actual:** Saves successfully.

**Root cause:**
```js
if (input.title.length === 0) {
```
only catches a fully empty string; `"   ".length` is non-zero.

**Suggested fix:** `if (input.title.trim().length === 0)`.

---

### 4. Past due dates are accepted (create and edit)
**Ticket:** TTB-1, TTB-2
**File:** `src/logic/taskValidation.ts`

**Steps to reproduce:** Set a due date in the past when creating or editing a task.

**Expected:** Rejected with a visible error ("must be today or later" per TTB-1).
**Actual:** Saves with no error, on both create and edit (shared validation function).

**Root cause:** `validateTaskInput` only checks that the date string parses, never
compares it against today's date — there is no such comparison anywhere in the
function.

**Suggested fix:** Add a check comparing the parsed date against the start of the
current day, being careful to compare calendar dates rather than full timestamps to
avoid timezone-related false rejections of "today."

---

### 5. Priority sort order is wrong (Medium sorts after Low)
**Ticket:** TTB-7
**File:** `src/logic/taskSorting.ts` (not yet reviewed line-by-line — confirmed via
manual testing against the ticket's worked examples)

**Steps to reproduce:** Create tasks with Low, Medium, and High priority.

**Expected:** High → Medium → Low.
**Actual:** Medium appears after Low in the rendered order.

**Suggested next step:** Review the comparator in `taskSorting.ts` directly; likely
an incorrect rank mapping or comparator direction for the Medium case specifically,
since High vs. Low ordering was correct.

---

### 6. Failed task creation still shows a success banner
**Ticket:** TTB-9
**File:** `src/App.tsx`

**Steps to reproduce:**
1. Set `SIMULATE_FAILURE = true` in `fakeTaskApi.ts`.
2. Create a new task.

**Expected:** An error banner, since the create call rejects.
**Actual:** The green "Task added." success banner shows anyway, and no error is
surfaced to the user at all.

**Root cause:** the catch block in `handleCreate` sets a success banner instead of an
error one — looks like a copy/paste mistake from the try block:
```js
} catch (err) {
  console.error(err);
  setBanner({ type: "success", text: "Task added." }); // should be type: "error"
}
```
This is the most direct violation of TTB-9 found in the app: on a failed create, the
user is told the exact opposite of what actually happened.

**Suggested fix:** `setBanner({ type: "error", text: "Failed to add task." })`.

---

## Medium severity

### 7. Edit form closes on save failure, same as on success
**Ticket:** TTB-9
**Files:** `src/components/TaskItem.tsx`, `src/App.tsx`

**Steps to reproduce:**
1. Set `SIMULATE_FAILURE = true` in `fakeTaskApi.ts`.
2. Edit any task's priority and click Save.

**Expected:** On failure, the form should stay open with the unsaved edits intact, so
the user can retry without re-entering everything (this is the implied intent behind
TTB-9's "clear, actionable save feedback").
**Actual:** The edit form closes immediately, identically to a successful save. The
only visible difference is the banner color; unsaved edits are lost.

**Confirmed root cause:** `App.tsx`'s `handleEdit` catches the thrown error to show
the failure banner, but never re-throws it:
```js
async function handleEdit(id: string, updates: Partial<Task>) {
  try {
    const updated = await updateTask(id, updates);
    ...
    setBanner({ type: "success", text: "Task updated." });
  } catch (err) {
    console.error(err);
    setBanner({ type: "error", text: "Failed to update task." }); // swallowed here
  }
}
```
Because the error never propagates back out of `handleEdit`, `TaskItem.tsx`'s
`handleSaveEdit` (`await onEdit(...)`) sees a normal, non-throwing resolution — it
has no way to know the save failed, so it unconditionally proceeds to
`setIsEditing(false)`.

**Suggested fix:** Re-throw in the catch block (or return a success/failure result)
so the caller in `TaskItem.tsx` can decide whether to close the form.

---

### 8. "Close" button on an edit row discards nothing — reopening shows stale unsaved edits
**Ticket:** TTB-2
**File:** `src/components/TaskItem.tsx`

**Steps to reproduce:**
1. Click Edit on a task, change the title (don't save).
2. Click **Close** (not Cancel).
3. Click Edit again on the same task.

**Expected:** Since the edit wasn't saved, reopening should show the task's actual
saved values.
**Actual:** The previously typed, unsaved value is still sitting in the field.

**Root cause:** The "Close" button only toggles `isEditing`:
```js
onClick={() => setIsEditing((v) => !v)}
```
It does not reset the draft state fields, unlike the separate **Cancel** button
(`handleCancelEdit`), which correctly resets `draftTitle`/`draftPriority`/`draftDue`
before closing. "Close" and "Cancel" look like they should behave the same way but
don't.

**Suggested fix:** Have the "Close" button call the same reset logic as
`handleCancelEdit`, or remove the redundant Close/Cancel distinction.

---

## Low severity

### 9. Search is case-sensitive
**Ticket:** TTB-6
**File:** `src/logic/taskFiltering.ts` (not yet reviewed directly)

Ticket explicitly calls for case-insensitive matching; testing shows it currently
is not.

### 10. Inline edit-validation error text is not styled as an error
**Ticket:** TTB-2
**File:** `src/components/TaskItem.tsx` / CSS

The `editError` message renders in a `.form-error` div with no color override
visible in the component; the text displays in default (black) rather than a color
that reads as an error state. Likely a missing CSS rule rather than a logic bug.

---

## Spec-vs-build gaps (can't be fully verified as implemented)

- **TTB-5 (Filters) — `archived` field:** The `Task` type includes an `archived`
  flag that all three filter views are supposed to exclude, but there's no UI
  control anywhere that sets `archived: true`. This acceptance criterion can only be
  partially tested (by manually editing localStorage), and most of the "does
  Completed/Active/All correctly exclude archived tasks" criteria are effectively
  untestable through normal use.
- **TTB-1 validation — invalid priority:** The create/edit UI only offers a
  `<select>` with the three valid priority values, so the "priority must be one of
  low/medium/high" rejection path in `validateTaskInput` can't be triggered through
  the UI at all — it would only matter if priority were ever set some other way
  (e.g. corrupted localStorage data).

---

## Open questions / suggestions (not bugs)

- Should task titles allow arbitrary special characters or purely numeric values?
  No length or character-set restriction currently exists — worth confirming this is
  intentional.
- Should toggling completion have any validation at all (e.g. blocking completion of
  a task with certain states)? Nothing in the tickets suggests it should, but worth
  confirming as a non-goal explicitly.
- The native browser date picker allows leaving a due-date selection mid-entry
  without a visible in-progress state — not necessarily a bug, but worth a UX look.

---

## Architecture observation

Several of the most serious bugs found share a common shape: **the UI updates or
reports success optimistically, without the underlying persistence call actually
succeeding or even being made.** Toggle-completion never calls the persistence
function at all; delete computes the right result but never writes it; create's
error handler reports success even on failure; edit's error handler swallows the
error rather than letting the caller react to it. `createTask`'s success path and
the validation-triggering path of `updateTask` are the only flows that reliably
round-trip correctly end-to-end. Given this pattern repeated independently across
multiple files, it's worth a broader pass checking every user action that's supposed
to persist and every catch block that's supposed to report failure, rather than
treating these as isolated fixes — plus a small integration test (create → refresh →
still there, toggle → refresh → still there, delete → refresh → still gone, and a
failed save → error banner shown → nothing persisted) would have caught all of these
immediately and is cheap to write once as a template for future regressions.

## Suggested next steps for reliable delivery

- Add Vitest unit tests for the pure logic functions (`taskValidation.ts`,
  `taskFiltering.ts`, `taskSorting.ts`) — cheap, deterministic, and would have caught
  bugs #3, #4, #5, #9 directly.
- Add a small set of integration tests (React Testing Library) covering the
  create → refresh, toggle → refresh, and delete → refresh round trips, plus the
  `SIMULATE_FAILURE` failure-banner path for both create and edit.
- Add a GitHub Actions workflow running `npm ci && npm run lint && npm test &&
  npm run build` on every push/PR, so regressions like the missing `writeToStorage`
  call or a swapped banner type are caught before merge rather than by manual QA.
