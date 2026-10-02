import { describe, expect, it, vi } from "vitest";
import { createTestCore } from "../utils/test-core";
import { submitAnswer } from "../utils/actions";
import { isParsonsSolutionCorrect, ParsonsBlock } from "../../utils/parsons";
import { PublicDoenetMLCore } from "../../CoreWorker";
import { getDiagnosticsByType } from "../utils/diagnostics";

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
    it("is never correct when no block belongs in the solution", () => {
        expect(
            isParsonsSolutionCorrect({
                blocks: [{ indent: 0, distractor: true, group: null }],
                order: [],
                indents: [],
                indentationGraded: false,
            }),
        ).eq(false);
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

    it("math and code blocks", async () => {
        const { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
<parsons name="p" shuffle="false">
  <block><m>\frac{x^2 \cdot x^3}{x^4}</m></block>
  <block><m>\frac{x^5}{x^4}</m></block>
  <block><m>x</m></block>
  <block distractor><c>x = x ** 6</c></block>
</parsons>`,
        });
        const idx = await resolvePathToNodeIdx("p");
        await updateArrangement({
            core,
            componentIdx: idx,
            order: [1, 2, 3],
            indents: [0, 0, 0],
        });
        const sv = (await core.returnAllStateVariables(false, true))[idx]
            .stateValues;
        expect(sv.numBlocks).eq(4);
        expect(sv.correct).eq(true);
        expect(getDiagnosticsByType(core).errors.length).eq(0);
        expect(getDiagnosticsByType(core).warnings.length).eq(0);
    });

    it("length state variables drive feedback on submit", async () => {
        const { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML:
                selectionSortDoenetML +
                `
<feedback name="short" condition="$sel.solutionTooShort" updateWith="$ans">Too short</feedback>
<feedback name="long" condition="$sel.solutionTooLong" updateWith="$ans">Too long</feedback>`,
        });
        const selIdx = await resolvePathToNodeIdx("sel");
        const ansIdx = await resolvePathToNodeIdx("ans");
        const shortIdx = await resolvePathToNodeIdx("short");
        const longIdx = await resolvePathToNodeIdx("long");

        async function hidden(idx: number) {
            return (await core.returnAllStateVariables(false, true))[idx]
                .stateValues.hidden;
        }

        let sv = (await core.returnAllStateVariables(false, true))[selIdx]
            .stateValues;
        expect(sv.numBlocksNeeded).eq(6);
        expect(sv.numBlocksInSolution).eq(0);
        expect(sv.solutionTooShort).eq(true);
        expect(sv.solutionTooLong).eq(false);
        // feedback waits for a submission
        expect(await hidden(shortIdx)).eq(true);

        await updateArrangement({
            core,
            componentIdx: selIdx,
            order: [1, 2],
            indents: [0, 0],
        });
        expect(await hidden(shortIdx)).eq(true);
        await submitAnswer({ componentIdx: ansIdx, core });
        expect(await hidden(shortIdx)).eq(false);
        expect(await hidden(longIdx)).eq(true);

        await updateArrangement({
            core,
            componentIdx: selIdx,
            order: [1, 2, 3, 4, 5, 6, 7],
            indents: [0, 0, 1, 1, 1, 0, 0],
        });
        sv = (await core.returnAllStateVariables(false, true))[selIdx]
            .stateValues;
        expect(sv.numBlocksInSolution).eq(7);
        expect(sv.solutionTooShort).eq(false);
        expect(sv.solutionTooLong).eq(true);
        await submitAnswer({ componentIdx: ansIdx, core });
        expect(await hidden(shortIdx)).eq(true);
        expect(await hidden(longIdx)).eq(false);
    });

    it("horizontal layout ignores indentation", async () => {
        const { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
<parsons name="h" layout="horizontal" horizontalAlign="CENTER">
  <block>a</block>
  <block indent="1">b</block>
</parsons>
<parsons name="v"><block>a</block></parsons>`,
        });
        const idx = await resolvePathToNodeIdx("h");
        await updateArrangement({
            core,
            componentIdx: idx,
            order: [1, 2],
            indents: [0, 0],
        });
        const all = await core.returnAllStateVariables(false, true);
        const sv = all[idx].stateValues;
        expect(sv.layout).eq("horizontal");
        expect(sv.horizontalAlign).eq("center");
        expect(sv.indentationGraded).eq(false);
        expect(sv.correct).eq(true);
        const v = all[await resolvePathToNodeIdx("v")].stateValues;
        expect(v.layout).eq("vertical");
        expect(v.horizontalAlign).eq("left");

        const warnings = getDiagnosticsByType(core).warnings;
        expect(warnings.length).eq(1);
        expect(warnings[0].message).contain("Indentation is not used");
    });

    it("authoring diagnostics", async () => {
        async function warningsFor(doenetML: string) {
            const { core } = await createTestCore({ doenetML });
            await core.returnAllStateVariables(false, true);
            return getDiagnosticsByType(core).warnings.map((w) => w.message);
        }

        let warnings = await warningsFor(
            `<parsons><block distractor>a</block></parsons>`,
        );
        expect(warnings.length).eq(1);
        expect(warnings[0]).contain(
            "no `<block>` that belongs in the solution",
        );

        warnings = await warningsFor(
            `<parsons><block>a</block><anyOrder><block>b</block><block distractor>c</block></anyOrder></parsons>`,
        );
        expect(warnings.length).eq(1);
        expect(warnings[0]).contain("distractor `<block>` inside `<anyOrder>`");

        warnings = await warningsFor(
            `<parsons maxIndent="1"><block indent="0">a</block><block indent="3">b</block></parsons>`,
        );
        expect(warnings.length).eq(1);
        expect(warnings[0]).contain("indent 3");

        warnings = await warningsFor(
            `<parsons><block>a</block><anyOrder><block>b</block><anyOrder><block>c</block><block>d</block></anyOrder></anyOrder></parsons>`,
        );
        expect(warnings.length).eq(1);
        expect(warnings[0]).contain("cannot be nested");

        warnings = await warningsFor(`<p><block>a</block></p>`);
        expect(warnings.length).eq(1);
        expect(warnings[0]).contain("must be a child of `<parsons>`");

        warnings = await warningsFor(
            `<parsons layout="horizontal"><block>short</block><block>${"x".repeat(60)}</block></parsons>`,
        );
        expect(warnings.length).eq(1);
        expect(warnings[0]).contain("60 characters");

        // a well-formed problem is silent
        warnings = await warningsFor(selectionSortDoenetML);
        expect(warnings.length).eq(0);
    });

    it("blank rows are kept but ignored by grading", async () => {
        const { core, resolvePathToNodeIdx, scoreState } = await createTestCore(
            { doenetML: selectionSortDoenetML },
        );
        const selIdx = await resolvePathToNodeIdx("sel");

        // 0 is an empty row; trailing empty rows are trimmed
        await updateArrangement({
            core,
            componentIdx: selIdx,
            order: [0, 1, 2, 0, 0, 3, 5, 4, 0, 6, 0, 0],
            indents: [0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
        });
        let sv = (await core.returnAllStateVariables(false, true))[selIdx]
            .stateValues;
        expect(sv.allSolutionOrder).eqls([0, 1, 2, 0, 0, 3, 5, 4, 0, 6]);
        expect(sv.allSolutionIndents).eqls([0, 0, 0, 0, 0, 1, 1, 1, 0, 0]);
        expect(sv.solutionOrder).eqls([1, 2, 3, 5, 4, 6]);
        expect(sv.solutionIndents).eqls([0, 0, 1, 1, 1, 0]);
        expect(sv.numBlocksInSolution).eq(6);
        expect(sv.correct).eq(true);

        // empty rows survive a save and reload
        await core.saveImmediately();
        const restored = await createTestCore({
            doenetML: selectionSortDoenetML,
            initialState: scoreState.state,
        });
        sv = (await restored.core.returnAllStateVariables(false, true))[
            await restored.resolvePathToNodeIdx("sel")
        ].stateValues;
        expect(sv.allSolutionOrder).eqls([0, 1, 2, 0, 0, 3, 5, 4, 0, 6]);
        expect(sv.correct).eq(true);

        // an absurd number of rows is rejected
        await updateArrangement({
            core,
            componentIdx: selIdx,
            order: [...Array(100).fill(0), 1],
            indents: Array(101).fill(0),
        });
        sv = (await core.returnAllStateVariables(false, true))[selIdx]
            .stateValues;
        expect(sv.allSolutionOrder).eqls([0, 1, 2, 0, 0, 3, 5, 4, 0, 6]);
    });
});
