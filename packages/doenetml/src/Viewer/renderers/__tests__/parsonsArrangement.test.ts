import { describe, expect, it } from "vitest";
import {
    arrangementAfterKey,
    placeInSolution,
    ParsonsOptions,
} from "../utils/parsonsArrangement";

const vertical: ParsonsOptions = {
    horizontal: false,
    indentationGraded: true,
    maxIndent: 2,
    maxRows: 12,
};
const horizontal: ParsonsOptions = { ...vertical, horizontal: true };

// Four blocks, shown in the source list in the order 3, 1, 4, 2.
const initialOrder = [3, 1, 4, 2];

function press(
    key: string,
    blockIdx: number,
    order: number[],
    indents: number[] = order.map(() => 0),
    options = vertical,
) {
    return arrangementAfterKey({
        key,
        blockIdx,
        arrangement: { order, indents },
        initialOrder,
        options,
    });
}

describe("parsons keyboard: moving between the lists", () => {
    it("Enter sends a source block to the end of the solution and keeps focus in the source list", () => {
        const result = press("Enter", 1, []);
        expect(result.arrangement).eqls({ order: [1], indents: [0] });
        // 4 follows 1 in the source list, so the student can go straight on
        expect(result.focus).eq(4);
        expect(result.move).eq("toSolution");
        expect(result.handled).eq(true);
    });

    it("Space does the same as Enter", () => {
        expect(press(" ", 1, []).arrangement).eqls({
            order: [1],
            indents: [0],
        });
    });

    it("every block can be added one after another with Enter alone", () => {
        let order: number[] = [];
        let focus = initialOrder[0];
        for (let i = 0; i < initialOrder.length; i++) {
            const result = press("Enter", focus, order);
            order = result.arrangement!.order;
            focus = result.focus!;
        }
        expect(order).eqls([3, 1, 4, 2]);
    });

    it("focus falls back to the previous source block, then to the moved block", () => {
        // 2 is last in the source list, so focus goes back to 4
        expect(press("Enter", 2, []).focus).eq(4);
        // 2 is the only block left in the source list: follow it
        expect(press("Enter", 2, [3, 1, 4]).focus).eq(2);
    });

    it("Enter sends a solution block back and keeps focus in the solution", () => {
        const result = press("Enter", 1, [3, 1, 4]);
        expect(result.arrangement).eqls({ order: [3, 4], indents: [0, 0] });
        expect(result.focus).eq(4);
        expect(result.move).eq("toSource");
    });

    it("focus skips empty rows when a solution block is sent back", () => {
        const result = press("Enter", 1, [3, 0, 1, 0, 4]);
        expect(result.arrangement!.order).eqls([3, 0, 0, 4]);
        expect(result.focus).eq(4);
        // the last block sent back: focus the block before it
        expect(press("Enter", 4, [3, 0, 4]).focus).eq(3);
        // the only block sent back: follow it to the source list
        expect(press("Enter", 4, [4]).focus).eq(4);
    });
});

describe("parsons keyboard: within a list", () => {
    it("Up and Down move focus through the source list without changing anything", () => {
        const down = press("ArrowDown", 1, []);
        expect(down.arrangement).eq(undefined);
        expect(down.focus).eq(4);
        expect(down.handled).eq(true);
        expect(press("ArrowUp", 1, []).focus).eq(3);
        // at the ends there is nowhere to go, but the page must not scroll
        expect(press("ArrowUp", 3, []).focus).eq(undefined);
        expect(press("ArrowUp", 3, []).handled).eq(true);
        // blocks already in the solution are skipped
        expect(press("ArrowDown", 3, [1]).focus).eq(4);
    });

    it("Up and Down reorder a solution block, keeping its indent", () => {
        const result = press("ArrowUp", 4, [3, 1, 4], [0, 0, 2]);
        expect(result.arrangement).eqls({
            order: [3, 4, 1],
            indents: [0, 2, 0],
        });
        expect(result.focus).eq(4);
        expect(result.move).eq("reorder");
        expect(press("ArrowUp", 3, [3, 1]).arrangement).eq(undefined);
    });

    it("Down on the last block leaves an empty row above it", () => {
        expect(press("ArrowDown", 4, [3, 4]).arrangement!.order).eqls([
            3, 0, 4,
        ]);
        // and Up takes the empty row back out
        expect(press("ArrowUp", 4, [3, 0, 4]).arrangement!.order).eqls([3, 4]);
    });

    it("no empty rows are added past the row limit or in a horizontal layout", () => {
        expect(
            press("ArrowDown", 4, [3, 4], [0, 0], { ...vertical, maxRows: 2 })
                .arrangement,
        ).eq(undefined);
        expect(
            press("ArrowDown", 4, [3, 4], [0, 0], horizontal).arrangement,
        ).eq(undefined);
    });

    it("Left and Right change the indent, within its limits", () => {
        const result = press("ArrowRight", 1, [3, 1], [0, 1]);
        expect(result.arrangement!.indents).eqls([0, 2]);
        expect(result.move).eq("indent");
        expect(press("ArrowRight", 1, [3, 1], [0, 2]).arrangement).eq(
            undefined,
        );
        expect(press("ArrowLeft", 1, [3, 1], [0, 0]).arrangement).eq(undefined);
        // not graded: Left/Right are left to the browser
        const notGraded = { ...vertical, indentationGraded: false };
        expect(press("ArrowRight", 1, [3, 1], [0, 0], notGraded).handled).eq(
            false,
        );
    });

    it("in a horizontal layout Left and Right reorder", () => {
        const result = press("ArrowLeft", 1, [3, 1], [0, 0], horizontal);
        expect(result.arrangement!.order).eqls([1, 3]);
        expect(result.move).eq("reorder");
    });

    it("other keys are not handled, so Tab still leaves the widget", () => {
        expect(press("Tab", 1, []).handled).eq(false);
        expect(press("a", 1, [1]).handled).eq(false);
    });
});

describe("placeInSolution", () => {
    const arrangement = { order: [3, 0, 1], indents: [0, 0, 1] };

    it("takes over an empty row", () => {
        expect(
            placeInSolution(arrangement, 4, 1, 0, vertical, {
                replaceEmptyRow: true,
            }),
        ).eqls({ order: [3, 4, 1], indents: [0, 0, 1] });
    });

    it("leaves empty rows above a block dropped far down", () => {
        expect(
            placeInSolution(arrangement, 4, 3, 5, vertical, {
                emptyRowsBefore: 2,
            }),
        ).eqls({ order: [3, 0, 1, 0, 0, 4], indents: [0, 0, 1, 0, 0, 2] });
    });

    it("moves a block already in the solution and drops trailing empty rows", () => {
        expect(placeInSolution(arrangement, 1, 0, 0, vertical)).eqls({
            order: [1, 3],
            indents: [0, 0],
        });
    });

    it("ignores indent when indentation is not graded", () => {
        expect(
            placeInSolution({ order: [], indents: [] }, 1, 0, 2, {
                ...vertical,
                indentationGraded: false,
            }),
        ).eqls({ order: [1], indents: [0] });
    });
});
