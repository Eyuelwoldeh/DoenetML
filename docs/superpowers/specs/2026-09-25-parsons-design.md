# `<parsons>` — Parsons problems in DoenetML

Date: 2026-09-25
Status: approved design, pending implementation plan

## Goal

Let authors write Parsons problems (arrange shuffled code/text blocks into a
correct order, optionally with indentation and distractors) as a first-class
component, replacing today's hand-built pattern of hidden `<point>`s,
`<text anchor=...>` labels in a `<graph>`, and a dozen hand-written coordinate
comparisons inside `<award><when>`.

Success: the selection-sort problem from the current course material can be
authored with the syntax below, graded with `$sel.correct`, and solved by a
student using mouse, touch, or keyboard only.

## Decisions (from brainstorming)

| Question            | Decision                                                            |
| ------------------- | ------------------------------------------------------------------- |
| UI                  | HTML two-column list widget (Runestone style), not JSXGraph         |
| Grading             | Exact match → boolean `correct`; used inside a normal `<answer>`    |
| Feedback            | Standard Doenet answer correctness only; no per-block highlighting  |
| Interchangeable     | `<anyOrder>` wrapper: its blocks must be contiguous, any order      |

Out of scope (can be added later without redesign): partial credit, per-block
feedback, hint lines, paired distractors (PreTeXt `<choice>`), PreTeXt export,
student-created blocks.

## 1. Authoring syntax

```xml
<parsons name="sel">
  <block indent="0">new_arr gets an empty array</block>
  <block indent="0">for i = 0,...,n-1:</block>
  <block indent="1">min_index gets the index of minimum value in arr</block>
  <anyOrder>
    <block indent="1">append arr[min_index] to new_arr</block>
    <block indent="1">remove arr[min_index] from arr</block>
  </anyOrder>
  <block indent="0">copy items in new_arr to arr</block>
  <block distractor>swap arr[min_index] and arr[i]</block>
  <block distractor>min_index gets ... at or after index i</block>
</parsons>

<answer><award><when>$sel.correct</when></award></answer>
```

- Non-distractor `<block>`s are written **in the correct order**.
- `<block>` content is arbitrary inline DoenetML (`<m>`, `<c>`, text, ...).
- `indent` (non-negative integer, default 0). If **no** block in the problem
  specifies `indent`, indentation is not graded and the indent UI is hidden
  (state variable `indentationGraded = false`).
- `distractor` (boolean) — block must not appear in a correct solution.
  Its position in the source is irrelevant.
- `<anyOrder>` — contains ≥1 `<block>`; those blocks must be contiguous in the
  solution, in any internal order. May not nest. Distractors inside
  `<anyOrder>` are an author error (diagnostic, treated as ordinary
  distractors).

### `<parsons>` attributes

- `shuffle` (boolean, default `true`) — shuffle the starting column.
- `maxIndent` (integer, default = max authored indent + 1, min 1) — cap on
  student indentation.
- Inherits `Input` attributes (`forAnswer`, `disabled`, label handling, etc.).

## 2. Worker (`packages/doenetml-worker-javascript`)

### New components

- **`Parsons extends Input`** (`componentType = "parsons"`), registered in
  `ComponentTypes.js`. Extending `Input` gives: answer discovery
  (placed inside `<answer>` or linked with `forAnswer`), `disabled` handling,
  and correctness coloring like other inputs.
- **`Block`** (`componentType = "block"`), inline container with attributes
  `indent`, `distractor`; renders its children. Only valid inside `<parsons>`
  (diagnostic otherwise).
- **`AnyOrder`** (`componentType = "anyOrder"`), a composite modeled on
  `Group`: it expands into its `<block>` children, stamping each with an
  internal group id, so `Parsons`' active children are a **flat list of
  blocks**. This keeps the renderer free of nesting.

### `Parsons` state variables

| Name                  | Kind                  | Meaning                                                                          |
| --------------------- | --------------------- | -------------------------------------------------------------------------------- |
| `blocks`              | derived, forRenderer  | per block (source order): `{ indent, distractor, group }`                        |
| `numBlocks`           | derived               | number of blocks                                                                 |
| `indentationGraded`   | derived, forRenderer  | any block specified `indent`                                                     |
| `initialOrder`        | derived, forRenderer  | 1-based block indices for the source column; seeded shuffle (see below)          |
| `solutionOrder`       | essential, public     | 1-based block indices currently in the solution column, top→bottom; default `[]` |
| `solutionIndents`     | essential, public     | indent per entry of `solutionOrder`; default `[]`                                |
| `correct`             | derived, public       | boolean; see grading                                                             |
| `valueToRecordOnSubmit` | alias → `solutionOrder` | what `<answer>` records as the response                                     |

The source column is derived in the renderer as `initialOrder` minus
`solutionOrder` (preserves the shuffled order of unused blocks).

**Shuffle:** same approach as `ChoiceInput.choiceOrder` —
`rngClass(variantSeed + "po")`, Fisher–Yates. Deterministic per document
variant, so reloads and saved state agree. `Parsons` does **not** declare
`createsVariants` (no variant enumeration needed).

### Grading (`correct`)

Let `expected` = non-distractor blocks in source order, grouped into
segments: each `<anyOrder>` is one segment, every other block is its own
segment. `correct` is true iff:

1. `solutionOrder` contains no distractor and every non-distractor block
   exactly once;
2. walking `solutionOrder` segment by segment, each segment's slice equals the
   segment's block set (order ignored inside an `<anyOrder>` segment, exact
   otherwise);
3. if `indentationGraded`, `solutionIndents[i] === blocks[solutionOrder[i]].indent`
   for all `i`.

Implemented as a pure function `isParsonsSolutionCorrect({ blocks, order,
indents, indentationGraded })` in `src/utils/parsons.ts` so it is unit-testable
without a core.

### Action

`updateArrangement({ order, indents, actionId, sourceInformation,
skipRendererUpdate })` → validates (integers, in range, no duplicates, equal
lengths, indents clamped to `[0, maxIndent]`) and calls
`coreFunctions.performUpdate` with `updateValue` instructions for
`solutionOrder` and `solutionIndents`, plus an `interacted` event. Invalid
input is ignored with a console warning (never throws). Ignored when
`disabled`.

## 3. Renderer (`packages/doenetml/src/Viewer/renderers/parsons.tsx`)

- Must be `.tsx` (the loader imports `./renderers/${rendererType}.tsx`).
- Two columns: **"Drag from here"** (source) and **"Your solution"**. On
  narrow screens the columns stack vertically.
- Each block renders its DoenetML children (from `children`, matched to
  `SVs.blocks` by index).
- **Pointer drag** (pointer events, no new dependency): pick up a block, drop
  between blocks in either column; in the solution column horizontal drop
  position sets indent (one level per fixed step, clamped to `maxIndent`).
  Indent guides are drawn when `indentationGraded`.
- **Keyboard:** blocks are focusable (`tabindex`, `role="option"` in a
  `role="listbox"` per column). Enter/Space moves the focused block to the
  other column; ↑/↓ reorder within a column; ←/→ change indent in the solution
  column. An `aria-live="polite"` region announces each move
  ("Moved 'for i = 0…' to solution, position 2, indent 0").
- Each drop / key move calls `callAction(actions.updateArrangement, …)` once
  with the full new `order` and `indents`; optimistic local state renders
  immediately and is replaced by `SVs` when the worker responds.
- When `SVs.disabled`, dragging and key moves are off; blocks are visually
  muted.
- Correctness coloring follows the existing input pattern (via
  `componentDeterminingDisplayedCorrectness` / `showCorrectness`).

## 4. Testing

**Vitest** — `src/test/tagSpecific/parsons.test.ts` (worker):
- `isParsonsSolutionCorrect` unit cases: correct; `anyOrder` swapped; block
  missing; distractor included; wrong order across segments; `anyOrder` split
  by another block; wrong indent; indent ignored when not graded.
- Core cases via `createTestCore`: `updateArrangement` updates
  `solutionOrder`/`solutionIndents`/`correct`; invalid args ignored;
  `$sel.correct` drives `<answer>` credit after submit; shuffle identical for
  the same variant and `shuffle="false"` keeps source order; saved state
  (`initialState`) restores the arrangement; `disabled` ignores actions.

**Cypress** — `packages/test-cypress/cypress/e2e/tagSpecific/parsons.cy.js`:
drag a block into the solution and indent it; keyboard-only solve of a small
problem; submit → correct/incorrect display; axe accessibility check.

**Manual** — the three-section test document (selection sort / tea / algebra)
in `packages/doenetml/dev/testCode.doenet` on `npm run dev`.

## 5. Docs & release

- Component docs: `componentDocs` summaries on `Parsons`, `Block`, `AnyOrder`;
  a reference page in `packages/docs-nextra` with the selection-sort example.
- Changeset per the repo's `changesets` skill.
