import React, { useEffect, useRef, useState } from "react";
import useDoenetRenderer, {
    UseDoenetRendererProps,
} from "../useDoenetRenderer";
import {
    calculateValidationState,
    createCheckWorkComponent,
} from "./utils/checkWork";
import { useSubmitActionWithDelay } from "./utils/useSubmitActionWithDelay";
import "./parsons.css";

const INDENT_PX = 32;
const DRAG_THRESHOLD_PX = 4;
const COLUMN_PADDING_PX = 8;

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
    justSubmitted: boolean;
    forceFullCheckWorkButton: boolean;
}

type Arrangement = { order: number[]; indents: number[] };

type DragInfo = {
    blockIdx: number;
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    moved: boolean;
};

export default React.memo(function Parsons(props: UseDoenetRendererProps) {
    const { id, SVs, children, actions, callAction } =
        useDoenetRenderer<ParsonsSVs>(props);

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
    const { order, indents } = arrangement;
    const sourceOrder = SVs.initialOrder.filter((i) => !order.includes(i));

    function blockText(blockIdx: number) {
        return SVs.blocks[blockIdx - 1]?.text ?? `block ${blockIdx}`;
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

    function clampIndent(indent: number) {
        if (!SVs.indentationGraded) {
            return 0;
        }
        return Math.min(Math.max(indent, 0), SVs.maxIndent);
    }

    /** Remove `blockIdx` from the solution (if present) and insert it at `position`. */
    function placeInSolution(
        blockIdx: number,
        position: number,
        indent: number,
    ): Arrangement {
        const newOrder = [...order];
        const newIndents = [...indents];
        const oldPos = newOrder.indexOf(blockIdx);
        if (oldPos !== -1) {
            newOrder.splice(oldPos, 1);
            newIndents.splice(oldPos, 1);
        }
        newOrder.splice(position, 0, blockIdx);
        newIndents.splice(position, 0, clampIndent(indent));
        return { order: newOrder, indents: newIndents };
    }

    function removeFromSolution(blockIdx: number): Arrangement {
        const pos = order.indexOf(blockIdx);
        return {
            order: order.filter((_, i) => i !== pos),
            indents: indents.filter((_, i) => i !== pos),
        };
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
            // Insert before the first other solution block whose middle is below the pointer.
            const others = order.filter((i) => i !== blockIdx);
            let position = others.findIndex((i) => {
                const r = blockElements.current[i]?.getBoundingClientRect();
                return r !== undefined && y < r.top + r.height / 2;
            });
            if (position === -1) {
                position = others.length;
            }
            const colLeft =
                solutionColumn.current!.getBoundingClientRect().left +
                COLUMN_PADDING_PX;
            const blockLeft = info.startLeft + (x - info.startX);
            const indent = Math.round((blockLeft - colLeft) / INDENT_PX);
            const result = placeInSolution(blockIdx, position, indent);
            commit(
                result,
                `Moved "${blockText(blockIdx)}" to solution position ${position + 1}` +
                    (SVs.indentationGraded
                        ? `, indent ${result.indents[position]}`
                        : ""),
            );
        } else if (contains(sourceColumn.current) && order.includes(blockIdx)) {
            commit(
                removeFromSolution(blockIdx),
                `Moved "${blockText(blockIdx)}" back to unused blocks`,
            );
        }
    }

    // ── Keyboard ────────────────────────────────────────────────────────

    function onKeyDown(
        e: React.KeyboardEvent<HTMLLIElement>,
        blockIdx: number,
    ) {
        if (disabled) {
            return;
        }
        const pos = order.indexOf(blockIdx);
        const inSolution = pos !== -1;
        let result: Arrangement | null = null;
        let message = "";

        if (e.key === "Enter" || e.key === " ") {
            if (inSolution) {
                result = removeFromSolution(blockIdx);
                message = `Moved "${blockText(blockIdx)}" back to unused blocks`;
            } else {
                result = placeInSolution(blockIdx, order.length, 0);
                message = `Moved "${blockText(blockIdx)}" to solution position ${order.length + 1}`;
            }
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            const step = e.key === "ArrowUp" ? -1 : 1;
            if (inSolution) {
                const newPos = pos + step;
                if (newPos >= 0 && newPos < order.length) {
                    result = placeInSolution(blockIdx, newPos, indents[pos]);
                    message = `"${blockText(blockIdx)}" at solution position ${newPos + 1}`;
                }
            } else {
                const srcPos = sourceOrder.indexOf(blockIdx) + step;
                if (srcPos >= 0 && srcPos < sourceOrder.length) {
                    blockElements.current[sourceOrder[srcPos]]?.focus();
                }
                e.preventDefault();
                return;
            }
        } else if (
            (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
            inSolution &&
            SVs.indentationGraded
        ) {
            const newIndent = clampIndent(
                indents[pos] + (e.key === "ArrowLeft" ? -1 : 1),
            );
            if (newIndent !== indents[pos]) {
                result = placeInSolution(blockIdx, pos, newIndent);
                message = `"${blockText(blockIdx)}" indent ${newIndent}`;
            }
        } else {
            return;
        }

        e.preventDefault();
        if (result) {
            pendingFocus.current = blockIdx;
            commit(result, message);
        }
    }

    // ── Rendering ───────────────────────────────────────────────────────

    const instructionsId = `${id}-instructions`;

    function renderBlock(blockIdx: number, indent: number) {
        const dragging =
            dragOffset !== null && dragOffset.blockIdx === blockIdx;
        const style: React.CSSProperties = {
            marginLeft: indent * INDENT_PX,
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

    // `children` has a null placeholder for each unrendered child (e.g.
    // <shortDescription>), so drop those: what remains is the blocks in
    // order, then any <description>.
    const renderedChildren = children.filter((child) => child !== null);
    const numBlocks = SVs.blocks.length;
    const description = renderedChildren.slice(numBlocks);

    const checkWorkComponent = createCheckWorkComponent(
        SVs,
        id,
        validationState,
        submitActionWithPending,
        SVs.forceFullCheckWorkButton,
        isPending,
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
                Drag blocks into the solution, or press Enter or Space to move a
                block between lists. Use Up and Down arrows to reorder
                {SVs.indentationGraded
                    ? " and Left and Right arrows to change indentation"
                    : ""}
                .
            </p>
            <div className={"parsons" + (disabled ? " parsons-disabled" : "")}>
                <div className="parsons-column-wrapper">
                    <p className="parsons-heading" id={`${id}-source-heading`}>
                        Drag from here
                    </p>
                    <ul
                        ref={sourceColumn}
                        className="parsons-column"
                        aria-labelledby={`${id}-source-heading`}
                        style={{ listStyle: "none", margin: 0 }}
                    >
                        {sourceOrder.map((blockIdx) =>
                            renderBlock(blockIdx, 0),
                        )}
                    </ul>
                </div>
                <div className="parsons-column-wrapper">
                    <p
                        className="parsons-heading"
                        id={`${id}-solution-heading`}
                    >
                        Your solution
                    </p>
                    <ul
                        ref={solutionColumn}
                        className={
                            "parsons-column parsons-solution" +
                            (SVs.indentationGraded ? "" : " parsons-no-indent")
                        }
                        aria-labelledby={`${id}-solution-heading`}
                        style={{
                            ...solutionStyle,
                            listStyle: "none",
                            margin: 0,
                        }}
                    >
                        {order.map((blockIdx, i) =>
                            renderBlock(blockIdx, indents[i]),
                        )}
                    </ul>
                </div>
            </div>
            {checkWorkComponent}
            <div className="parsons-sr-only" aria-live="polite">
                {announcement}
            </div>
        </div>
    );
});
