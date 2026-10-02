import React, { useContext, useEffect, useRef } from "react";
import useDoenetRenderer from "../useDoenetRenderer";
import { BoardContext, LINE_LAYER_OFFSET, VERTEX_LAYER_OFFSET } from "./graph";
import { normalizePointSize } from "./utils/graph";
import { PageContext } from "../PageViewer";

export default React.memo(function DiscreteGraph(props) {
    let { name, id, SVs, actions, sourceOfUpdate, callAction } =
        useDoenetRenderer(props);

    DiscreteGraph.ignoreActionsWithoutCore = () => true;

    const board = useContext(BoardContext);

    let pointsJXG = useRef(null);
    let edgesJXG = useRef(null);
    let edgesSVs = useRef(SVs.edges);
    edgesSVs.current = SVs.edges;

    let pointCoords = useRef(null);
    let draggedPoint = useRef(null);
    let downOnPoint = useRef(null);
    let pointerAtDown = useRef(null);
    let pointsAtDown = useRef(null);
    let pointerIsDown = useRef(false);
    let pointerMovedSinceDown = useRef(false);
    let previousNumVertices = useRef(null);
    let previousNumEdges = useRef(null);
    let jsxPointAttributes = useRef(null);
    let jsxEdgeAttributes = useRef(null);

    let lastPositionsFromCore = useRef(null);
    let fixed = useRef(false);
    let fixLocation = useRef(false);
    let verticesFixed = useRef(false);
    let vertexIndicesDraggable = useRef([]);

    lastPositionsFromCore.current = SVs.numericalVertices;
    fixed.current = SVs.fixed;
    fixLocation.current = !SVs.draggable || SVs.fixLocation || SVs.fixed;
    verticesFixed.current =
        !SVs.verticesDraggable || SVs.fixed || SVs.fixLocation;
    vertexIndicesDraggable.current = SVs.vertexIndicesDraggable;

    const { darkMode } = useContext(PageContext) || {};

    useEffect(() => {
        //On unmount
        return () => {
            // if point is defined
            if (pointsJXG.current) {
                deleteDiscreteGraphJXG();
            }

            if (board) {
                board.off("move", boardMoveHandler);
            }
        };
    }, []);

    useEffect(() => {
        if (board) {
            board.on("move", boardMoveHandler);
        }
    }, [board]);

    function createDiscreteGraphJXG() {
        if (
            SVs.numericalVertices.length !== SVs.numVertices ||
            SVs.numericalVertices.some((x) => x.length !== 2)
        ) {
            return null;
        }

        let validCoords = true;

        for (let coords of SVs.numericalVertices) {
            if (!Number.isFinite(coords[0])) {
                validCoords = false;
            }
            if (!Number.isFinite(coords[1])) {
                validCoords = false;
            }
        }

        let lineColor =
            darkMode === "dark"
                ? SVs.selectedStyle.lineColorDarkMode
                : SVs.selectedStyle.lineColor;

        //things to be passed to JSXGraph as attributes
        let jsxDiscreteGraphAttributes = {
            name: SVs.labelForGraph,
            visible: !SVs.hidden && validCoords,
            withLabel: SVs.labelForGraph !== "",
            layer: 10 * SVs.layer + LINE_LAYER_OFFSET,
            fixed: fixed.current,
            strokeColor: lineColor,
            strokeOpacity: SVs.selectedStyle.lineOpacity,
            highlightStrokeColor: lineColor,
            highlightStrokeOpacity: SVs.selectedStyle.lineOpacity * 0.5,
            strokeWidth: SVs.selectedStyle.lineWidth,
            highlightStrokeWidth: SVs.selectedStyle.lineWidth,
            dash: styleToDash(SVs.selectedStyle.lineStyle),
            highlight: !fixLocation.current,
            lineCap: "butt",
        };

        jsxPointAttributes.current = Object.assign(
            {},
            jsxDiscreteGraphAttributes,
        );
        Object.assign(jsxPointAttributes.current, {
            layer: 10 * SVs.layer + VERTEX_LAYER_OFFSET,
            fillColor: lineColor,
            fillOpacity: SVs.selectedStyle.lineOpacity,
            strokeColor: "none",
            highlightStrokeColor: "none",
            size: normalizePointSize(
                SVs.selectedStyle.markerSize,
                SVs.selectedStyle.markerStyle,
            ),
            face: SVs.selectedStyle.markerStyle,
            showInfoBox: SVs.showCoordsWhenDragging,
        });

        jsxDiscreteGraphAttributes.label = {
            highlight: false,
        };
        if (SVs.labelHasLatex) {
            jsxDiscreteGraphAttributes.label.useMathJax = true;
        }
        if (SVs.applyStyleToLabel) {
            jsxDiscreteGraphAttributes.label.strokeColor = lineColor;
        } else {
            jsxDiscreteGraphAttributes.label.strokeColor = "var(--canvastext)";
        }

        jsxEdgeAttributes.current = Object.assign(
            {},
            jsxDiscreteGraphAttributes,
        );

        // create vertices
        pointsJXG.current = [];
        for (let i = 0; i < SVs.numVertices; i++) {
            let pointAttributes = { ...jsxPointAttributes.current };
            //if (!vertexIndicesDraggable.current.includes(i)) {
            //    pointAttributes.visible = false;
            //}
            pointsJXG.current.push(
                board.create(
                    "point",
                    [...SVs.numericalVertices[i]],
                    pointAttributes,
                ),
            );
        }

        //add event handlers to points
        for (let i = 0; i < SVs.numVertices; i++) {
            pointsJXG.current[i].on("drag", (e) => pointDragHandler(i, e));
            pointsJXG.current[i].on("up", () => upHandler(i));
            pointsJXG.current[i].on("keyfocusout", () => keyFocusOutHandler(i));
            pointsJXG.current[i].on("keydown", (e) => keyDownHandler(i, e));
            pointsJXG.current[i].on("down", (e) => downHandler(i, e));
            pointsJXG.current[i].on("hit", (e) => hitHandler());
        }

        // create edges
        edgesJXG.current = [];
        for (let i = 0; i < SVs.numEdges; i++) {
            let edge = SVs.edges[i];
            //compute coords so that edge doesn't overlap with points
            let x0 = pointsJXG.current[edge[0] - 1].X();
            let y0 = pointsJXG.current[edge[0] - 1].Y();
            let x1 = pointsJXG.current[edge[1] - 1].X();
            let y1 = pointsJXG.current[edge[1] - 1].Y();
            let vectorLength = Math.sqrt(
                (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0),
            );
            let newX0 =
                x0 +
                ((jsxPointAttributes.current.size / board.unitX) * (x1 - x0)) /
                vectorLength;
            let newY0 =
                y0 +
                ((jsxPointAttributes.current.size / board.unitY) * (y1 - y0)) /
                vectorLength;
            let newX1 =
                x1 +
                ((jsxPointAttributes.current.size / board.unitX) * (x0 - x1)) /
                vectorLength;
            let newY1 =
                y1 +
                ((jsxPointAttributes.current.size / board.unitY) * (y0 - y1)) /
                vectorLength;
            let edgeAttributes = { ...jsxEdgeAttributes.current };
            edgesJXG.current.push(
                board.create(
                    "segment",
                    [
                        [newX0, newY0],
                        [newX1, newY1],
                    ],
                    edgeAttributes,
                ),
            );
        }

        // add event handlers to edges
        for (let i = 0; i < SVs.numEdges; i++) {
            edgesJXG.current[i].on("drag", (e) => edgeDragHandler(i, e));
            edgesJXG.current[i].on("up", () => upHandler(-1));
            edgesJXG.current[i].on("keyfocusout", () => keyFocusOutHandler(-1));
            edgesJXG.current[i].on("keydown", (e) => keyDownHandler(-1, e));
            edgesJXG.current[i].on("down", (e) => downHandler(-1, e));
            edgesJXG.current[i].on("hit", (e) => hitHandler());
            // edgesJXG.current[i].on("over", (e) => {
            //     highlightVertices();
            // });
            // edgesJXG.current[i].on("out", (e) => {
            //     unHighlightVertices();
            // });
        }

        previousNumVertices.current = SVs.numVertices;
        previousNumEdges.current = SVs.numEdges;

        return;
    }

    function boardMoveHandler(e) {
        if (pointerIsDown.current) {
            //Protect against very small unintended move
            if (
                Math.abs(e.x - pointerAtDown.current[0]) > 0.1 ||
                Math.abs(e.y - pointerAtDown.current[1]) > 0.1
            ) {
                pointerMovedSinceDown.current = true;
            }
        }
    }

    function deleteDiscreteGraphJXG() {
        // delete points
        for (let i = 0; i < SVs.numVertices; i++) {
            let point = pointsJXG.current[i];
            if (point) {
                point.off("drag");
                point.off("down");
                point.off("hit");
                point.off("up");
                point.off("keyfocusout");
                point.off("keydown");
                board.removeObject(point);
            }
        }
        pointsJXG.current = null;

        // delete edges
        for (let i = 0; i < SVs.numEdges; i++) {
            let edge = edgesJXG.current[i];
            if (edge) {
                edge.off("drag");
                edge.off("down");
                edge.off("hit");
                edge.off("up");
                edge.off("keyfocusout");
                edge.off("keydown");
                board.removeObject(edge);
            }
        }
        edgesJXG.current = null;
    }

    function pointDragHandler(i, e) {

        let viaPointer = e.type === "pointermove";

        //Protect against very small unintended drags
        if (
            !viaPointer ||
            Math.abs(e.x - pointerAtDown.current[0]) > 0.1 ||
            Math.abs(e.y - pointerAtDown.current[1]) > 0.1
        ) {
            pointCoords.current = {};
            pointCoords.current[i] = [
                pointsJXG.current[i].X(),
                pointsJXG.current[i].Y(),
            ];

            callAction({
                action: actions.moveDiscreteGraph,
                args: {
                    pointCoords: pointCoords.current,
                    transient: true,
                    skippable: true,
                    sourceDetails: { vertex: i },
                },
            });

            // search through edges for those including this point
            // may want to change this for efficiency later
            for (let j = 0; j < SVs.numEdges; j++) {
                let edge = SVs.edges[j];
                if (edge[0] - 1 === i) {
                    //compute coords so that edge doesn't overlap with points
                    let x0 = pointsJXG.current[i].X();
                    let y0 = pointsJXG.current[i].Y();
                    let x1 = pointsJXG.current[edge[1] - 1].X();
                    let y1 = pointsJXG.current[edge[1] - 1].Y();
                    let vectorLength = Math.sqrt(
                        (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0),
                    );
                    let newX0 =
                        x0 +
                        ((jsxPointAttributes.current.size / board.unitX) *
                            (x1 - x0)) /
                        vectorLength;
                    let newY0 =
                        y0 +
                        ((jsxPointAttributes.current.size / board.unitY) *
                            (y1 - y0)) /
                        vectorLength;
                    let newX1 =
                        x1 +
                        ((jsxPointAttributes.current.size / board.unitX) *
                            (x0 - x1)) /
                        vectorLength;
                    let newY1 =
                        y1 +
                        ((jsxPointAttributes.current.size / board.unitY) *
                            (y0 - y1)) /
                        vectorLength;
                    edgesJXG.current[j].point1.coords.setCoordinates(
                        JXG.COORDS_BY_USER,
                        [newX0, newY0],
                    );
                    edgesJXG.current[j].point2.coords.setCoordinates(
                        JXG.COORDS_BY_USER,
                        [newX1, newY1],
                    );
                    board.updateInfobox(edgesJXG.current[j].point1);
                    board.updateInfobox(edgesJXG.current[j].point2);
                } else if (edge[1] - 1 === i) {
                    //compute coords so that edge doesn't overlap with points
                    let x0 = pointsJXG.current[edge[0] - 1].X();
                    let y0 = pointsJXG.current[edge[0] - 1].Y();
                    let x1 = pointsJXG.current[i].X();
                    let y1 = pointsJXG.current[i].Y();
                    let vectorLength = Math.sqrt(
                        (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0),
                    );
                    let newX0 =
                        x0 +
                        ((jsxPointAttributes.current.size / board.unitX) *
                            (x1 - x0)) /
                        vectorLength;
                    let newY0 =
                        y0 +
                        ((jsxPointAttributes.current.size / board.unitY) *
                            (y1 - y0)) /
                        vectorLength;
                    let newX1 =
                        x1 +
                        ((jsxPointAttributes.current.size / board.unitX) *
                            (x0 - x1)) /
                        vectorLength;
                    let newY1 =
                        y1 +
                        ((jsxPointAttributes.current.size / board.unitY) *
                            (y0 - y1)) /
                        vectorLength;
                    edgesJXG.current[j].point1.coords.setCoordinates(
                        JXG.COORDS_BY_USER,
                        [newX0, newY0],
                    );
                    edgesJXG.current[j].point2.coords.setCoordinates(
                        JXG.COORDS_BY_USER,
                        [newX1, newY1],
                    );
                    board.updateInfobox(edgesJXG.current[j].point1);
                    board.updateInfobox(edgesJXG.current[j].point2);
                }
            }

            pointsJXG.current[i].coords.setCoordinates(JXG.COORDS_BY_USER, [
                ...lastPositionsFromCore.current[i],                // DONE?: edit so puts points back in original position, so not updated until after core figures them out.
            ]);
            //TO DO: edges back to old position?
            board.updateInfobox(pointsJXG.current[i]);
        }
    }

    function edgeDragHandler(i, e) {
        let viaPointer = e.type === "pointermove";
        let edge = edgesSVs.current[i];

        if (
            !viaPointer ||
            Math.abs(e.x - pointerAtDown.current[0]) > 0.1 ||
            Math.abs(e.y - pointerAtDown.current[1]) > 0.1
        ) {
            pointCoords.current = {};
            if (viaPointer) {
                var o = board.origin.scrCoords;

                for (let i = 0; i < 2; i++) {
                    let calculatedX =
                        (pointsAtDown.current[edge[i] - 1][1] +
                            e.x -
                            pointerAtDown.current[0] -
                            o[1]) /
                        board.unitX;
                    let calculatedY =
                        (o[2] -
                            (pointsAtDown.current[edge[i] - 1][2] +
                                e.y -
                                pointerAtDown.current[1])) /
                        board.unitY;
                    pointCoords.current[edge[i] - 1] = [
                        calculatedX,
                        calculatedY,
                    ];
                }
            } else {
                pointCoords.current[edge[0] - 1] = [
                    edgesJXG.current[i].point1.X(),
                    edgesJXG.current[i].point1.Y(),
                ];
                pointCoords.current[edge[1] - 1] = [
                    edgesJXG.current[i].point2.X(),
                    edgesJXG.current[i].point2.Y(),
                ];
            }

            callAction({
                action: actions.moveDiscreteGraph,
                args: {
                    pointCoords: pointCoords.current,
                    transient: true,
                    skippable: true,
                    sourceDetails: { vertex: i },
                },
            });

            // search through edges to update
            // may want to change this for efficiency later
            for (let j = 0; j < SVs.numEdges; j++) {
                let currentEdge = edgesSVs.current[j];
                if (currentEdge[0] === edge[0] || currentEdge[0] === edge[1]) {
                    //compute coords so that edge doesn't overlap with points
                    let i = currentEdge[0] - 1;
                    let x0 = pointsJXG.current[i].X();
                    let y0 = pointsJXG.current[i].Y();
                    let x1 = pointsJXG.current[currentEdge[1] - 1].X();
                    let y1 = pointsJXG.current[currentEdge[1] - 1].Y();
                    let vectorLength = Math.sqrt(
                        (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0),
                    );
                    let newX0 =
                        x0 +
                        ((jsxPointAttributes.current.size / board.unitX) *
                            (x1 - x0)) /
                        vectorLength;
                    let newY0 =
                        y0 +
                        ((jsxPointAttributes.current.size / board.unitY) *
                            (y1 - y0)) /
                        vectorLength;
                    let newX1 =
                        x1 +
                        ((jsxPointAttributes.current.size / board.unitX) *
                            (x0 - x1)) /
                        vectorLength;
                    let newY1 =
                        y1 +
                        ((jsxPointAttributes.current.size / board.unitY) *
                            (y0 - y1)) /
                        vectorLength;
                    edgesJXG.current[j].point1.coords.setCoordinates(
                        JXG.COORDS_BY_USER,
                        [newX0, newY0],
                    );
                    edgesJXG.current[j].point2.coords.setCoordinates(
                        JXG.COORDS_BY_USER,
                        [newX1, newY1],
                    );
                    board.updateInfobox(edgesJXG.current[j].point1);
                    board.updateInfobox(edgesJXG.current[j].point2);
                    board.updateInfobox(pointsJXG.current[i]);
                } else if (
                    currentEdge[1] === edge[0] ||
                    currentEdge[1] === edge[1]
                ) {
                    //compute coords so that edge doesn't overlap with points
                    let i = currentEdge[1] - 1;
                    let x0 = pointsJXG.current[currentEdge[0] - 1].X();
                    let y0 = pointsJXG.current[currentEdge[0] - 1].Y();
                    let x1 = pointsJXG.current[i].X();
                    let y1 = pointsJXG.current[i].Y();
                    let vectorLength = Math.sqrt(
                        (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0),
                    );
                    let newX0 =
                        x0 +
                        ((jsxPointAttributes.current.size / board.unitX) *
                            (x1 - x0)) /
                        vectorLength;
                    let newY0 =
                        y0 +
                        ((jsxPointAttributes.current.size / board.unitY) *
                            (y1 - y0)) /
                        vectorLength;
                    let newX1 =
                        x1 +
                        ((jsxPointAttributes.current.size / board.unitX) *
                            (x0 - x1)) /
                        vectorLength;
                    let newY1 =
                        y1 +
                        ((jsxPointAttributes.current.size / board.unitY) *
                            (y0 - y1)) /
                        vectorLength;
                    edgesJXG.current[j].point1.coords.setCoordinates(
                        JXG.COORDS_BY_USER,
                        [newX0, newY0],
                    );
                    edgesJXG.current[j].point2.coords.setCoordinates(
                        JXG.COORDS_BY_USER,
                        [newX1, newY1],
                    );
                    board.updateInfobox(edgesJXG.current[j].point1);
                    board.updateInfobox(edgesJXG.current[j].point2);
                    board.updateInfobox(pointsJXG.current[i]);
                }
            }
            pointsJXG.current[i].coords.setCoordinates(JXG.COORDS_BY_USER, [
                ...lastPositionsFromCore.current[i],        // DONE?: edit so puts points back in original position, so not updated until after core figures them out
            ]);
            //TO DO: edges back to old position?
        }
    }

    function downHandler(i, e) {
        draggedPoint.current = null;
        pointerAtDown.current = [e.x, e.y];

        if (i === -1) {
            if (downOnPoint.current === null && !fixed.current) {
                // Note: counting on fact that down on polyline itself will trigger after down on points
                callAction({
                    action: actions.discreteGraphFocused,
                    args: { name }, // send name so get original name if adapted
                });
            }
            // record location of all points - could reduce to two if slow
            pointsAtDown.current = pointsJXG.current.map((x) => [
                ...x.coords.scrCoords,
            ]);
        } else {
            if (!verticesFixed.current) {
                callAction({
                    action: actions.discreteGraphFocused,
                    args: { name }, // send name so get original name if adapted
                });
            }
            downOnPoint.current = i;
        }

        pointerIsDown.current = true;
        pointerMovedSinceDown.current = false;
    }

    function hitHandler() {
        //highlightVertices();
        draggedPoint.current = null;
        callAction({
            action: actions.discreteGraphFocused,
            args: { name }, // send name so get original name if adapted
        });
    }

    function upHandler(i) {
        if (draggedPoint.current === i) {
            if (i === -1) {
                callAction({
                    action: actions.moveDiscreteGraph,
                    args: {
                        pointCoords: pointCoords.current,
                    },
                });
            } else {
                callAction({
                    action: actions.moveDiscreteGraph,
                    args: {
                        pointCoords: pointCoords.current,
                        sourceDetails: { vertex: i },
                    },
                });
            }
        } else if (
            !pointerMovedSinceDown.current &&
            (downOnPoint.current === null || i !== -1) &&
            !fixed.current
        ) {
            // Note: counting on fact that up on polyline itself (i===-1) will trigger before up on points
            callAction({
                action: actions.discreteGraphClicked,
                args: { name }, // send name so get original name if adapted
            });
        }

        if (i !== -1) {
            downOnPoint.current = null;
        }

        pointerIsDown.current = false;
    }

    function keyFocusOutHandler(i) {
        //unHighlightVertices();
        if (draggedPoint.current === i) {
            if (i === -1) {
                callAction({
                    action: actions.moveDiscreteGraph,
                    args: {
                        pointCoords: pointCoords.current,
                    },
                });
            } else {
                callAction({
                    action: actions.moveDiscreteGraph,
                    args: {
                        pointCoords: pointCoords.current,
                        sourceInformation: { vertex: i },
                    },
                });
            }
        }
        draggedPoint.current = null;
    }

    function keyDownHandler(i, e) {
        if (e.key === "Enter") {
            if (draggedPoint.current === i) {
                if (i === -1) {
                    callAction({
                        action: actions.moveDiscreteGraph,
                        args: {
                            pointCoords: pointCoords.current,
                        },
                    });
                } else {
                    callAction({
                        action: actions.moveDiscreteGraph,
                        args: {
                            pointCoords: pointCoords.current,
                            sourceInformation: { vertex: i },
                        },
                    });
                }
            }
            draggedPoint.current = null;
            callAction({
                action: actions.discreteGraphClicked,
                args: { name }, // send name so get original name if adapted
            });
        }
    }

    function highlightVertices() {
        if (!verticesFixed.current) {
            for (let [i, point] of pointsJXG.current.entries()) {
                if (vertexIndicesDraggable.current.includes(i)) {
                    point.setAttribute({ fillcolor: "black" });
                    point.needsUpdate = true;
                    point.update();
                }
            }
        }
    }

    function unHighlightVertices() {
        if (!verticesFixed.current) {
            for (let [i, point] of pointsJXG.current.entries()) {
                if (vertexIndicesDraggable.current.includes(i)) {
                    point.setAttribute({ fillcolor: "none" });
                    point.needsUpdate = true;
                    point.update();
                }
            }
        }
    }

    if (board) {
        if (!pointsJXG.current) {
            createDiscreteGraphJXG();
        } else if (
            SVs.numericalVertices.length !== SVs.numVertices ||
            SVs.numericalVertices.some((x) => x.length !== 2)
        ) {
            deleteDiscreteGraphJXG();
        } else {            // edit this, so that will update when state changes
            let validCoords = true;

            for (let coords of SVs.numericalVertices) {
                if (!Number.isFinite(coords[0])) {
                    validCoords = false;
                }
                if (!Number.isFinite(coords[1])) {
                    validCoords = false;
                }
            }

            // need to iterate through and update EACH point and edge
            //pointsJXG.current.visProp.fixed = fixed.current;
            //edgesJXG.current.visProp.fixed = fixed.current;
            //discretegraphJXG.current.visProp.highlight = !fixLocation.current;
            //discretegraphJXG.current.isDraggable = !fixLocation.current;

            let discreteGraphLayer = 10 * SVs.layer + LINE_LAYER_OFFSET;
            //let layerChanged =
            //    discretegraphJXG.current.visProp.layer !== discreteGraphLayer;
            let pointLayer = 10 * SVs.layer + VERTEX_LAYER_OFFSET;

            // if (layerChanged) {
            // //    discretegraphJXG.current.setAttribute({ layer: discreteGraphLayer });
            //     jsxPointAttributes.current.layer = pointLayer;
            // }

            // add or delete points as required and change data array size 
            if (SVs.numVertices > previousNumVertices.current) {
                for (
                    let i = previousNumVertices.current;
                    i < SVs.numVertices;
                    i++
                ) {
                    let pointAttributes = { ...jsxPointAttributes.current };
                    // if (!vertexIndicesDraggable.current.includes(i)) {
                    //     pointAttributes.visible = false;
                    // }
                    pointsJXG.current.push(
                        board.create(
                            "point",
                            [...SVs.numericalVertices[i]],
                            pointAttributes,
                        ),
                    );

                    pointsJXG.current[i].on("drag", (e) => pointDragHandler(i, e));
                    pointsJXG.current[i].on("up", (e) => upHandler(i));
                    pointsJXG.current[i].on("down", (e) => downHandler(i, e));
                    pointsJXG.current[i].on("hit", (e) => hitHandler());
                    pointsJXG.current[i].on("keyfocusout", (e) =>
                        keyFocusOutHandler(i),
                    );
                    pointsJXG.current[i].on("keydown", (e) =>
                        keyDownHandler(i, e),
                    );
                }
            } else if (SVs.numVertices < previousNumVertices.current) {
                for (
                    let i = SVs.numVertices;
                    i < previousNumVertices.current;
                    i++
                ) {
                    let pt = pointsJXG.current.pop();
                    pt.off("drag");
                    pt.off("down");
                    pt.off("hit");
                    pt.off("up");
                    pt.off("keyfocusout");
                    pt.off("keydown");
                    board.removeObject(pt);
                }
            }

            previousNumVertices.current = SVs.numVertices;

            //add or delete edges as required and change data array size
            if (SVs.numEdges > previousNumEdges.current) {
                for (
                    let i = previousNumEdges.current;
                    i < SVs.numEdges;
                    i++
                ) {
                    let edgeAttributes = { ...jsxEdgeAttributes.current };
                    let edge = SVs.edges[i];
                    //compute coords so that edge doesn't overlap with points
                    let x0 = pointsJXG.current[edge[0] - 1].X();
                    let y0 = pointsJXG.current[edge[0] - 1].Y();
                    let x1 = pointsJXG.current[edge[1] - 1].X();
                    let y1 = pointsJXG.current[edge[1] - 1].Y();
                    let vectorLength = Math.sqrt(
                        (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0),
                    );
                    let newX0 =
                        x0 +
                        ((jsxPointAttributes.current.size / board.unitX) * (x1 - x0)) /
                        vectorLength;
                    let newY0 =
                        y0 +
                        ((jsxPointAttributes.current.size / board.unitY) * (y1 - y0)) /
                        vectorLength;
                    let newX1 =
                        x1 +
                        ((jsxPointAttributes.current.size / board.unitX) * (x0 - x1)) /
                        vectorLength;
                    let newY1 =
                        y1 +
                        ((jsxPointAttributes.current.size / board.unitY) * (y0 - y1)) /
                        vectorLength;
                    edgesJXG.current.push(
                        board.create(
                            "segment",
                            [
                                [newX0, newY0],
                                [newX1, newY1],
                            ],
                            edgeAttributes,         //TO DO: change to a separate attributes variable
                        ),
                    );

                    edgesJXG.current[i].on("drag", (e) => edgeDragHandler(i, e));
                    edgesJXG.current[i].on("up", () => upHandler(-1));
                    edgesJXG.current[i].on("keyfocusout", () => keyFocusOutHandler(-1));
                    edgesJXG.current[i].on("keydown", (e) => keyDownHandler(-1, e));
                    edgesJXG.current[i].on("down", (e) => downHandler(-1, e));
                    edgesJXG.current[i].on("hit", (e) => hitHandler());
            
                }
            } else if (SVs.numEdges < previousNumEdges.current) {
                for (
                    let i = SVs.numEdges;
                    i < previousNumEdges.current;
                    i++
                ) {
                    let edge = edgesJXG.current.pop();
                    edge.off("drag");
                    edge.off("down");
                    edge.off("hit");
                    edge.off("up");
                    edge.off("keyfocusout");
                    edge.off("keydown");
                    board.removeObject(edge);
                }
            }

            previousNumEdges.current = SVs.numEdges;

            // TO DO: add protections if edges are invalid

            for (let i = 0; i < SVs.numVertices; i++) {
                // this will move points
                pointsJXG.current[i].coords.setCoordinates(JXG.COORDS_BY_USER, [
                    ...SVs.numericalVertices[i],
                ]);
            }

            // move edges
            for (let i = 0; i < SVs.numEdges; i++) {
                let edge = SVs.edges[i];
                //compute coords so that edge doesn't overlap with points
                let x0 = pointsJXG.current[edge[0] - 1].X();
                let y0 = pointsJXG.current[edge[0] - 1].Y();
                let x1 = pointsJXG.current[edge[1] - 1].X();
                let y1 = pointsJXG.current[edge[1] - 1].Y();
                let vectorLength = Math.sqrt(
                    (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0),
                );
                let newX0 =
                    x0 +
                    ((jsxPointAttributes.current.size / board.unitX) * (x1 - x0)) /
                    vectorLength;
                let newY0 =
                    y0 +
                    ((jsxPointAttributes.current.size / board.unitY) * (y1 - y0)) /
                    vectorLength;
                let newX1 =
                    x1 +
                    ((jsxPointAttributes.current.size / board.unitX) * (x0 - x1)) /
                    vectorLength;
                let newY1 =
                    y1 +
                    ((jsxPointAttributes.current.size / board.unitY) * (y0 - y1)) /
                    vectorLength;

                edgesJXG.current[i].point1.coords.setCoordinates(
                    JXG.COORDS_BY_USER,
                    [newX0, newY0],
                );
                edgesJXG.current[i].point2.coords.setCoordinates(
                    JXG.COORDS_BY_USER,
                    [newX1, newY1],
                );
            }

            let visible = !SVs.hidden;

            if (validCoords) {
                //discretegraphJXG.current.visProp["visible"] = visible;
                //discretegraphJXG.current.visPropCalc["visible"] = visible;
                // polylineJXG.current.setAttribute({visible: visible})

                let pointsVisible = visible && !verticesFixed.current;

                for (let i = 0; i < SVs.numVertices; i++) {
                    let pointVisible =
                        pointsVisible &&
                        vertexIndicesDraggable.current.includes(i);
                    pointsJXG.current[i].visProp["visible"] = pointVisible;
                    pointsJXG.current[i].visPropCalc["visible"] = pointVisible;
                    pointsJXG.current[i].visProp.showinfobox =
                        SVs.showCoordsWhenDragging;
                }
            } else {
                //discretegraphJXG.current.visProp["visible"] = false;
                //discretegraphJXG.current.visPropCalc["visible"] = false;
                // polylineJXG.current.setAttribute({visible: false})

                for (let i = 0; i < SVs.numVertices; i++) {
                    pointsJXG.current[i].visProp["visible"] = false;
                    pointsJXG.current[i].visPropCalc["visible"] = false;
                }
            }

            let lineColor =
                darkMode === "dark"
                    ? SVs.selectedStyle.lineColorDarkMode
                    : SVs.selectedStyle.lineColor;

            // if (discretegraphJXG.current.visProp.strokecolor !== lineColor) {
            //     discretegraphJXG.current.visProp.strokecolor = lineColor;
            //     discretegraphJXG.current.visProp.highlightstrokecolor = lineColor;
            // }
            // if (
            //     discretegraphJXG.current.visProp.strokewidth !==
            //     SVs.selectedStyle.lineWidth
            // ) {
            //     discretegraphJXG.current.visProp.strokewidth =
            //         SVs.selectedStyle.lineWidth;
            //     discretegraphJXG.current.visProp.highlightstrokewidth =
            //         SVs.selectedStyle.lineWidth;
            // }
            // if (
            //     discretegraphJXG.current.visProp.strokeopacity !==
            //     SVs.selectedStyle.lineOpacity
            // ) {
            //     discretegraphJXG.current.visProp.strokeopacity =
            //         SVs.selectedStyle.lineOpacity;
            //     discretegraphJXG.current.visProp.highlightstrokeopacity =
            //         SVs.selectedStyle.lineOpacity * 0.5;
            // }
            // let newDash = styleToDash(SVs.selectedStyle.lineStyle);
            // if (discretegraphJXG.current.visProp.dash !== newDash) {
            //     discretegraphJXG.current.visProp.dash = newDash;
            // }

            // discretegraphJXG.current.name = SVs.labelForGraph;

            // if (discretegraphJXG.current.hasLabel) {
            //     if (SVs.applyStyleToLabel) {
            //         discretegraphJXG.current.label.visProp.strokecolor = lineColor;
            //     } else {
            //         discretegraphJXG.current.label.visProp.strokecolor =
            //             "var(--canvastext)";
            //     }
            //     discretegraphJXG.current.label.needsUpdate = true;
            //     discretegraphJXG.current.label.update();
            // }

            if (
                sourceOfUpdate.sourceInformation &&
                name in sourceOfUpdate.sourceInformation
            ) {
                let vertexUpdated =
                    sourceOfUpdate.sourceInformation[name].vertex;

                if (Number.isFinite(vertexUpdated)) {
                    board.updateInfobox(pointsJXG.current[vertexUpdated]);
                }
            }

            //discretegraphJXG.current.needsUpdate = true;
            //discretegraphJXG.current.update().updateVisibility();
            for (let i = 0; i < SVs.numVertices; i++) {
                // if (layerChanged) {
                //     pointsJXG.current[i].setAttribute({ layer: pointLayer });
                // }
                pointsJXG.current[i].needsUpdate = true;
                pointsJXG.current[i].update();
            }
            for (let i = 0; i < SVs.numEdges; i++) {
                // if (layerChanged) {
                //     pointsJXG.current[i].setAttribute({ layer: pointLayer });
                // }
                edgesJXG.current[i].needsUpdate = true;
                edgesJXG.current[i].update();
            }
            board.updateRenderer();
        }
    }

    if (SVs.hidden) {
        return null;
    }

    // don't think we want to return anything if not in board
    return (
        <>
            <a name={id} />
        </>
    );
});

function styleToDash(style) {
    if (style === "solid") {
        return 0;
    } else if (style === "dashed") {
        return 2;
    } else if (style === "dotted") {
        return 1;
    } else {
        return 0;
    }
}