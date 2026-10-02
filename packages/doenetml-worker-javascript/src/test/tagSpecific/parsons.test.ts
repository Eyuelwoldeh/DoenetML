import { describe, expect, it, vi } from "vitest";
import { createTestCore } from "../utils/test-core";
import { submitAnswer } from "../utils/actions";
import { isParsonsSolutionCorrect, ParsonsBlock } from "../../utils/parsons";
import { PublicDoenetMLCore } from "../../CoreWorker";

const Mock = vi.fn();
vi.stubGlobal("postMessage", Mock);
vi.mock("hyperformula");

// Selection sort: blocks 4 and 5 are an anyOrder group; 7 and 8 are distractors.
const selectionSortBlocks: ParsonsBlock[] = [
    { indent: 0, distractor: false, group: null },
    { indent: 0, distractor: false, group: null },
    { indent: 1, distractor: false, group: null },
    { indent: 1, distractor: false, group: 99 },
    { indent: 1, distractor: false, group: 99 },
    { indent: 0, distractor: false, group: null },
    { indent: 0, distractor: true, group: null },
    { indent: 0, distractor: true, group: null },
];

function check(order: number[], indents: number[], indentationGraded = true) {
    return isParsonsSolutionCorrect({
        blocks: selectionSortBlocks,
        order,
        indents,
        indentationGraded,
    });
}

describe("isParsonsSolutionCorrect @group4", () => {
    it("accepts the authored order", () => {
        expect(check([1, 2, 3, 4, 5, 6], [0, 0, 1, 1, 1, 0])).eq(true);
    });
    it("accepts anyOrder blocks swapped", () => {
        expect(check([1, 2, 3, 5, 4, 6], [0, 0, 1, 1, 1, 0])).eq(true);
    });
    it("rejects a missing block", () => {
        expect(check([1, 2, 3, 4, 5], [0, 0, 1, 1, 1])).eq(false);
    });
    it("rejects an included distractor", () => {
        expect(check([1, 2, 3, 4, 5, 7, 6], [0, 0, 1, 1, 1, 0, 0])).eq(false);
    });
    it("rejects wrong order across segments", () => {
        expect(check([2, 1, 3, 4, 5, 6], [0, 0, 1, 1, 1, 0])).eq(false);
    });
    it("rejects an anyOrder group split by another block", () => {
        expect(check([1, 2, 4, 3, 5, 6], [0, 0, 1, 1, 1, 0])).eq(false);
    });
    it("rejects wrong indentation", () => {
        expect(check([1, 2, 3, 4, 5, 6], [0, 0, 0, 1, 1, 0])).eq(false);
    });
    it("ignores indentation when not graded", () => {
        expect(check([1, 2, 3, 4, 5, 6], [0, 0, 0, 0, 0, 0], false)).eq(true);
    });
    it("rejects duplicates and out-of-range indices", () => {
        expect(check([1, 1, 3, 4, 5, 6], [0, 0, 1, 1, 1, 0])).eq(false);
        expect(check([1, 2, 3, 4, 5, 9], [0, 0, 1, 1, 1, 0])).eq(false);
    });
});

const selectionSortDoenetML = `
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
  <block distractor>min_index gets the index of minimum value at or after i</block>
</parsons>
<answer name="ans"><award><when>$sel.correct</when></award></answer>
`;

async function updateArrangement({
    core,
    componentIdx,
    order,
    indents,
}: {
    core: PublicDoenetMLCore;
    componentIdx: number;
    order: number[];
    indents: number[];
}) {
    await core.requestAction({
        componentIdx,
        actionName: "updateArrangement",
        args: { order, indents },
    });
}

describe("Parsons tag tests @group4", async () => {
    it("tracks arrangement, correctness, and answer credit", async () => {
        const { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: selectionSortDoenetML,
        });
        const selIdx = await resolvePathToNodeIdx("sel");
        const ansIdx = await resolvePathToNodeIdx("ans");

        let sv = (await core.returnAllStateVariables(false, true))[selIdx]
            .stateValues;
        expect(sv.numBlocks).eq(8);
        expect(sv.indentationGraded).eq(true);
        expect(sv.solutionOrder).eqls([]);
        expect(sv.correct).eq(false);
        expect([...sv.initialOrder].sort((a, b) => a - b)).eqls([
            1, 2, 3, 4, 5, 6, 7, 8,
        ]);
        expect(sv.blocks[3].group).not.eq(null);
        expect(sv.blocks[3].group).eq(sv.blocks[4].group);
        expect(sv.blocks[2].group).eq(null);

        // correct, with the anyOrder pair swapped
        await updateArrangement({
            core,
            componentIdx: selIdx,
            order: [1, 2, 3, 5, 4, 6],
            indents: [0, 0, 1, 1, 1, 0],
        });
        sv = (await core.returnAllStateVariables(false, true))[selIdx]
            .stateValues;
        expect(sv.solutionOrder).eqls([1, 2, 3, 5, 4, 6]);
        expect(sv.solutionIndents).eqls([0, 0, 1, 1, 1, 0]);
        expect(sv.correct).eq(true);

        await submitAnswer({ componentIdx: ansIdx, core });
        let ans = (await core.returnAllStateVariables(false, true))[ansIdx]
            .stateValues;
        expect(ans.creditAchieved).eq(1);

        // wrong indentation
        await updateArrangement({
            core,
            componentIdx: selIdx,
            order: [1, 2, 3, 5, 4, 6],
            indents: [0, 0, 0, 1, 1, 0],
        });
        sv = (await core.returnAllStateVariables(false, true))[selIdx]
            .stateValues;
        expect(sv.correct).eq(false);

        await submitAnswer({ componentIdx: ansIdx, core });
        ans = (await core.returnAllStateVariables(false, true))[ansIdx]
            .stateValues;
        expect(ans.creditAchieved).eq(0);
    });

    it("ignores invalid arrangements", async () => {
        const { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: selectionSortDoenetML,
        });
        const selIdx = await resolvePathToNodeIdx("sel");

        await updateArrangement({
            core,
            componentIdx: selIdx,
            order: [1, 2],
            indents: [0, 0],
        });
        for (const [order, indents] of [
            [
                [1, 1],
                [0, 0],
            ], // duplicate
            [
                [1, 9],
                [0, 0],
            ], // out of range
            [[1, 2], [0]], // length mismatch
        ]) {
            await updateArrangement({
                core,
                componentIdx: selIdx,
                order,
                indents,
            });
        }
        const sv = (await core.returnAllStateVariables(false, true))[selIdx]
            .stateValues;
        expect(sv.solutionOrder).eqls([1, 2]);
        expect(sv.solutionIndents).eqls([0, 0]);
    });

    it("clamps indents to maxIndent", async () => {
        const { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: selectionSortDoenetML,
        });
        const selIdx = await resolvePathToNodeIdx("sel");

        await updateArrangement({
            core,
            componentIdx: selIdx,
            order: [1],
            indents: [10],
        });
        const sv = (await core.returnAllStateVariables(false, true))[selIdx]
            .stateValues;
        expect(sv.maxIndent).eq(2);
        expect(sv.solutionIndents).eqls([2]);
    });

    it("order only when no indent specified", async () => {
        const { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
<parsons name="tea" shuffle="false">
  <block>Boil water</block>
  <block>Put tea bag in cup</block>
  <block>Pour water</block>
  <block distractor>Freeze cup</block>
</parsons>`,
        });
        const idx = await resolvePathToNodeIdx("tea");

        let sv = (await core.returnAllStateVariables(false, true))[idx]
            .stateValues;
        expect(sv.indentationGraded).eq(false);
        expect(sv.initialOrder).eqls([1, 2, 3, 4]);

        await updateArrangement({
            core,
            componentIdx: idx,
            order: [1, 2, 3],
            indents: [0, 1, 0],
        });
        sv = (await core.returnAllStateVariables(false, true))[idx].stateValues;
        expect(sv.correct).eq(true);
    });

    it("shuffle is deterministic for a variant", async () => {
        // A <selectFromSequence> gives the document multiple variants.
        const doenetML =
            `<selectFromSequence from="1" to="100" />` + selectionSortDoenetML;
        const orders = [];
        for (const requestedVariantIndex of [3, 3, 4]) {
            const { core, resolvePathToNodeIdx } = await createTestCore({
                doenetML,
                requestedVariantIndex,
            });
            orders.push(
                (await core.returnAllStateVariables(false, true))[
                    await resolvePathToNodeIdx("sel")
                ].stateValues.initialOrder,
            );
        }
        expect(orders[0]).eqls(orders[1]);
        expect(orders[0]).not.eqls(orders[2]);
    });

    it("restores arrangement from saved state", async () => {
        const { core, resolvePathToNodeIdx, scoreState } = await createTestCore(
            { doenetML: selectionSortDoenetML },
        );
        const selIdx = await resolvePathToNodeIdx("sel");
        await updateArrangement({
            core,
            componentIdx: selIdx,
            order: [2, 1],
            indents: [0, 1],
        });
        await core.saveImmediately();

        const restored = await createTestCore({
            doenetML: selectionSortDoenetML,
            initialState: scoreState.state,
        });
        const sv = (await restored.core.returnAllStateVariables(false, true))[
            await restored.resolvePathToNodeIdx("sel")
        ].stateValues;
        expect(sv.solutionOrder).eqls([2, 1]);
        expect(sv.solutionIndents).eqls([0, 1]);
    });
});
