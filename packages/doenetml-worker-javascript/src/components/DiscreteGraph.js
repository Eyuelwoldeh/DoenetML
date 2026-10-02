import { convertValueToMathExpression } from "@doenet/utils";
import {
    returnNumberDisplayAttributeComponentShadowing,
    returnNumberDisplayAttributes,
    returnNumberDisplayStateVariableDefinitions,
} from "../utils/numberDisplay";
import GraphicalComponent from "./abstract/GraphicalComponent";
import me from "math-expressions";
import { returnStickyGroupDefinitions } from "../utils/constraints";

export default class DiscreteGraph extends GraphicalComponent {
    constructor(args) {
        super(args);

        Object.assign(this.actions, {
            moveDiscreteGraph: this.moveDiscreteGraph.bind(this),
            finalizeDiscreteGraphPosition:
                this.finalizeDiscreteGraphPosition.bind(this),
            discreteGraphClicked: this.discreteGraphClicked.bind(this),
            discreteGraphFocused: this.discreteGraphFocused.bind(this),
        });
    }
    static componentType = "discreteGraph";

    static createAttributesObject() {
        let attributes = super.createAttributesObject();

        attributes.draggable = {
            createComponentOfType: "boolean",
            createStateVariable: "draggable",
            defaultValue: true,
            public: true,
            forRenderer: true,
        };

        attributes.verticesDraggable = {
            createComponentOfType: "boolean",
        };

        attributes.vertices = {
            createComponentOfType: "_pointListComponent",
        };

        attributes.edges = {
            createComponentOfType: "_pointListComponent",
        };

        attributes.showCoordsWhenDragging = {
            createComponentOfType: "boolean",
            createStateVariable: "showCoordsWhenDragging",
            defaultValue: true,
            public: true,
            forRenderer: true,
        };

        Object.assign(attributes, returnNumberDisplayAttributes());

        return attributes;
    }

    static returnChildGroups() {
        let groups = super.returnChildGroups();

        return groups;
    }

    static returnStateVariableDefinitions() {
        let stateVariableDefinitions = super.returnStateVariableDefinitions();

        Object.assign(
            stateVariableDefinitions,
            returnNumberDisplayStateVariableDefinitions(),
        );

        Object.assign(stateVariableDefinitions, returnStickyGroupDefinitions());

        stateVariableDefinitions.styleDescription = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "text",
            },
            returnDependencies: () => ({
                selectedStyle: {
                    dependencyType: "stateVariable",
                    variableName: "selectedStyle",
                },
                document: {
                    dependencyType: "ancestor",
                    componentType: "document",
                    variableNames: ["theme"],
                },
            }),
            definition: function ({ dependencyValues }) {
                let lineColorWord;
                if (dependencyValues.document?.stateValues.theme === "dark") {
                    lineColorWord =
                        dependencyValues.selectedStyle.lineColorWordDarkMode;
                } else {
                    lineColorWord =
                        dependencyValues.selectedStyle.lineColorWord;
                }

                let styleDescription =
                    dependencyValues.selectedStyle.lineWidthWord;
                if (dependencyValues.selectedStyle.lineStyleWord) {
                    if (styleDescription) {
                        styleDescription += " ";
                    }
                    styleDescription +=
                        dependencyValues.selectedStyle.lineStyleWord;
                }

                if (styleDescription) {
                    styleDescription += " ";
                }

                styleDescription += lineColorWord;

                return { setValue: { styleDescription } };
            },
        };

        stateVariableDefinitions.styleDescriptionWithNoun = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "text",
            },
            returnDependencies: () => ({
                styleDescription: {
                    dependencyType: "stateVariable",
                    variableName: "styleDescription",
                },
            }),
            definition: function ({ dependencyValues }) {
                let styleDescriptionWithNoun =
                    dependencyValues.styleDescription + " discrete graph";

                return { setValue: { styleDescriptionWithNoun } };
            },
        };

        stateVariableDefinitions.verticesDraggable = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "boolean",
            },
            hasEssential: true,
            forRenderer: true,
            returnDependencies: () => ({
                verticesDraggableAttr: {
                    dependencyType: "attributeComponent",
                    attributeName: "verticesDraggable",
                    variableNames: ["value"],
                },
                draggable: {
                    dependencyType: "stateVariable",
                    variableName: "draggable",
                },
            }),
            definition({ dependencyValues }) {
                if (dependencyValues.verticesDraggableAttr) {
                    return {
                        setValue: {
                            verticesDraggable:
                                dependencyValues.verticesDraggableAttr
                                    .stateValues.value,
                        },
                    };
                } else {
                    return {
                        useEssentialOrDefaultValue: {
                            verticesDraggable: {
                                defaultValue: dependencyValues.draggable,
                            },
                        },
                    };
                }
            },
        };

        stateVariableDefinitions.vertexIndicesDraggable = {
            forRenderer: true,
            returnDependencies: () => ({
                verticesDraggable: {
                    dependencyType: "stateVariable",
                    variableName: "verticesDraggable",
                },
                numVertices: {
                    dependencyType: "stateVariable",
                    variableName: "numVertices",
                },
            }),
            definition({ dependencyValues }) {
                let vertexIndicesDraggable = [];

                if (dependencyValues.verticesDraggable) {
                    
                        vertexIndicesDraggable = [
                            ...Array(dependencyValues.numVertices).keys(),
                        ];
                }
                return { setValue: { vertexIndicesDraggable } };
            },
        };

        stateVariableDefinitions.numVertices = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "number",
            },
            forRenderer: true,
            returnDependencies: () => ({
                vertices: {
                    dependencyType: "attributeComponent",
                    attributeName: "vertices",
                    variableNames: ["numPoints"],
                },
            }),
            definition: function ({ dependencyValues }) {
                if (dependencyValues.vertices !== null) {
                    return {
                        setValue: {
                            numVertices:
                                dependencyValues.vertices.stateValues.numPoints,
                        },
                    };
                } else {
                    return { setValue: { numVertices: 0 } };
                }
            },
        };

        stateVariableDefinitions.numEdges = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "number",
            },
            forRenderer: true,
            returnDependencies: () => ({
                edges: {
                    dependencyType: "attributeComponent",
                    attributeName: "edges",
                    variableNames: ["numPoints"],
                },
            }),
            definition: function ({ dependencyValues }) {
                if (dependencyValues.edges !== null) {
                    return {
                        setValue: {
                            numEdges:
                                dependencyValues.edges.stateValues.numPoints,
                        },
                    };
                } else {
                    return { setValue: { numEdges: 0 } };
                }
            },
        };

        stateVariableDefinitions.numDimensions = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "number",
            },
            returnDependencies() {
                return {
                    vertices: {
                        dependencyType: "attributeComponent",
                        attributeName: "vertices",
                        variableNames: ["numDimensions"],
                    },
                };
            },
            definition: function ({ dependencyValues }) {
                if (dependencyValues.vertices !== null) {
                    let numDimensions =
                        dependencyValues.vertices.stateValues.numDimensions;
                    return {
                        setValue: { numDimensions: Math.max(2, numDimensions) },
                        checkForActualChange: { numDimensions: true },
                    };
                } else {
                    // graph with zero vertices
                    return { setValue: { numDimensions: 2 } };
                }
            },
        };

        // Variable to store the desired value when inverting unconstrainedVertices.
        // Used in movePolygon to detect if constraints changed a value.
        stateVariableDefinitions.desiredUnconstrainedVertices = {
            isArray: true,
            numDimensions: 2,
            hasEssential: true,
            doNotShadowEssential: true,
            entryPrefixes: [
                "desiredUnconstrainedVertexX",
                "desiredUnconstrainedVertex",
            ],
            defaultValueByArrayKey: () => null,
            getArrayKeysFromVarName({
                arrayEntryPrefix,
                varEnding,
                arraySize,
            }) {
                if (arrayEntryPrefix === "desiredUnconstrainedVertexX") {
                    // vertexX1_2 is the 2nd component of the first vertex
                    let indices = varEnding
                        .split("_")
                        .map((x) => Number(x) - 1);
                    if (
                        indices.length === 2 &&
                        indices.every((x, i) => Number.isInteger(x) && x >= 0)
                    ) {
                        if (arraySize) {
                            if (indices.every((x, i) => x < arraySize[i])) {
                                return [String(indices)];
                            } else {
                                return [];
                            }
                        } else {
                            // If not given the array size,
                            // then return the array keys assuming the array is large enough.
                            // Must do this as it is used to determine potential array entries.
                            return [String(indices)];
                        }
                    } else {
                        return [];
                    }
                } else {
                    // vertex3 is all components of the third vertex

                    let pointInd = Number(varEnding) - 1;
                    if (!(Number.isInteger(pointInd) && pointInd >= 0)) {
                        return [];
                    }

                    if (!arraySize) {
                        // If don't have array size, we just need to determine if it is a potential entry.
                        // Return the first entry assuming array is large enough
                        return [pointInd + ",0"];
                    }
                    if (pointInd < arraySize[0]) {
                        // array of "pointInd,i", where i=0, ..., arraySize[1]-1
                        return Array.from(
                            Array(arraySize[1]),
                            (_, i) => pointInd + "," + i,
                        );
                    } else {
                        return [];
                    }
                }
            },
            returnArraySizeDependencies: () => ({
                numVertices: {
                    dependencyType: "stateVariable",
                    variableName: "numVertices",
                },
                numDimensions: {
                    dependencyType: "stateVariable",
                    variableName: "numDimensions",
                },
            }),
            returnArraySize({ dependencyValues }) {
                return [
                    dependencyValues.numVertices,
                    dependencyValues.numDimensions,
                ];
            },
            returnArrayDependenciesByKey() {
                return { dependenciesByKey: {} };
            },
            arrayDefinitionByKey({ arrayKeys }) {
                let useEssential = {};

                for (let arrayKey of arrayKeys) {
                    useEssential[arrayKey] = true;
                }

                return {
                    useEssentialOrDefaultValue: {
                        desiredUnconstrainedVertices: useEssential,
                    },
                };
            },
            async inverseArrayDefinitionByKey({ desiredStateVariableValues }) {
                let essentialVertices = {};

                for (let arrayKey in desiredStateVariableValues.desiredUnconstrainedVertices) {
                    essentialVertices[arrayKey] =
                        desiredStateVariableValues.desiredUnconstrainedVertices[
                            arrayKey
                        ];
                }

                return {
                    success: true,
                    instructions: [
                        {
                            setEssentialValue: "desiredUnconstrainedVertices",
                            value: essentialVertices,
                        },
                    ],
                };
            },
        };

        stateVariableDefinitions.unconstrainedVertices = {
            isLocation: true,
            isArray: true,
            numDimensions: 2,
            entryPrefixes: ["unconstrainedVertexX", "unconstrainedVertex"],
            returnEntryDimensions: (prefix) =>
                prefix === "unconstrainedVertex" ? 1 : 0,
            getArrayKeysFromVarName({
                arrayEntryPrefix,
                varEnding,
                arraySize,
            }) {
                if (arrayEntryPrefix === "unconstrainedVertexX") {
                    // vertexX1_2 is the 2nd component of the first vertex
                    let indices = varEnding
                        .split("_")
                        .map((x) => Number(x) - 1);
                    if (
                        indices.length === 2 &&
                        indices.every((x, i) => Number.isInteger(x) && x >= 0)
                    ) {
                        if (arraySize) {
                            if (indices.every((x, i) => x < arraySize[i])) {
                                return [String(indices)];
                            } else {
                                return [];
                            }
                        } else {
                            // If not given the array size,
                            // then return the array keys assuming the array is large enough.
                            // Must do this as it is used to determine potential array entries.
                            return [String(indices)];
                        }
                    } else {
                        return [];
                    }
                } else {
                    // vertex3 is all components of the third vertex

                    let pointInd = Number(varEnding) - 1;
                    if (!(Number.isInteger(pointInd) && pointInd >= 0)) {
                        return [];
                    }

                    if (!arraySize) {
                        // If don't have array size, we just need to determine if it is a potential entry.
                        // Return the first entry assuming array is large enough
                        return [pointInd + ",0"];
                    }
                    if (pointInd < arraySize[0]) {
                        // array of "pointInd,i", where i=0, ..., arraySize[1]-1
                        return Array.from(
                            Array(arraySize[1]),
                            (_, i) => pointInd + "," + i,
                        );
                    } else {
                        return [];
                    }
                }
            },
            getAllArrayKeys(arraySize, flatten = true, desiredSize) {
                function getAllArrayKeysSub(subArraySize) {
                    if (subArraySize.length === 1) {
                        // array of numbers from 0 to subArraySize[0], cast to strings
                        return Array.from(Array(subArraySize[0]), (_, i) =>
                            String(i),
                        );
                    } else {
                        let currentSize = subArraySize[0];
                        let subSubKeys = getAllArrayKeysSub(
                            subArraySize.slice(1),
                        );
                        let subKeys = [];
                        for (let ind = 0; ind < currentSize; ind++) {
                            if (flatten) {
                                subKeys.push(
                                    ...subSubKeys.map((x) => ind + "," + x),
                                );
                            } else {
                                subKeys.push(
                                    subSubKeys.map((x) => ind + "," + x),
                                );
                            }
                        }
                        return subKeys;
                    }
                }

                if (desiredSize) {
                    // if have desired size, then assume specify size after wrapping components
                    // I.e., use actual array size, with first component
                    // replaced with desired size
                    if (desiredSize.length === 0 || !arraySize) {
                        return [];
                    } else {
                        let desiredSizeOfWholeArray = [...arraySize];
                        desiredSizeOfWholeArray[0] = desiredSize[0];
                        return getAllArrayKeysSub(desiredSizeOfWholeArray);
                    }
                } else if (!arraySize || arraySize.length === 0) {
                    return [];
                } else {
                    return getAllArrayKeysSub(arraySize);
                }
            },
            arrayVarNameFromPropIndex(propIndex, varName) {
                if (varName === "unconstrainedVertices") {
                    if (propIndex.length === 1) {
                        return "unconstrainedVertex" + propIndex[0];
                    } else {
                        // if propIndex has additional entries, ignore them
                        return `unconstrainedVertexX${propIndex[0]}_${propIndex[1]}`;
                    }
                }
                if (varName.slice(0, 19) === "unconstrainedVertex") {
                    // could be vertex or vertexX
                    let vertexNum = Number(varName.slice(19));
                    if (Number.isInteger(vertexNum) && vertexNum > 0) {
                        // if propIndex has additional entries, ignore them
                        return `unconstrainedVertexX${vertexNum}_${propIndex[0]}`;
                    }
                }
                return null;
            },
            returnArraySizeDependencies: () => ({
                numVertices: {
                    dependencyType: "stateVariable",
                    variableName: "numVertices",
                },
                numDimensions: {
                    dependencyType: "stateVariable",
                    variableName: "numDimensions",
                },
            }),
            returnArraySize({ dependencyValues }) {
                return [
                    dependencyValues.numVertices,
                    dependencyValues.numDimensions,
                ];
            },
            returnArrayDependenciesByKey({ arrayKeys }) {
                let dependenciesByKey = {};
                for (let arrayKey of arrayKeys) {
                    let [pointInd, dim] = arrayKey.split(",");
                    let varEnding =
                        Number(pointInd) + 1 + "_" + (Number(dim) + 1);

                    dependenciesByKey[arrayKey] = {
                        vertices: {
                            dependencyType: "attributeComponent",
                            attributeName: "vertices",
                            variableNames: ["pointX" + varEnding],
                        },
                        // just for inverse definition
                        desiredUnconstrainedVertices: {
                            dependencyType: "stateVariable",
                            variableName:
                                "desiredUnconstrainedVertexX" + varEnding,
                        },
                    };
                }
                return { dependenciesByKey };
            },
            arrayDefinitionByKey({ dependencyValuesByKey, arrayKeys }) {
                // console.log('array definition of polyline unconstrainedVertices');
                // console.log(JSON.parse(JSON.stringify(dependencyValuesByKey)))
                // console.log(arrayKeys);

                let unconstrainedVertices = {};

                for (let arrayKey of arrayKeys) {
                    let [pointInd, dim] = arrayKey.split(",");
                    let varEnding =
                        Number(pointInd) + 1 + "_" + (Number(dim) + 1);

                    let verticesAttr = dependencyValuesByKey[arrayKey].vertices;
                    if (
                        verticesAttr !== null &&
                        verticesAttr.stateValues["pointX" + varEnding]
                    ) {
                        unconstrainedVertices[arrayKey] =
                            verticesAttr.stateValues["pointX" + varEnding];
                    } else {
                        unconstrainedVertices[arrayKey] = me.fromAst("\uff3f");
                    }
                }

                return { setValue: { unconstrainedVertices } };
            },
            async inverseArrayDefinitionByKey({
                desiredStateVariableValues,
                dependencyValuesByKey,
                dependencyNamesByKey,
                initialChange,
                stateValues,
            }) {
                // console.log(`inverseArrayDefinition of unconstrainedVertices of polyline`);
                // console.log(desiredStateVariableValues)
                // console.log(JSON.parse(JSON.stringify(stateValues)))
                // console.log(dependencyValuesByKey);

                let instructions = [];

                for (let arrayKey in desiredStateVariableValues.unconstrainedVertices) {
                    let [pointInd, dim] = arrayKey.split(",");
                    let varEnding =
                        Number(pointInd) + 1 + "_" + (Number(dim) + 1);

                    if (
                        dependencyValuesByKey[arrayKey].vertices !== null &&
                        dependencyValuesByKey[arrayKey].vertices.stateValues[
                            "pointX" + varEnding
                        ]
                    ) {
                        instructions.push({
                            setDependency:
                                dependencyNamesByKey[arrayKey].vertices,
                            desiredValue:
                                desiredStateVariableValues
                                    .unconstrainedVertices[arrayKey],
                            variableIndex: 0,
                        });

                        instructions.push({
                            setDependency:
                                dependencyNamesByKey[arrayKey]
                                    .desiredUnconstrainedVertices,
                            desiredValue:
                                desiredStateVariableValues
                                    .unconstrainedVertices[arrayKey],
                        });
                    } else {
                        return { success: false };
                    }
                }

                return {
                    success: true,
                    instructions,
                };
            },
        };

        stateVariableDefinitions.haveConstrainedVertices = {
            returnDependencies: () => ({
                inStickyGroup: {
                    dependencyType: "stateVariable",
                    variableName: "inStickyGroup",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: {
                        haveConstrainedVertices:
                            dependencyValues.inStickyGroup,
                    },
                };
            },
        };

        stateVariableDefinitions.vertices = {
            public: true,
            isLocation: true,
            shadowingInstructions: {
                createComponentOfType: "math",
                addAttributeComponentsShadowingStateVariables:
                    returnNumberDisplayAttributeComponentShadowing(),
                returnWrappingComponents(prefix) {
                    if (prefix === "vertexX") {
                        return [];
                    } else {
                        // vertex or entire array
                        // wrap inner dimension by both <point> and <xs>
                        // don't wrap outer dimension (for entire array)
                        return [
                            [
                                "point",
                                {
                                    componentType: "mathList",
                                    isAttributeNamed: "xs",
                                },
                            ],
                        ];
                    }
                },
            },
            isArray: true,
            numDimensions: 2,
            entryPrefixes: ["vertexX", "vertex"],
            returnEntryDimensions: (prefix) => (prefix === "vertex" ? 1 : 0),
            getArrayKeysFromVarName({
                arrayEntryPrefix,
                varEnding,
                arraySize,
            }) {
                if (arrayEntryPrefix === "vertexX") {
                    // vertexX1_2 is the 2nd component of the first vertex
                    let indices = varEnding
                        .split("_")
                        .map((x) => Number(x) - 1);
                    if (
                        indices.length === 2 &&
                        indices.every((x, i) => Number.isInteger(x) && x >= 0)
                    ) {
                        if (arraySize) {
                            if (indices.every((x, i) => x < arraySize[i])) {
                                return [String(indices)];
                            } else {
                                return [];
                            }
                        } else {
                            // If not given the array size,
                            // then return the array keys assuming the array is large enough.
                            // Must do this as it is used to determine potential array entries.
                            return [String(indices)];
                        }
                    } else {
                        return [];
                    }
                } else {
                    // vertex3 is all components of the third vertex

                    let pointInd = Number(varEnding) - 1;
                    if (!(Number.isInteger(pointInd) && pointInd >= 0)) {
                        return [];
                    }

                    if (!arraySize) {
                        // If don't have array size, we just need to determine if it is a potential entry.
                        // Return the first entry assuming array is large enough
                        return [pointInd + ",0"];
                    }
                    if (pointInd < arraySize[0]) {
                        // array of "pointInd,i", where i=0, ..., arraySize[1]-1
                        return Array.from(
                            Array(arraySize[1]),
                            (_, i) => pointInd + "," + i,
                        );
                    } else {
                        return [];
                    }
                }
            },
            getAllArrayKeys(arraySize, flatten = true, desiredSize) {
                function getAllArrayKeysSub(subArraySize) {
                    if (subArraySize.length === 1) {
                        // array of numbers from 0 to subArraySize[0], cast to strings
                        return Array.from(Array(subArraySize[0]), (_, i) =>
                            String(i),
                        );
                    } else {
                        let currentSize = subArraySize[0];
                        let subSubKeys = getAllArrayKeysSub(
                            subArraySize.slice(1),
                        );
                        let subKeys = [];
                        for (let ind = 0; ind < currentSize; ind++) {
                            if (flatten) {
                                subKeys.push(
                                    ...subSubKeys.map((x) => ind + "," + x),
                                );
                            } else {
                                subKeys.push(
                                    subSubKeys.map((x) => ind + "," + x),
                                );
                            }
                        }
                        return subKeys;
                    }
                }

                if (desiredSize) {
                    // if have desired size, then assume specify size after wrapping components
                    // I.e., use actual array size, with first component
                    // replaced with desired size
                    if (desiredSize.length === 0 || !arraySize) {
                        return [];
                    } else {
                        let desiredSizeOfWholeArray = [...arraySize];
                        desiredSizeOfWholeArray[0] = desiredSize[0];
                        return getAllArrayKeysSub(desiredSizeOfWholeArray);
                    }
                } else if (!arraySize || arraySize.length === 0) {
                    return [];
                } else {
                    return getAllArrayKeysSub(arraySize);
                }
            },
            arrayVarNameFromPropIndex(propIndex, varName) {
                if (varName === "vertices") {
                    if (propIndex.length === 1) {
                        return "vertex" + propIndex[0];
                    } else {
                        // if propIndex has additional entries, ignore them
                        return `vertexX${propIndex[0]}_${propIndex[1]}`;
                    }
                }
                if (varName.slice(0, 6) === "vertex") {
                    // could be vertex or vertexX
                    let vertexNum = Number(varName.slice(6));
                    if (Number.isInteger(vertexNum) && vertexNum > 0) {
                        // if propIndex has additional entries, ignore them
                        return `vertexX${vertexNum}_${propIndex[0]}`;
                    }
                }
                return null;
            },
            returnArraySizeDependencies: () => ({
                numVertices: {
                    dependencyType: "stateVariable",
                    variableName: "numVertices",
                },
                numDimensions: {
                    dependencyType: "stateVariable",
                    variableName: "numDimensions",
                },
            }),
            returnArraySize({ dependencyValues }) {
                return [
                    dependencyValues.numVertices,
                    dependencyValues.numDimensions,
                ];
            },
            stateVariablesDeterminingDependencies: [
                "haveConstrainedVertices",
            ],
            returnArrayDependenciesByKey({ arrayKeys, stateValues }) {
                let globalDependencies = {
                    haveConstrainedVertices: {
                        dependencyType: "stateVariable",
                        variableName: "haveConstrainedVertices",
                    },
                };
                let dependenciesByKey = {};
                if (
                    stateValues.haveConstrainedVertices
                ) {
                    globalDependencies.unconstrainedVertices = {
                        dependencyType: "stateVariable",
                        variableName: "unconstrainedVertices",
                    };
                } else {
                    for (let arrayKey of arrayKeys) {
                        let [pointInd, dim] = arrayKey.split(",");
                        let varEnding =
                            Number(pointInd) + 1 + "_" + (Number(dim) + 1);

                        dependenciesByKey[arrayKey] = {
                            unconstrainedVertex: {
                                dependencyType: "stateVariable",
                                variableName:
                                    "unconstrainedVertexX" + varEnding,
                            },
                        };
                    }
                }
                return { globalDependencies, dependenciesByKey };
            },
            arrayDefinitionByKey({
                globalDependencyValues,
                dependencyValuesByKey,
                arrayKeys,
                arraySize,
            }) {

                let vertices = {};

                if (globalDependencyValues.haveConstrainedVertices) {
                    let constrainedVertices =
                        globalDependencyValues.unconstrainedVertices;

                    for (
                        let pointInd = 0;
                        pointInd < arraySize[0];
                        pointInd++
                    ) {
                        for (let dim = 0; dim < arraySize[1]; dim++) {
                            let arrayKey = pointInd + "," + dim;
                            vertices[arrayKey] =
                                constrainedVertices[pointInd][dim];
                        }
                    }
                } else {
                    // if we don't have constrainedVertices
                    // just copy the unconstrained vertices from the dependency values by key
                    for (let arrayKey of arrayKeys) {
                        vertices[arrayKey] =
                            dependencyValuesByKey[arrayKey].unconstrainedVertex;
                    }
                }

                return { setValue: { vertices } };
            },
            async inverseArrayDefinitionByKey({
                desiredStateVariableValues,
                globalDependencyValues,
                dependencyValuesByKey,
                dependencyNamesByKey,
                initialChange,
                stateValues,
                arraySize,
                workspace,
            }) {

                let instructions = [];

                let movedJustOneVertex = false;
                let vertexIndMoved;

                // We have to accumulate changed vertices in workspace
                // as in some cases (such as when moving via an attached point)
                // the instructions for the components come in separately
                Object.assign(workspace, desiredStateVariableValues.vertices);

                let nMoved = Object.keys(workspace).length;
                if (nMoved === 1) {
                    movedJustOneVertex = true;
                    vertexIndMoved = Number(
                        Object.keys(workspace)[0].split(",")[0],
                    );
                } else if (nMoved === 2) {
                    let pointInd1 = Object.keys(workspace)[0].split(",")[0];
                    let pointInd2 = Object.keys(workspace)[1].split(",")[0];
                    if (pointInd1 === pointInd2) {
                        movedJustOneVertex = true;
                        vertexIndMoved = Number(pointInd1);
                    }
                }

                
                    if (globalDependencyValues.haveConstrainedVertices) {
                        // for case with constraints,
                        // go through the constraints so that will set the vertices
                        // to their constrained values

                        let vertices = await stateValues.vertices;
                        let desired_vertices = [];

                        for (
                            let pointInd = 0;
                            pointInd < arraySize[0];
                            pointInd++
                        ) {
                            let desired_vertex = [];

                            let original_vertex = vertices[pointInd];

                            for (let dim = 0; dim < arraySize[1]; dim++) {
                                let arrayKey = pointInd + "," + dim;
                                if (arrayKey in workspace) {
                                    desired_vertex.push(workspace[arrayKey]);
                                } else {
                                    desired_vertex.push(original_vertex[dim]);
                                }
                            }
                            desired_vertices.push(desired_vertex);
                        }

                        // If moved just one vertex, allow the shape to distort due to constraints and the edges to rotate.
                        // Otherwise, just shift the graph due to the constraints
                        let enforceRigid = !movedJustOneVertex;
                        let allowRotation = movedJustOneVertex;

                        if (await stateValues.inStickyGroup) {
                            let stickyObjectIndex =
                                await stateValues.stickyObjectIndex;
                            let stickyVerticesConstraintFunction =
                                await stateValues.stickyVerticesConstraintFunction;

                            desired_vertices = stickyVerticesConstraintFunction(
                                {
                                    unconstrainedVertices: desired_vertices,
                                    enforceRigid,
                                    allowRotation,
                                    shrinkThreshold: false,
                                    vertexIndMoved,
                                },
                                { objectInd: stickyObjectIndex },
                            );
                        }

                        instructions.push({
                            setDependency: "unconstrainedVertices",
                            desiredValue: desired_vertices,
                        });
                    } else {
                        // for non-constrained case, we just move the unconstrained vertices
                        // according to how the vertices were moved

                        for (let arrayKey in desiredStateVariableValues.vertices) {
                            instructions.push({
                                setDependency:
                                    dependencyNamesByKey[arrayKey]
                                        .unconstrainedVertex,
                                desiredValue:
                                    desiredStateVariableValues.vertices[
                                        arrayKey
                                    ],
                            });
                        }
                    }
                

                return {
                    success: true,
                    instructions,
                };
            },
        };

        stateVariableDefinitions.edges = {
            public: true,
            isLocation: true,
            shadowingInstructions: {
                createComponentOfType: "number",
                returnWrappingComponents(prefix) {
                    //makes edge1, edge[1] a point
                    if (prefix === "edgeVertex") {
                        return [];
                    } else {
                        // vertex or entire array
                        // wrap inner dimension by both <point> and <xs>
                        // don't wrap outer dimension (for entire array)
                        return [
                            [
                                "point",
                                {
                                    componentType: "mathList",
                                    isAttributeNamed: "xs",
                                },
                            ],
                        ];
                    }
                },
            },
            isArray: true,
            numDimensions: 2, //array dimensions
            entryPrefixes: ["edgeVertex", "edge"],
            forRenderer: true,
            returnEntryDimensions: (prefix) => (prefix === "edge" ? 1 : 0),
            getArrayKeysFromVarName({
                arrayEntryPrefix,
                varEnding,
                arraySize,
            }) {
                if (arrayEntryPrefix === "edgeVertex") {
                    // edgeVertex1_2 is the 2nd vertex of the first edge
                    let indices = varEnding
                        .split("_")
                        .map((x) => Number(x) - 1);
                    if (
                        indices.length === 2 &&
                        indices.every((x, i) => Number.isInteger(x) && x >= 0)
                    ) {
                        if (arraySize) {
                            if (indices.every((x, i) => x < arraySize[i])) {
                                return [String(indices)];
                            } else {
                                return [];
                            }
                        } else {
                            // If not given the array size,
                            // then return the array keys assuming the array is large enough.
                            // Must do this as it is used to determine potential array entries.
                            return [String(indices)];
                        }
                    } else {
                        return [];
                    }
                } else {
                    // edge3 is both vertices of the third edge

                    let edgeInd = Number(varEnding) - 1;
                    if (!(Number.isInteger(edgeInd) && edgeInd >= 0)) {
                        return [];
                    }

                    if (!arraySize) {
                        // If don't have array size, we just need to determine if it is a potential entry.
                        // Return the first entry assuming array is large enough
                        return [edgeInd + ",0"];
                    }
                    if (edgeInd < arraySize[0]) {
                        // array of "edgeInd,i", where i=0, ..., arraySize[1]-1
                        return Array.from(
                            Array(arraySize[1]),
                            (_, i) => edgeInd + "," + i,
                        );
                    } else {
                        return [];
                    }
                }
            },
            getAllArrayKeys(arraySize, flatten = true, desiredSize) {
                function getAllArrayKeysSub(subArraySize) {
                    if (subArraySize.length === 1) {
                        // array of numbers from 0 to subArraySize[0], cast to strings
                        return Array.from(Array(subArraySize[0]), (_, i) =>
                            String(i),
                        );
                    } else {
                        let currentSize = subArraySize[0];
                        let subSubKeys = getAllArrayKeysSub(
                            subArraySize.slice(1),
                        );
                        let subKeys = [];
                        for (let ind = 0; ind < currentSize; ind++) {
                            if (flatten) {
                                subKeys.push(
                                    ...subSubKeys.map((x) => ind + "," + x),
                                );
                            } else {
                                subKeys.push(
                                    subSubKeys.map((x) => ind + "," + x),
                                );
                            }
                        }
                        return subKeys;
                    }
                }

                if (desiredSize) {
                    // if have desired size, then assume specify size after wrapping components
                    // I.e., use actual array size, with first component
                    // replaced with desired size
                    if (desiredSize.length === 0 || !arraySize) {
                        return [];
                    } else {
                        let desiredSizeOfWholeArray = [...arraySize];
                        desiredSizeOfWholeArray[0] = desiredSize[0];
                        return getAllArrayKeysSub(desiredSizeOfWholeArray);
                    }
                } else if (!arraySize || arraySize.length === 0) {
                    return [];
                } else {
                    return getAllArrayKeysSub(arraySize);
                }
            },
            arrayVarNameFromPropIndex(propIndex, varName) {
                if (varName === "edges") {
                    // makes edges[1][1] work
                    if (propIndex.length === 1) {
                        return "edge" + propIndex[0];
                    } else {
                        // if propIndex has additional entries, ignore them
                        return `edgeVertex${propIndex[0]}_${propIndex[1]}`;
                    }
                } else if (varName.slice(0, 10) !== "edgeVertex") {
                    // must be "edge" followed by number
                    // makes edge1[1] work
                    let edgeNum = Number(varName.slice(4));
                    if (Number.isInteger(edgeNum) && edgeNum > 0) {
                        // if propIndex has additional entries, ignore them
                        return `edgeVertex${edgeNum}_${propIndex[0]}`;
                    }
                }
                return null;
            },
            returnArraySizeDependencies: () => ({
                numEdges: {
                    dependencyType: "stateVariable",
                    variableName: "numEdges",
                },
            }),
            returnArraySize({ dependencyValues }) {
                return [
                    dependencyValues.numEdges,
                    2, // edges always have two vertices
                ];
            },
            returnArrayDependenciesByKey({ arrayKeys }) {
                let dependenciesByKey = {};

                for (let arrayKey of arrayKeys) {
                    let [edgeInd, vertexInd] = arrayKey.split(",");
                    let varEnding =
                        Number(edgeInd) + 1 + "_" + (Number(vertexInd) + 1);

                    dependenciesByKey[arrayKey] = {
                        edges: {
                            dependencyType: "attributeComponent",
                            attributeName: "edges",
                            variableNames: ["pointX" + varEnding],
                        },
                    };
                }

                return { dependenciesByKey };
            },
            arrayDefinitionByKey({ dependencyValuesByKey, arrayKeys }) {
                let edges = {};

                for (let arrayKey of arrayKeys) {
                    let [edgeInd, vertexInd] = arrayKey.split(",");
                    let varEnding =
                        Number(edgeInd) + 1 + "_" + (Number(vertexInd) + 1);

                    let edgesAttr = dependencyValuesByKey[arrayKey].edges;
                    if (
                        edgesAttr !== null &&
                        edgesAttr.stateValues["pointX" + varEnding]
                    ) {
                        edges[arrayKey] =
                            edgesAttr.stateValues[
                                "pointX" + varEnding
                            ].evaluate_to_constant();
                    } else {
                        edges[arrayKey] = NaN;
                    }
                }

                return { setValue: { edges } };
            },
        };

        stateVariableDefinitions.numericalVertices = {
            isArray: true,
            entryPrefixes: ["numericalVertex"],
            forRenderer: true,
            returnArraySizeDependencies: () => ({
                numVertices: {
                    dependencyType: "stateVariable",
                    variableName: "numVertices",
                },
            }),
            returnArraySize({ dependencyValues }) {
                return [dependencyValues.numVertices];
            },
            returnArrayDependenciesByKey({ arrayKeys }) {
                let dependenciesByKey = {};

                for (let arrayKey of arrayKeys) {
                    dependenciesByKey[arrayKey] = {
                        vertex: {
                            dependencyType: "stateVariable",
                            variableName: "vertex" + (Number(arrayKey) + 1),
                        },
                    };
                }

                return { dependenciesByKey };
            },
            arrayDefinitionByKey({ dependencyValuesByKey, arrayKeys }) {
                let numericalVertices = {};

                for (let arrayKey of arrayKeys) {
                    let vert = dependencyValuesByKey[arrayKey].vertex.map((x) =>
                        x.evaluate_to_constant(),
                    );
                    if (!vert.every((x) => Number.isFinite(x))) {
                        vert = Array(vert.length).fill(NaN);
                    }
                    numericalVertices[arrayKey] = vert;
                }

                return { setValue: { numericalVertices } };
            },
        };

        return stateVariableDefinitions;
    }

    async moveDiscreteGraph({
        pointCoords,
        transient,
        sourceDetails,
        actionId,
        sourceInformation = {},
        skipRendererUpdate = false,
    }) {
        console.log(pointCoords);

        let numVerticesMoved = Object.keys(pointCoords).length;

        if (numVerticesMoved === 1) {
            // single vertex dragged
            if (!(await this.stateValues.verticesDraggable)) {
                return;
            }
        } else {
            // whole polyline dragged
            if (!(await this.stateValues.draggable)) {
                return;
            }
        }

        let vertexComponents = {};
        for (let ind in pointCoords) {
            vertexComponents[ind + ",0"] = me.fromAst(pointCoords[ind][0]);
            vertexComponents[ind + ",1"] = me.fromAst(pointCoords[ind][1]);
        }

        //console.log(vertexComponents);

        if (transient) {
            await this.coreFunctions.performUpdate({
                updateInstructions: [
                    {
                        updateType: "updateValue",
                        componentName: this.componentName,
                        stateVariable: "vertices",
                        value: vertexComponents,
                        sourceDetails,
                    },
                ],
                transient,
                actionId,
                sourceInformation,
                skipRendererUpdate,
            });
        } else {
            await this.coreFunctions.performUpdate({
                updateInstructions: [
                    {
                        updateType: "updateValue",
                        componentName: this.componentName,
                        stateVariable: "vertices",
                        value: vertexComponents,
                        sourceDetails,
                    },
                ],
                actionId,
                sourceInformation,
                skipRendererUpdate,
                event: {
                    verb: "interacted",
                    object: {
                        componentName: this.componentName,
                        componentType: this.componentType,
                    },
                    result: {
                        pointCoordinates: pointCoords,
                    },
                },
            });
        }

        // we will attempt to preserve the relationship among all the vertices
        // so that we have a rigid translation
        // when the whole polyline is moved or preserveSimilarity is true.
        // This procedure may preserve the rigid/similarity transformation
        // even if a subset of the vertices are constrained.
        // Note: If desiredUnconstrainedVertices has null components, then the original update was not successful.
        
        /* 
        let desiredUnconstrainedVertices =
            await this.stateValues.desiredUnconstrainedVertices;
        console.log(desiredUnconstrainedVertices);
        if (
            (numVerticesMoved > 1) &&
            desiredUnconstrainedVertices[0][0] != null
        ) {
            let desiredNumericalVertices = desiredUnconstrainedVertices.map(
                (vertex) => vertex.map((v) => v.evaluate_to_constant()),
            );
            let resultingNumericalVertices =
                await this.stateValues.numericalVertices;
            let numVertices = await this.stateValues.numVertices;

            let verticesChanged = [];
            let numVerticesChanged = 0;
            let tol = 1e-6;

            for (let [ind, vrtx] of desiredNumericalVertices.entries()) {
                if (
                    !vrtx.every(
                        (v, i) =>
                            Math.abs(v - resultingNumericalVertices[ind][i]) <
                            tol,
                    )
                ) {
                    verticesChanged.push(ind);
                    numVerticesChanged++;
                }
            }

            if (numVerticesChanged > 0 && numVerticesChanged < numVertices) {
                // A subset of points were altered from the requested location.
                // Check to see if the relationship among them is preserved

                let changedInd1 = verticesChanged[0];
                let relationshipPreserved = true;

                let orig1 = desiredNumericalVertices[changedInd1];
                let changed1 = resultingNumericalVertices[changedInd1];
                let changevec1 = orig1.map((v, i) => v - changed1[i]);

                if (numVerticesChanged > 1) {
                    for (let ind of verticesChanged.slice(1)) {
                        let orig2 = desiredNumericalVertices[ind];
                        let changed2 = resultingNumericalVertices[ind];
                        let changevec2 = orig2.map((v, i) => v - changed2[i]);

                        if (
                            !changevec1.every(
                                (v, i) => Math.abs(v - changevec2[i]) < tol,
                            )
                        ) {
                            relationshipPreserved = false;
                            break;
                        }
                    }
                }

                if (relationshipPreserved) {
                    // All the vertices that were altered from their requested location
                    // were altered in a way consistent with a rigid translation.
                    // Attempt to move the remaining vertices to achieve a rigid translation
                    // of the whole polyline.
                    let newNumericalVertices = [];

                    for (let i = 0; i < numVertices; i++) {
                        if (verticesChanged.includes(i)) {
                            newNumericalVertices.push(
                                resultingNumericalVertices[i],
                            );
                        } else {
                            newNumericalVertices.push(
                                desiredNumericalVertices[i].map(
                                    (v, j) => v - changevec1[j],
                                ),
                            );
                        }
                    }

                    let newVertexComponents = {};
                    for (let ind in newNumericalVertices) {
                        newVertexComponents[ind + ",0"] = me.fromAst(
                            newNumericalVertices[ind][0],
                        );
                        newVertexComponents[ind + ",1"] = me.fromAst(
                            newNumericalVertices[ind][1],
                        );
                    }

                    let newInstructions = [
                        {
                            updateType: "updateValue",
                            componentName: this.componentName,
                            stateVariable: "unconstrainedVertices",
                            value: newVertexComponents,
                        },
                    ];
                    return await this.coreFunctions.performUpdate({
                        updateInstructions: newInstructions,
                        transient,
                        actionId,
                        sourceInformation,
                        skipRendererUpdate,
                    });
                }
            }
        } */

        // if no modifications were made, still need to update renderers
        // as original update was performed with skipping renderer update
        /* return await this.coreFunctions.updateRenderers({
            actionId,
            sourceInformation,
            skipRendererUpdate,
        }); */
    }

    async finalizeDiscreteGraphPosition({
        actionId,
        sourceInformation = {},
        skipRendererUpdate = false,
    }) {
        // trigger a movePolyline
        // to send the final values with transient=false
        // so that the final position will be recorded

        return await this.actions.moveDiscreteGraph({
            pointCoords: await this.stateValues.numericalVertices,
            transient: false,
            actionId,
            sourceInformation,
            skipRendererUpdate,
        });
    }

    async discreteGraphClicked({
        actionId,
        name,
        sourceInformation = {},
        skipRendererUpdate = false,
    }) {
        if (!(await this.stateValues.fixed)) {
            await this.coreFunctions.triggerChainedActions({
                triggeringAction: "click",
                componentName: name, // use name rather than this.componentName to get original name if adapted
                actionId,
                sourceInformation,
                skipRendererUpdate,
            });
        }
    }

    async discreteGraphFocused({
        actionId,
        name,
        sourceInformation = {},
        skipRendererUpdate = false,
    }) {
        if (!(await this.stateValues.fixed)) {
            await this.coreFunctions.triggerChainedActions({
                triggeringAction: "focus",
                componentName: name, // use name rather than this.componentName to get original name if adapted
                actionId,
                sourceInformation,
                skipRendererUpdate,
            });
        }
    }
}