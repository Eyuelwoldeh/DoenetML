# `<parsons>` — Parsons problems in DoenetML

First written: 2026-09-25. Updated 2026-10-02 after the review meeting
(horizontal layout, reset, alignment, kept gaps, empty rows, length feedback,
authoring diagnostics).

## Goal

Let authors write Parsons problems (arrange shuffled code/text/math blocks into
a correct order, optionally with indentation and distractors) as a first-class
component, replacing the hand-built pattern of hidden `<point>`s,
`<text anchor=...>` labels in a `<graph>`, and a dozen coordinate comparisons
inside `<award><when>`.

## Decisions

| Question            | Decision                                                                        |
| ------------------- | ------------------------------------------------------------------------------- |
| UI                  | HTML list widget (Runestone style), not JSXGraph                                |
| Grading             | Exact match → boolean `correct`; used inside a normal `<answer>`                |
| Feedback            | Standard answer correctness, plus state variables for author-written `<feedback>` |
| Interchangeable     | `<anyOrder>` wrapper: its blocks must be contiguous, any order                  |
| Block content       | Any inline DoenetML: `<m>` for math, `<c>` for code, text                       |
| Empty rows          | A student may leave rows of the solution empty; grading ignores them            |
| Long horizontal blocks | A warning to the author (over 40 characters), not an error                   |

Out of scope: partial credit, per-block highlighting, paired distractors
(PreTeXt `<choice>`), PreTeXt export, student-created blocks.

## 1. Authoring syntax

```xml
<parsons name="sel">
  <shortDescription>Selection sort pseudocode</shortDescription>
  <block indent="0">new_arr gets an empty array</block>
  <block indent="0">for i = 0,...,n-1:</block>
  <block indent="1">min_index gets the index of minimum value in arr</block>
  <anyOrder>
    <block indent="1">append arr[min_index] to new_arr</block>
    <block indent="1">remove arr[min_index] from arr</block>
  </anyOrder>
  <block indent="0">copy items in new_arr to arr</block>
  <block distractor>swap arr[min_index] and arr[i]</block>
</parsons>

<answer name="ans"><award><when>$sel.correct</when></award></answer>

<feedback condition="$sel.solutionTooShort" updateWith="$ans">Your answer is too short.</feedback>
```

- Non-distractor `<block>`s are written **in the correct order**.
- `<block>` content is arbitrary inline DoenetML.
- `indent` (integer, default 0). Indentation is graded only if some block
  specifies `indent` **and** the layout is vertical.
- `distractor` — the block must not appear in a correct solution.
- `<anyOrder>` — its blocks must be contiguous in the solution, in any order.
  It may not be nested.

### `<parsons>` attributes

| Attribute         | Values                          | Default    | Meaning                                              |
| ----------------- | ------------------------------- | ---------- | ---------------------------------------------------- |
| `layout`          | `vertical`, `horizontal`        | `vertical` | Two columns, or blocks flowing in rows (no indent)   |
| `horizontalAlign` | `left`, `center`, `right`       | `left`     | Alignment of the content inside each block           |
| `shuffle`         | boolean                         | `true`     | Shuffle the starting list (seeded by the variant)    |
| `maxIndent`       | integer                         | max authored indent + 1 | Largest indent a student can apply      |

Plus the attributes every `Input` has (`forAnswer`, `disabled`, labels, …).

## 2. Worker (`packages/doenetml-worker-javascript`)

`src/components/Parsons.js` exports three components, registered in
`ComponentTypes.js`:

- **`Parsons extends Input`** (`parsons`).
- **`Block`** (`block`) — inline container; attributes `indent`, `distractor`,
  and an internal `anyOrderGroup`.
- **`AnyOrder extends Group`** (`anyOrder`) — a composite that expands into its
  blocks, tagging each with its own component index, so `Parsons` sees a flat
  list of blocks.

### `Parsons` state variables

| Name                                   | Kind                 | Meaning                                                             |
| -------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| `blocks`                               | derived, forRenderer | per block: `{ indent, indentSpecified, distractor, group, text }`   |
| `numBlocks`                            | public               | number of blocks, including distractors                             |
| `indentationGraded`                    | public, forRenderer  | some block has `indent` and the layout is vertical                  |
| `maxIndent`                            | public, forRenderer  | largest indent a student can apply                                  |
| `initialOrder`                         | forRenderer          | 1-based block indices of the starting list (seeded shuffle)         |
| `allSolutionOrder`, `allSolutionIndents` | essential, forRenderer | the solution **row by row**; an order entry of 0 is an empty row |
| `solutionOrder`, `solutionIndents`     | public arrays        | the arrangement **without** empty rows                              |
| `numBlocksInSolution`, `numBlocksNeeded` | public             | blocks placed; blocks a correct solution has                        |
| `solutionTooShort`, `solutionTooLong`  | public booleans      | placed fewer / more blocks than a correct solution                  |
| `correct`                              | public boolean       | see grading                                                         |
| `valueToRecordOnSubmit`                | alias                | → `solutionOrder`, the response an `<answer>` records               |

**Shuffle:** `rngClass(variantSeed + "po")`, Fisher–Yates, as in `choiceInput`.

### Grading

`isParsonsSolutionCorrect` in `src/utils/parsons.ts` (pure, unit-tested).
Expected segments are the non-distractor blocks in source order, with each
`<anyOrder>` as one segment. Correct iff the placed blocks (empty rows removed)
are exactly the non-distractor blocks, each segment's blocks appear together
in segment order (any order inside an `<anyOrder>`), and indents match when
`indentationGraded`. A problem with no solution blocks is never correct.

### Action

`updateArrangement({ order, indents })` — `order` is the rows of the solution
(block index or 0). Rejected (with a console warning) if it is not an array of
integers in range, repeats a block, mismatches `indents` in length, or has more
than 3 rows per block. Trailing empty rows are dropped and indents are clamped
to `[0, maxIndent]`. Ignored when `disabled`.

### Length feedback

No dedicated feedback component. Authors use the existing
`<feedback condition="…" updateWith="$ans">`, which re-evaluates only when the
answer is submitted, with `$p.solutionTooShort`, `$p.solutionTooLong`, or their
own threshold such as `$p.numBlocksInSolution < 0.5*$p.numBlocksNeeded`.

### Authoring diagnostics (warnings)

| Code           | When                                                                 |
| -------------- | -------------------------------------------------------------------- |
| `doenet-w0168` | no block belongs in the solution                                     |
| `doenet-w0169` | a distractor is inside `<anyOrder>`                                  |
| `doenet-w0170` | a solution block's indent is outside `[0, maxIndent]`                |
| `doenet-w0171` | `<anyOrder>` nested in `<anyOrder>`                                  |
| `doenet-w0172` | a `<block>` is not inside a `<parsons>`                              |
| `doenet-w0173` | `indent` used with `layout="horizontal"`                             |
| `doenet-w0174` | a block is over 40 characters in a horizontal layout                 |

Messages live in `packages/i18n/locales/en/diagnostics.ftl`.

## 3. Renderer (`packages/doenetml/src/Viewer/renderers/parsons.tsx`, `.css`)

- **Vertical:** two equal-height columns, "Drag from here" and "Your solution";
  they stack on narrow screens. **Horizontal:** the two lists are stacked and
  blocks flow left to right, wrapping.
- **Kept gaps:** a block in the solution leaves a same-size dashed gap in the
  source list, so the list keeps its shape.
- **Pointer drag** (pointer events, no dependency). In the solution, a drop
  inserts before the row the pointer precedes, takes over an empty row the
  pointer is on, or — dropped below every row — leaves one empty row per
  row-height of distance. Horizontal drop position sets the indent.
- **Empty rows** are removed by clicking them.
- **Keyboard:** Enter/Space moves a block between the lists; Up/Down swap with
  the neighbouring row (Left/Right too in a horizontal layout); Down on the
  last block leaves an empty row above it; Left/Right change indent when it is
  graded. A live region announces each move.
- **Reset** button returns every block to the source list.
- The check-work button appears when the `<parsons>` is inside an `<answer>`.
- All visible strings are in `packages/i18n/locales/en/chrome.ftl`
  (`parsons-*`).
- `children` from `useDoenetRenderer` carries a `null` for each unrendered
  child, so the renderer filters those before indexing blocks.

## 4. Testing

- **Vitest:** `src/test/tagSpecific/parsons.test.ts` — grading function cases;
  arrangement, credit, invalid input, indent clamping, order-only problems,
  shuffle per variant, saved state, math/code blocks, length feedback on
  submit, horizontal layout, authoring diagnostics, empty rows.
- **Not yet covered:** the renderer (dragging, keyboard, reset, gaps). A
  Cypress spec is still to be written.
- **Manual:** `packages/doenetml/dev/testCode.doenet` on `npm run dev`.

## 5. Still to do

Cypress spec; reference page in `packages/docs-nextra`; changeset; PreTeXt
export (`doenetml-to-pretext` has no `parsons` renderer).
