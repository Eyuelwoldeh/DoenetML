/**
 * The arrangement logic of the `<parsons>` renderer, kept free of React and the
 * DOM so it can be unit tested.
 *
 * The solution is a list of rows: `order[i]` is a 1-based block index, or 0 for
 * a row the student left empty as spacing, and `indents[i]` is that row's
 * indent. Empty rows below the last block are never kept.
 */
export type Arrangement = { order: number[]; indents: number[] };

export type ParsonsOptions = {
    horizontal: boolean;
    indentationGraded: boolean;
    maxIndent: number;
    /** Most rows (blocks plus empty rows) the solution may have. */
    maxRows: number;
};

export function trimEmptyRows(a: Arrangement): Arrangement {
    let numRows = a.order.length;
    while (numRows > 0 && a.order[numRows - 1] === 0) {
        numRows--;
    }
    return {
        order: a.order.slice(0, numRows),
        indents: a.indents.slice(0, numRows),
    };
}

export function removeRow(a: Arrangement, row: number): Arrangement {
    return {
        order: a.order.filter((_, i) => i !== row),
        indents: a.indents.filter((_, i) => i !== row),
    };
}

function clampIndent(indent: number, options: ParsonsOptions) {
    if (!options.indentationGraded) {
        return 0;
    }
    return Math.min(Math.max(indent, 0), options.maxIndent);
}

/**
 * Remove `blockIdx` from the solution (if present), then put it at row
 * `position` of what remains: in place of the empty row there
 * (`replaceEmptyRow`), or inserted after `emptyRowsBefore` new empty rows.
 */
export function placeInSolution(
    a: Arrangement,
    blockIdx: number,
    position: number,
    indent: number,
    options: ParsonsOptions,
    { replaceEmptyRow = false, emptyRowsBefore = 0 } = {},
): Arrangement {
    const oldPos = a.order.indexOf(blockIdx);
    const rest =
        oldPos === -1
            ? { order: [...a.order], indents: [...a.indents] }
            : removeRow(a, oldPos);
    const emptyRows = Array(emptyRowsBefore).fill(0);
    const numReplaced = replaceEmptyRow ? 1 : 0;
    rest.order.splice(position, numReplaced, ...emptyRows, blockIdx);
    rest.indents.splice(
        position,
        numReplaced,
        ...emptyRows,
        clampIndent(indent, options),
    );
    return trimEmptyRows(rest);
}

export function removeFromSolution(
    a: Arrangement,
    blockIdx: number,
): Arrangement {
    return trimEmptyRows(removeRow(a, a.order.indexOf(blockIdx)));
}

/** The item after `item` in `list`, else the one before it, else undefined. */
function neighbor(list: number[], item: number) {
    const i = list.indexOf(item);
    return list[i + 1] ?? list[i - 1];
}

export type KeyResult = {
    /** The key was one of ours, so the browser's default must be prevented. */
    handled: boolean;
    /** The new arrangement, if the key changed it. */
    arrangement?: Arrangement;
    /** The block to move focus to, if any. */
    focus?: number;
    /** What happened to the block, for the screen reader announcement. */
    move?: "toSolution" | "toSource" | "reorder" | "indent";
};

/**
 * What pressing `key` on block `blockIdx` does.
 *
 * - Enter / Space: move the block to the other list. Focus stays in the list
 *   it came from (on the next block there), so several blocks can be moved in
 *   a row.
 * - Up / Down (and Left / Right in a horizontal layout): in the solution, swap
 *   with the neighbouring row; moving the last block down leaves an empty row
 *   above it. In the source list, move focus.
 * - Left / Right: change the indent, when indentation is graded.
 */
export function arrangementAfterKey({
    key,
    blockIdx,
    arrangement,
    initialOrder,
    options,
}: {
    key: string;
    blockIdx: number;
    arrangement: Arrangement;
    /** Block indices in the order the source list shows them. */
    initialOrder: number[];
    options: ParsonsOptions;
}): KeyResult {
    const { order, indents } = arrangement;
    const pos = order.indexOf(blockIdx);
    const inSolution = pos !== -1;
    const sourceOrder = initialOrder.filter((i) => !order.includes(i));
    const upDown = key === "ArrowUp" || key === "ArrowDown";
    const leftRight = key === "ArrowLeft" || key === "ArrowRight";

    if (key === "Enter" || key === " ") {
        if (inSolution) {
            const placed = order.filter((i) => i !== 0);
            return {
                handled: true,
                arrangement: removeFromSolution(arrangement, blockIdx),
                focus: neighbor(placed, blockIdx) ?? blockIdx,
                move: "toSource",
            };
        }
        return {
            handled: true,
            arrangement: placeInSolution(
                arrangement,
                blockIdx,
                order.length,
                0,
                options,
            ),
            focus: neighbor(sourceOrder, blockIdx) ?? blockIdx,
            move: "toSolution",
        };
    }

    if (upDown || (leftRight && options.horizontal)) {
        const step = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
        if (!inSolution) {
            return {
                handled: true,
                focus: sourceOrder[sourceOrder.indexOf(blockIdx) + step],
            };
        }
        const newPos = pos + step;
        let newArrangement: Arrangement | undefined;
        if (newPos >= 0 && newPos < order.length) {
            newArrangement = placeInSolution(
                arrangement,
                blockIdx,
                newPos,
                indents[pos],
                options,
            );
        } else if (
            newPos === order.length &&
            !options.horizontal &&
            order.length < options.maxRows
        ) {
            newArrangement = placeInSolution(
                arrangement,
                blockIdx,
                pos,
                indents[pos],
                options,
                { emptyRowsBefore: 1 },
            );
        }
        return newArrangement
            ? {
                  handled: true,
                  arrangement: newArrangement,
                  focus: blockIdx,
                  move: "reorder",
              }
            : { handled: true };
    }

    if (leftRight && inSolution && options.indentationGraded) {
        const newIndent = clampIndent(
            indents[pos] + (key === "ArrowLeft" ? -1 : 1),
            options,
        );
        if (newIndent === indents[pos]) {
            return { handled: true };
        }
        return {
            handled: true,
            arrangement: placeInSolution(
                arrangement,
                blockIdx,
                pos,
                newIndent,
                options,
            ),
            focus: blockIdx,
            move: "indent",
        };
    }

    return { handled: false };
}
