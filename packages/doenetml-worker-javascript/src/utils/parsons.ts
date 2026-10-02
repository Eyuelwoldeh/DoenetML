export type ParsonsBlock = {
    indent: number;
    distractor: boolean;
    /** Id of the enclosing `<anyOrder>`, or `null` if not in one. */
    group: number | null;
};

/**
 * Whether a student's arrangement solves a Parsons problem.
 *
 * `order` holds 1-based block indices (into `blocks`) from top to bottom of the
 * solution column; `indents` holds the student's indent for each entry.
 *
 * Correct means: exactly the non-distractor blocks, each once, in authored
 * order, where the blocks of each `<anyOrder>` group must be contiguous but may
 * appear in any order among themselves; indents must match when graded.
 */
export function isParsonsSolutionCorrect({
    blocks,
    order,
    indents,
    indentationGraded,
}: {
    blocks: ParsonsBlock[];
    order: number[];
    indents: number[];
    indentationGraded: boolean;
}): boolean {
    // Expected segments: each anyOrder group is one segment, other blocks are singletons.
    const segments: number[][] = [];
    blocks.forEach((block, i) => {
        if (block.distractor) {
            return;
        }
        const last = segments[segments.length - 1];
        const lastGroup = last ? blocks[last[0] - 1].group : null;
        if (block.group !== null && block.group === lastGroup) {
            last.push(i + 1);
        } else {
            segments.push([i + 1]);
        }
    });

    const numExpected = segments.reduce((n, s) => n + s.length, 0);
    // A problem with no solution blocks is an authoring error, not a problem
    // that an empty arrangement solves.
    if (
        numExpected === 0 ||
        order.length !== numExpected ||
        indents.length !== order.length
    ) {
        return false;
    }

    let pos = 0;
    for (const segment of segments) {
        const slice = order.slice(pos, pos + segment.length);
        if (!segment.every((ind) => slice.includes(ind))) {
            return false;
        }
        pos += segment.length;
    }

    return (
        !indentationGraded ||
        order.every((ind, i) => indents[i] === blocks[ind - 1].indent)
    );
}
