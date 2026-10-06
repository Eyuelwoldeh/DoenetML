import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import useDoenetRenderer, {
    UseDoenetRendererProps,
} from "../useDoenetRenderer";
import { Button } from "@doenet/ui-components";
import {
    calculateValidationState,
    createCheckWorkComponent,
} from "./utils/checkWork";
import { useSubmitActionWithDelay } from "./utils/useSubmitActionWithDelay";
import { useContentT, useT } from "../../utils/i18n";
import {
    Arrangement,
    ParsonsOptions,
    arrangementAfterKey,
    placeInSolution,
    removeFromSolution,
    removeRow,
    trimEmptyRows,
} from "./utils/parsonsArrangement";
import "./parsons.css";

const INDENT_PX = 32;
const DRAG_THRESHOLD_PX = 4;
const COLUMN_PADDING_PX = 8;
// Height of an empty row in the solution (matches `.parsons-blank` plus the
// gap between rows), used to turn a drop below the last block into empty rows.
const BLANK_ROW_PX = 42;
// Mirrors the worker's limit on rows (blocks plus empty rows) per block.
const MAX_ROWS_PER_BLOCK = 3;

interface ParsonsSVs {
    [key: string]: any;
    hidden: boolean;
    disabled: boolean;
    label: string;
    blocks: { text: string }[];
    initialOrder: number[];
    allSolutionOrder: number[];
    allSolutionIndents: number[];
    indentationGraded: boolean;
    maxIndent: number;
    layout: "vertical" | "horizontal";
    horizontalAlign: "left" | "center" | "right";
    justSubmitted: boolean;
    forceFullCheckWorkButton: boolean;
}

type DragInfo = {
    blockIdx: number;
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    moved: boolean;
};

type Size = { width: number; height: number };

export default React.memo(function Parsons(props: UseDoenetRendererProps) {
    const { id, SVs, children, actions, callAction } =
        useDoenetRenderer<ParsonsSVs>(props);

    // The widget's own words are addressed to whoever is looking at the
    // screen, so they take `useT`; the check-work button follows the document.
    const t = useT();
    const tContent = useContentT();

    // Local (optimistic) arrangement; replaced whenever core reports a new one.
    const [arrangement, setArrangement] = useState<Arrangement>({
        order: SVs.allSolutionOrder,
        indents: SVs.allSolutionIndents,
    });
    useEffect(() => {
        setArrangement({
            order: SVs.allSolutionOrder,
            indents: SVs.allSolutionIndents,
        });
    }, [SVs.allSolutionOrder, SVs.allSolutionIndents]);

    const [dragOffset, setDragOffset] = useState<{
        blockIdx: number;
        dx: number;
        dy: number;
    } | null>(null);
    const [announcement, setAnnouncement] = useState("");

    // Last measured size of each block, so the gap a block leaves behind in
    // the source list keeps the block's size.
    const [sizes, setSizes] = useState<Record<number, Size>>({});

    const dragInfo = useRef<DragInfo | null>(null);
    const blockElements = useRef<Record<number, HTMLLIElement | null>>({});
    const sourceColumn = useRef<HTMLUListElement>(null);
    const solutionColumn = useRef<HTMLUListElement>(null);
    const pendingFocus = useRef<number | null>(null);

    useEffect(() => {
        if (pendingFocus.current !== null) {
            blockElements.current[pendingFocus.current]?.focus();
            pendingFocus.current = null;
        }
    });

    useLayoutEffect(() => {
        if (dragOffset) {
            return;
        }
        let changed = false;
        const newSizes = { ...sizes };
        for (const [key, el] of Object.entries(blockElements.current)) {
            const old = sizes[Number(key)];
            // Keep the size a block had in the source list: once placed (and
            // perhaps indented, so wrapped differently) it is not remeasured.
            if (!el || (old && arrangement.order.includes(Number(key)))) {
                continue;
            }
            const size = { width: el.offsetWidth, height: el.offsetHeight };
            if (
                !old ||
                old.width !== size.width ||
                old.height !== size.height
            ) {
                newSizes[Number(key)] = size;
                changed = true;
            }
        }
        if (changed) {
            setSizes(newSizes);
        }
    });

    const validationState = calculateValidationState(SVs);
    const { isPending, submitActionWithPending } = useSubmitActionWithDelay({
        actionKey: "submitAnswer",
        actions,
        callAction,
        validationState,
        justSubmitted: SVs.justSubmitted,
    });

    if (SVs.hidden) {
        return null;
    }

    const disabled = SVs.disabled;
    const horizontal = SVs.layout === "horizontal";
    const { order, indents } = arrangement;
    const maxRows = MAX_ROWS_PER_BLOCK * SVs.blocks.length;
    const options: ParsonsOptions = {
        horizontal,
        indentationGraded: SVs.indentationGraded,
        maxIndent: SVs.maxIndent,
        maxRows,
    };

    // `children` has a null placeholder for each unrendered child (e.g.
    // <shortDescription>), so drop those: what remains is the blocks in
    // order, then any <description>.
    const renderedChildren = children.filter((child) => child !== null);
    const numBlocks = SVs.blocks.length;
    const description = renderedChildren.slice(numBlocks);

    function blockText(blockIdx: number) {
        return SVs.blocks[blockIdx - 1]?.text ?? `${blockIdx}`;
    }

    function commit(newArrangement: Arrangement, message: string) {
        setArrangement(newArrangement);
        setAnnouncement(message);
        callAction({
            action: actions.updateArrangement,
            args: {
                order: newArrangement.order,
                indents: newArrangement.indents,
            },
        });
    }

    function removeEmptyRow(row: number) {
        if (disabled) {
            return;
        }
        commit(
            trimEmptyRows(removeRow(arrangement, row)),
            t("parsons-empty-row-removed", undefined, "Empty row removed"),
        );
    }

    function movedToSolutionMessage(
        blockIdx: number,
        position: number,
        indent: number,
    ) {
        const block = blockText(blockIdx);
        return SVs.indentationGraded
            ? t(
                  "parsons-moved-to-solution-indent",
                  { block, position: position + 1, indent },
                  `Moved ${block} to solution position ${position + 1}, indent ${indent}`,
              )
            : t(
                  "parsons-moved-to-solution",
                  { block, position: position + 1 },
                  `Moved ${block} to solution position ${position + 1}`,
              );
    }

    function movedToSourceMessage(blockIdx: number) {
        const block = blockText(blockIdx);
        return t(
            "parsons-moved-to-source",
            { block },
            `Moved ${block} back to the unused blocks`,
        );
    }

    function reset() {
        commit(
            { order: [], indents: [] },
            t(
                "parsons-reset-done",
                undefined,
                "All blocks returned to the unused blocks",
            ),
        );
    }

    // ── Pointer dragging ────────────────────────────────────────────────

    function onPointerDown(
        e: React.PointerEvent<HTMLLIElement>,
        blockIdx: number,
    ) {
        if (disabled || e.button !== 0) {
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        dragInfo.current = {
            blockIdx,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: e.currentTarget.getBoundingClientRect().left,
            moved: false,
        };
    }

    function onPointerMove(e: React.PointerEvent<HTMLLIElement>) {
        const info = dragInfo.current;
        if (!info || info.pointerId !== e.pointerId) {
            return;
        }
        const dx = e.clientX - info.startX;
        const dy = e.clientY - info.startY;
        if (!info.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
            return;
        }
        info.moved = true;
        setDragOffset({ blockIdx: info.blockIdx, dx, dy });
    }

    function onPointerUp(e: React.PointerEvent<HTMLLIElement>) {
        const info = dragInfo.current;
        dragInfo.current = null;
        setDragOffset(null);
        if (!info || !info.moved || info.pointerId !== e.pointerId) {
            return;
        }

        const { clientX: x, clientY: y } = e;
        const contains = (el: HTMLElement | null) => {
            const r = el?.getBoundingClientRect();
            return (
                r !== undefined &&
                x >= r.left &&
                x <= r.right &&
                y >= r.top &&
                y <= r.bottom
            );
        };

        const blockIdx = info.blockIdx;
        if (contains(solutionColumn.current)) {
            // Insert before the first other solution block the pointer comes
            // before: above its middle (vertical), or earlier in reading
            // order (horizontal).
            // ponytail: horizontal reading order assumes left-to-right; mirror
            // the x comparison if RTL documents need horizontal problems.
            // An empty row is taken over when the pointer is on it. Dropping
            // below every row leaves empty rows above the block, one per
            // row-height of distance (vertical layout only).
            const colRect = solutionColumn.current!.getBoundingClientRect();
            const rowElements = Array.from(solutionColumn.current!.children);
            const others = order
                .map((rowBlock, i) => ({
                    rowBlock,
                    r: rowElements[i].getBoundingClientRect(),
                }))
                .filter(({ rowBlock }) => rowBlock !== blockIdx);
            let position = others.findIndex(({ rowBlock, r }) => {
                if (horizontal) {
                    return (
                        y < r.top || (y <= r.bottom && x < r.left + r.width / 2)
                    );
                }
                return rowBlock === 0
                    ? y <= r.bottom
                    : y < r.top + r.height / 2;
            });
            let replaceEmptyRow = false;
            let emptyRowsBefore = 0;
            if (position !== -1) {
                const { rowBlock, r } = others[position];
                replaceEmptyRow = rowBlock === 0 && y >= r.top;
            } else {
                position = others.length;
                if (!horizontal) {
                    const lastBottom =
                        others.length > 0
                            ? others[others.length - 1].r.bottom
                            : colRect.top + COLUMN_PADDING_PX;
                    emptyRowsBefore = Math.min(
                        Math.max(
                            0,
                            Math.floor((y - lastBottom) / BLANK_ROW_PX),
                        ),
                        Math.max(0, maxRows - others.length - 1),
                    );
                }
            }
            const colLeft = colRect.left + COLUMN_PADDING_PX;
            const blockLeft = info.startLeft + (x - info.startX);
            const indent = Math.round((blockLeft - colLeft) / INDENT_PX);
            const result = placeInSolution(
                arrangement,
                blockIdx,
                position,
                indent,
                options,
                { replaceEmptyRow, emptyRowsBefore },
            );
            const row = result.order.indexOf(blockIdx);
            commit(
                result,
                movedToSolutionMessage(blockIdx, row, result.indents[row]),
            );
        } else if (contains(sourceColumn.current) && order.includes(blockIdx)) {
            commit(
                removeFromSolution(arrangement, blockIdx),
                movedToSourceMessage(blockIdx),
            );
        }
    }

    // ── Keyboard ────────────────────────────────────────────────────────

    // The rules live in `arrangementAfterKey`; this applies its result.
    function onKeyDown(
        e: React.KeyboardEvent<HTMLLIElement>,
        blockIdx: number,
    ) {
        if (disabled) {
            return;
        }
        const result = arrangementAfterKey({
            key: e.key,
            blockIdx,
            arrangement,
            initialOrder: SVs.initialOrder,
            options,
        });
        if (!result.handled) {
            return;
        }
        e.preventDefault();

        if (result.arrangement) {
            // The focused block may be about to move to the other list, so
            // focus is applied after the re-render.
            pendingFocus.current = result.focus ?? null;
            const row = result.arrangement.order.indexOf(blockIdx);
            let message: string;
            if (result.move === "toSource") {
                message = movedToSourceMessage(blockIdx);
            } else if (result.move === "indent") {
                const block = blockText(blockIdx);
                const indent = result.arrangement.indents[row];
                message = t(
                    "parsons-block-indent",
                    { block, indent },
                    `${block} indent ${indent}`,
                );
            } else {
                message = movedToSolutionMessage(
                    blockIdx,
                    row,
                    result.arrangement.indents[row],
                );
            }
            commit(result.arrangement, message);
        } else if (result.focus !== undefined) {
            blockElements.current[result.focus]?.focus();
        }
    }

    // ── Rendering ───────────────────────────────────────────────────────

    const instructionsId = `${id}-instructions`;

    function renderBlock(blockIdx: number, indent: number) {
        const dragging =
            dragOffset !== null && dragOffset.blockIdx === blockIdx;
        const style: React.CSSProperties = {
            marginLeft: horizontal ? undefined : indent * INDENT_PX,
            textAlign: SVs.horizontalAlign,
        };
        if (dragging) {
            style.transform = `translate(${dragOffset.dx}px, ${dragOffset.dy}px)`;
        }
        return (
            <li
                key={blockIdx}
                ref={(el) => {
                    blockElements.current[blockIdx] = el;
                }}
                className={
                    "parsons-block" + (dragging ? " parsons-dragging" : "")
                }
                style={style}
                tabIndex={disabled ? -1 : 0}
                aria-describedby={instructionsId}
                aria-disabled={disabled || undefined}
                onPointerDown={(e) => onPointerDown(e, blockIdx)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={(e) => onKeyDown(e, blockIdx)}
            >
                {renderedChildren[blockIdx - 1]}
            </li>
        );
    }

    /** A row of the solution the student left empty; clicking it removes it. */
    function renderEmptyRow(row: number) {
        return (
            <li
                key={`empty-${row}`}
                className="parsons-blank"
                title={t(
                    "parsons-remove-empty-row",
                    undefined,
                    "Empty row (click to remove)",
                )}
                onClick={() => removeEmptyRow(row)}
            />
        );
    }

    /** The gap left in the source list by a block that is now in the solution. */
    function renderGap(blockIdx: number) {
        const size = sizes[blockIdx];
        return (
            <li
                key={`gap-${blockIdx}`}
                className="parsons-gap"
                aria-hidden="true"
                style={{
                    height: size?.height,
                    width: horizontal ? size?.width : undefined,
                }}
            />
        );
    }

    const checkWorkComponent = createCheckWorkComponent(
        SVs,
        id,
        validationState,
        submitActionWithPending,
        SVs.forceFullCheckWorkButton,
        isPending,
        tContent,
    );

    const solutionStyle = {
        "--parsons-indent": `${INDENT_PX}px`,
        "--parsons-max-indent": SVs.maxIndent,
    } as React.CSSProperties;

    return (
        <div id={id} className="parsons-container">
            {SVs.label ? <p className="parsons-heading">{SVs.label}</p> : null}
            {description}
            <p id={instructionsId} className="parsons-sr-only">
                {t(
                    "parsons-instructions",
                    undefined,
                    "Drag blocks into the solution, or press Enter or Space to move a block between the lists. Use the arrow keys to reorder.",
                )}
                {SVs.indentationGraded
                    ? " " +
                      t(
                          "parsons-instructions-indent",
                          undefined,
                          "Use the Left and Right arrow keys to change indentation.",
                      )
                    : ""}
            </p>
            <div
                className={
                    "parsons" +
                    (horizontal ? " parsons-horizontal" : "") +
                    (disabled ? " parsons-disabled" : "")
                }
            >
                <div className="parsons-column-wrapper">
                    <p className="parsons-heading" id={`${id}-source-heading`}>
                        {t(
                            "parsons-source-heading",
                            undefined,
                            "Drag from here",
                        )}
                    </p>
                    <ul
                        ref={sourceColumn}
                        className="parsons-column"
                        aria-labelledby={`${id}-source-heading`}
                    >
                        {SVs.initialOrder.map((blockIdx) =>
                            order.includes(blockIdx)
                                ? renderGap(blockIdx)
                                : renderBlock(blockIdx, 0),
                        )}
                    </ul>
                </div>
                <div className="parsons-column-wrapper">
                    <p
                        className="parsons-heading"
                        id={`${id}-solution-heading`}
                    >
                        {t(
                            "parsons-solution-heading",
                            undefined,
                            "Your solution",
                        )}
                    </p>
                    <ul
                        ref={solutionColumn}
                        className={
                            "parsons-column parsons-solution" +
                            (SVs.indentationGraded ? "" : " parsons-no-indent")
                        }
                        aria-labelledby={`${id}-solution-heading`}
                        style={solutionStyle}
                    >
                        {order.map((blockIdx, i) =>
                            blockIdx === 0
                                ? renderEmptyRow(i)
                                : renderBlock(blockIdx, indents[i]),
                        )}
                    </ul>
                </div>
            </div>
            <div className="parsons-controls">
                {checkWorkComponent}
                <span className="parsons-reset">
                    <Button
                        id={`${id}_reset`}
                        onClick={reset}
                        disabled={disabled || order.length === 0}
                        value={t("parsons-reset", undefined, "Reset")}
                    />
                </span>
            </div>
            <div className="parsons-sr-only" aria-live="polite">
                {announcement}
            </div>
        </div>
    );
});
