import React, { useContext, useEffect, useRef } from "react";
import useDoenetRenderer from "../useDoenetRenderer";
import { BoardContext, LINE_LAYER_OFFSET, TEXT_LAYER_OFFSET } from "./graph";

// ─── Layout constants (graph user-unit coordinates) ───────────────────────────
//
//  The cell grid occupies x ∈ [0, 4], with each row having height 1.
//  Row 0 sits at y ∈ [0, -1], row 1 at [-1, -2], etc.
//  Addresses are rendered as right-aligned text to the left of the grid.
//  Unplaced variable tokens appear in a "palette" row below the grid.
//
//  Recommended <graph> setup:
//    <graph displayXAxis="false" displayYAxis="false"
//           xMin="-5" xMax="6" yMin="-12" yMax="2">
// ─────────────────────────────────────────────────────────────────────────────
const CELL_X_LEFT = 0;
const CELL_X_RIGHT = 4;
const CELL_HEIGHT = 1; // height of each memory-cell row
const CELL_TOP_Y = 0; // y-coordinate of the top edge of row 0
const ADDR_X = -0.25; // x where address labels are right-anchored
const PALETTE_GAP = 1.5; // gap (in graph units) between last cell and palette

export default React.memo(function ArrayComponent(props) {
    const { name, id, SVs, actions, callAction } = useDoenetRenderer(props);

    // Tell the framework to ignore actions until core is ready.
    ArrayComponent.ignoreActionsWithoutCore = () => true;

    const board = useContext(BoardContext);

    // ── JSXGraph object stores ──────────────────────────────────────────────
    const cellLines = useRef([]); // segments that form the cell grid border
    const addrTexts = useRef([]); // fixed address text objects
    const varHandles = useRef([]); // transparent draggable "shadow" points
    const varTexts = useRef([]); // variable name text objects (follow handles)

    // Last positions confirmed by core (used for snap-back during drag).
    const lastPositionsFromCore = useRef([]);

    // Track previous counts so we know when to fully rebuild.
    const previousNumCells = useRef(null);
    const previousNumVars = useRef(null);

    // ── Cleanup on unmount ──────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            if (board && cellLines.current.length > 0) {
                deleteArrayComponentJXG();
            }
        };
    }, []);

    // ── Layout helpers ──────────────────────────────────────────────────────

    /** x-coordinate of the palette slot for an unplaced variable. */
    function getPaletteX(varIdx, numVars) {
        const cellW = CELL_X_RIGHT - CELL_X_LEFT;
        // Spread tokens evenly across the full cell width.
        return CELL_X_LEFT + ((varIdx + 0.5) / Math.max(numVars, 1)) * cellW;
    }

    /** y-coordinate of the palette row (one row below the grid). */
    function getPaletteY() {
        return CELL_TOP_Y - SVs.numCells * CELL_HEIGHT - PALETTE_GAP;
    }

    /** x-coordinate of variable varIdx when it is placed in cellIdx. */
    function getCellVarX(cellIdx, varIdx) {
        // Collect all variables currently in this cell (sorted by var index).
        const placements = SVs.variablePlacements || [];
        const siblings = placements
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p === cellIdx)
            .map(({ i }) => i);
        const rank = siblings.indexOf(varIdx);
        const count = siblings.length;
        const cellCenterX = (CELL_X_LEFT + CELL_X_RIGHT) / 2;
        // Spread siblings evenly (0.5 graph-unit spacing).
        const xOffset = count > 1 ? (rank - (count - 1) / 2) * 0.5 : 0;
        return cellCenterX + xOffset;
    }

    /** y-coordinate of the centre of cell cellIdx. */
    function getCellCenterY(cellIdx) {
        return CELL_TOP_Y - (cellIdx + 0.5) * CELL_HEIGHT;
    }

    /**
     * Returns the [x, y] position where variable varIdx should be drawn,
     * based on SVs.variablePlacements.
     */
    function getVarCoords(varIdx) {
        const placements = SVs.variablePlacements || [];
        const placement = placements[varIdx];
        const numVars = (SVs.variableList || []).length;

        if (
            placement !== undefined &&
            placement >= 0 &&
            placement < SVs.numCells
        ) {
            return [getCellVarX(placement, varIdx), getCellCenterY(placement)];
        }
        return [getPaletteX(varIdx, numVars), getPaletteY()];
    }

    /**
     * Returns the 0-based cell index that contains graph point (x, y),
     * or -1 if (x, y) is outside the grid.
     */
    function getCellAtPosition(x, y) {
        if (x < CELL_X_LEFT || x > CELL_X_RIGHT) return -1;
        const top = CELL_TOP_Y;
        const bottom = CELL_TOP_Y - SVs.numCells * CELL_HEIGHT;
        if (y > top || y < bottom) return -1;
        const idx = Math.floor((top - y) / CELL_HEIGHT);
        if (idx < 0 || idx >= SVs.numCells) return -1;
        return idx;
    }

    // ── Create all JSXGraph objects ─────────────────────────────────────────

    function createArrayComponentJXG() {
        const segAttrs = {
            fixed: true,
            highlight: false,
            strokeColor: "var(--canvasText)",
            strokeWidth: 1,
            layer: 10 * (SVs.layer || 0) + LINE_LAYER_OFFSET,
            withLabel: false,
        };

        cellLines.current = [];

        // Horizontal dividers: numCells + 1 lines.
        for (let i = 0; i <= SVs.numCells; i++) {
            const y = CELL_TOP_Y - i * CELL_HEIGHT;
            cellLines.current.push(
                board.create(
                    "segment",
                    [
                        [CELL_X_LEFT, y],
                        [CELL_X_RIGHT, y],
                    ],
                    { ...segAttrs },
                ),
            );
        }

        // Left vertical border.
        cellLines.current.push(
            board.create(
                "segment",
                [
                    [CELL_X_LEFT, CELL_TOP_Y],
                    [CELL_X_LEFT, CELL_TOP_Y - SVs.numCells * CELL_HEIGHT],
                ],
                { ...segAttrs },
            ),
        );

        // Right vertical border.
        cellLines.current.push(
            board.create(
                "segment",
                [
                    [CELL_X_RIGHT, CELL_TOP_Y],
                    [CELL_X_RIGHT, CELL_TOP_Y - SVs.numCells * CELL_HEIGHT],
                ],
                { ...segAttrs },
            ),
        );

        // ── Address labels ──────────────────────────────────────────────────
        addrTexts.current = [];
        const addrList = SVs.addressList || [];
        const addrCellList = SVs.addressCellList || [];

        for (let i = 0; i < addrList.length; i++) {
            const cellIdx =
                addrCellList[i] != null && !isNaN(addrCellList[i])
                    ? addrCellList[i]
                    : i;
            const y = getCellCenterY(cellIdx);
            addrTexts.current.push(
                board.create("text", [ADDR_X, y, addrList[i]], {
                    fixed: true,
                    anchorX: "right",
                    anchorY: "middle",
                    strokeColor: "var(--canvasText)",
                    highlight: false,
                    layer: 10 * (SVs.layer || 0) + TEXT_LAYER_OFFSET,
                    fontSize: 13,
                    cssStyle: "font-family: monospace;",
                    withLabel: false,
                }),
            );
        }

        // ── Variable drag tokens ────────────────────────────────────────────
        //
        //  Each token is two JSXGraph objects:
        //    1. An invisible (opacity-0) draggable "shadow" point that handles
        //       all mouse interaction (drag / up / down).
        //    2. A fixed text label whose coordinates are functions that always
        //       read the shadow point's current position.
        //
        //  This mirrors the pattern used in point.tsx (shadow + visible point).
        // ─────────────────────────────────────────────────────────────────────
        varHandles.current = [];
        varTexts.current = [];
        lastPositionsFromCore.current = [];

        const varList = SVs.variableList || [];

        for (let i = 0; i < varList.length; i++) {
            const [initX, initY] = getVarCoords(i);
            lastPositionsFromCore.current[i] = [initX, initY];

            // Transparent draggable shadow point (large hit area).
            const handle = board.create("point", [initX, initY], {
                visible: true,
                fixed: false,
                showInfoBox: false,
                fillColor: "steelblue",
                strokeColor: "steelblue",
                fillOpacity: 0,
                strokeOpacity: 0,
                highlightFillOpacity: 0.15,
                highlightStrokeOpacity: 0,
                size: 22,
                name: "",
                withLabel: false,
                layer: 10 * (SVs.layer || 0) + TEXT_LAYER_OFFSET,
            });
            handle.isDraggable = true;

            varHandles.current.push(handle);

            // Capture i for event closures.
            const iCapture = i;

            handle.on("up", function () {
                const hx = handle.X();
                const hy = handle.Y();
                const cellIdx = getCellAtPosition(hx, hy);

                // Tell core where the student dropped the token.
                callAction({
                    action: actions.placeVariable,
                    args: {
                        variableIndex: iCapture,
                        cellIndex: cellIdx,
                    },
                });

                // Snap the handle back to the last core-confirmed position
                // immediately (before core responds), so the diagram doesn't
                // show the token in the "wrong" spot while waiting.
                handle.coords.setCoordinates(JXG.COORDS_BY_USER, [
                    ...lastPositionsFromCore.current[iCapture],
                ]);
                handle.needsUpdate = true;
                handle.update();

                // Force the text label to re-evaluate its position functions.
                if (varTexts.current[iCapture]) {
                    varTexts.current[iCapture].needsUpdate = true;
                    varTexts.current[iCapture].update();
                }

                board.updateRenderer();
            });

            // Text label whose position always follows the shadow point.
            const txt = board.create(
                "text",
                [
                    () => varHandles.current[iCapture]?.X() ?? initX,
                    () => varHandles.current[iCapture]?.Y() ?? initY,
                    varList[i],
                ],
                {
                    fixed: true,
                    anchorX: "middle",
                    anchorY: "middle",
                    strokeColor: "var(--canvasText)",
                    highlight: false,
                    layer: 10 * (SVs.layer || 0) + TEXT_LAYER_OFFSET + 1,
                    fontSize: 16,
                    cssStyle:
                        "font-family: monospace; font-weight: bold; pointer-events: none;",
                    withLabel: false,
                },
            );

            varTexts.current.push(txt);
        }

        previousNumCells.current = SVs.numCells;
        previousNumVars.current = varList.length;
    }

    // ── Destroy all JSXGraph objects ────────────────────────────────────────

    function deleteArrayComponentJXG() {
        for (const seg of cellLines.current) {
            if (seg) board.removeObject(seg);
        }
        cellLines.current = [];

        for (const txt of addrTexts.current) {
            if (txt) board.removeObject(txt);
        }
        addrTexts.current = [];

        for (let i = 0; i < varHandles.current.length; i++) {
            if (varHandles.current[i]) {
                varHandles.current[i].off("up");
                board.removeObject(varHandles.current[i]);
            }
            if (varTexts.current[i]) {
                board.removeObject(varTexts.current[i]);
            }
        }
        varHandles.current = [];
        varTexts.current = [];
        lastPositionsFromCore.current = [];

        previousNumCells.current = null;
        previousNumVars.current = null;
    }

    // ── Render / update loop ────────────────────────────────────────────────
    //
    //  This is the DoenetML pattern for JSXGraph renderers: no JSX output,
    //  all drawing happens imperatively against the JSXGraph board object.
    // ─────────────────────────────────────────────────────────────────────────

    if (board) {
        const varList = SVs.variableList || [];

        const needsFullRebuild =
            cellLines.current.length === 0 ||
            SVs.numCells !== previousNumCells.current ||
            varList.length !== previousNumVars.current;

        if (needsFullRebuild) {
            // Tear down any existing objects before (re-)building.
            if (cellLines.current.length > 0) {
                deleteArrayComponentJXG();
            }
            createArrayComponentJXG();
        } else {
            // Incremental update: move each variable token to its new position
            // (either a cell centre or the palette) as dictated by core.
            for (let i = 0; i < varList.length; i++) {
                const [x, y] = getVarCoords(i);
                lastPositionsFromCore.current[i] = [x, y];

                if (varHandles.current[i]) {
                    varHandles.current[i].coords.setCoordinates(
                        JXG.COORDS_BY_USER,
                        [x, y],
                    );
                    varHandles.current[i].needsUpdate = true;
                    varHandles.current[i].update();
                }

                if (varTexts.current[i]) {
                    varTexts.current[i].needsUpdate = true;
                    varTexts.current[i].update();
                }
            }

            board.updateRenderer();
        }
    }

    // This component renders entirely through JSXGraph; no React DOM output.
    return null;
});
