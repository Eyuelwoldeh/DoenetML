import Input from "./abstract/Input";
import InlineComponent from "./abstract/InlineComponent";
import Group from "./Group";
import { textFromChildren } from "../utils/text";
import { isParsonsSolutionCorrect } from "../utils/parsons";
import { codedDiagnostic } from "../utils/diagnostics";

// In a horizontal layout, blocks longer than this are flagged to the author.
const MAX_HORIZONTAL_BLOCK_LENGTH = 40;

// A solution column may have at most this many rows (blocks plus empty rows)
// per block, so a stray action cannot store an unbounded arrangement.
const MAX_ROWS_PER_BLOCK = 3;

/**
 * <parsons> — a Parsons problem: students drag shuffled <block>s into a
 * solution column in the correct order (and, optionally, indentation).
 *
 * Blocks are authored in the correct order. `distractor` blocks must be left
 * out. Blocks wrapped in <anyOrder> must be contiguous but may be in any order.
 * Indentation is graded only if some block specifies `indent`.
 *
 * Grade with `<answer><award><when>$p.correct</when></award></answer>`.
 */
export default class Parsons extends Input {
    constructor(args) {
        super(args);

        Object.assign(this.actions, {
            updateArrangement: this.updateArrangement.bind(this),
        });

        this.externalActions = {};

        Object.defineProperty(this.externalActions, "submitAnswer", {
            enumerable: true,
            get: async function () {
                let answerAncestor = await this.stateValues.answerAncestor;
                if (answerAncestor !== null) {
                    return {
                        componentIdx: answerAncestor.componentIdx,
                        actionName: "submitAnswer",
                    };
                } else {
                    return;
                }
            }.bind(this),
        });
    }

    static componentType = "parsons";

    static componentDocs = {
        summary:
            "A Parsons problem: arrange shuffled blocks into the correct order and indentation.",
    };

    static createAttributesObject() {
        let attributes = super.createAttributesObject();

        attributes.shuffle = {
            createComponentOfType: "boolean",
            createStateVariable: "shuffle",
            defaultValue: true,
            public: true,
            description:
                "Whether to shuffle the blocks in the starting column (seeded by the document variant).",
        };
        attributes.layout = {
            createComponentOfType: "text",
            createStateVariable: "layout",
            validValues: [
                {
                    value: "vertical",
                    description:
                        "Blocks are stacked in two columns; indentation can be graded.",
                },
                {
                    value: "horizontal",
                    description:
                        "Blocks are arranged left to right in rows; indentation is not used. Best for short blocks.",
                },
            ],
            defaultValue: "vertical",
            toLowerCase: true,
            forRenderer: true,
            public: true,
            description: "How the blocks are laid out.",
        };
        attributes.horizontalAlign = {
            createComponentOfType: "text",
            createStateVariable: "horizontalAlign",
            validValues: [
                {
                    value: "left",
                    description: "Align the content of each block to the left.",
                },
                {
                    value: "center",
                    description: "Center the content of each block.",
                },
                {
                    value: "right",
                    description:
                        "Align the content of each block to the right.",
                },
            ],
            defaultValue: "left",
            toLowerCase: true,
            forRenderer: true,
            public: true,
            description: "Horizontal alignment of the content of each block.",
        };
        attributes.maxIndent = {
            createComponentOfType: "integer",
            description:
                "Maximum indentation level a student can apply. Defaults to one more than the largest authored indent.",
        };

        return attributes;
    }

    static returnChildGroups() {
        return [
            {
                group: "labels",
                componentTypes: ["label"],
            },
            {
                group: "descriptions",
                componentTypes: ["description"],
            },
            {
                group: "shortDescriptions",
                componentTypes: ["shortDescription"],
            },
            {
                group: "blocks",
                componentTypes: ["block"],
            },
        ];
    }

    static returnStateVariableDefinitions() {
        let stateVariableDefinitions = super.returnStateVariableDefinitions();

        stateVariableDefinitions.blocks = {
            forRenderer: true,
            returnDependencies: () => ({
                blockChildren: {
                    dependencyType: "child",
                    childGroups: ["blocks"],
                    variableNames: [
                        "indent",
                        "indentSpecified",
                        "distractor",
                        "anyOrderGroup",
                        "text",
                        "hasContent",
                    ],
                },
            }),
            definition({ dependencyValues }) {
                const blocks = dependencyValues.blockChildren.map((child) => ({
                    indent: child.stateValues.indent,
                    indentSpecified: child.stateValues.indentSpecified,
                    distractor: child.stateValues.distractor,
                    group: child.stateValues.anyOrderGroup,
                    text: child.stateValues.text,
                    hasContent: child.stateValues.hasContent,
                }));
                const diagnostics = [];
                if (!blocks.some((block) => !block.distractor)) {
                    diagnostics.push(
                        codedDiagnostic({
                            type: "warning",
                            code: "doenet-w0168",
                        }),
                    );
                }
                if (
                    blocks.some(
                        (block) => block.distractor && block.group !== null,
                    )
                ) {
                    diagnostics.push(
                        codedDiagnostic({
                            type: "warning",
                            code: "doenet-w0169",
                        }),
                    );
                }

                const solutionBlocks = blocks.filter(
                    (block) => !block.distractor,
                );
                if (solutionBlocks.length === 1) {
                    diagnostics.push(
                        codedDiagnostic({
                            type: "warning",
                            code: "doenet-w0176",
                        }),
                    );
                }

                // An <anyOrder> holding a distractor is already reported, so
                // only count the groups made entirely of solution blocks.
                const groupSizes = new Map();
                for (const block of blocks) {
                    if (block.group !== null) {
                        const size = groupSizes.get(block.group) ?? 0;
                        groupSizes.set(
                            block.group,
                            block.distractor ? NaN : size + 1,
                        );
                    }
                }
                for (const size of groupSizes.values()) {
                    if (size < 2) {
                        diagnostics.push(
                            codedDiagnostic({
                                type: "warning",
                                code: "doenet-w0175",
                            }),
                        );
                    }
                }

                if (blocks.some((block) => !block.hasContent)) {
                    diagnostics.push(
                        codedDiagnostic({
                            type: "warning",
                            code: "doenet-w0177",
                        }),
                    );
                }

                // Two blocks a student cannot tell apart, unless they sit
                // together in one <anyOrder> (where either order is accepted).
                const reported = new Set();
                blocks.forEach((block, i) => {
                    const duplicate = blocks.some(
                        (other, j) =>
                            j < i &&
                            other.text === block.text &&
                            (other.group === null ||
                                other.group !== block.group ||
                                other.distractor ||
                                block.distractor),
                    );
                    if (
                        duplicate &&
                        block.hasContent &&
                        !reported.has(block.text)
                    ) {
                        reported.add(block.text);
                        diagnostics.push(
                            codedDiagnostic({
                                type: "warning",
                                code: "doenet-w0178",
                                args: { text: block.text },
                            }),
                        );
                    }
                });

                return { setValue: { blocks }, sendDiagnostics: diagnostics };
            },
        };

        stateVariableDefinitions.numBlocks = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "integer",
            },
            description: "The number of blocks, including distractors.",
            returnDependencies: () => ({
                blocks: {
                    dependencyType: "stateVariable",
                    variableName: "blocks",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: { numBlocks: dependencyValues.blocks.length },
                };
            },
        };

        stateVariableDefinitions.indentationGraded = {
            public: true,
            forRenderer: true,
            shadowingInstructions: {
                createComponentOfType: "boolean",
            },
            description:
                "Whether indentation is part of the answer (true if any block specifies `indent` and the layout is vertical).",
            returnDependencies: () => ({
                blocks: {
                    dependencyType: "stateVariable",
                    variableName: "blocks",
                },
                layout: {
                    dependencyType: "stateVariable",
                    variableName: "layout",
                },
            }),
            definition({ dependencyValues }) {
                const indentSpecified = dependencyValues.blocks.some(
                    (block) => block.indentSpecified,
                );
                const horizontal = dependencyValues.layout === "horizontal";

                const diagnostics = [];
                if (horizontal) {
                    if (indentSpecified) {
                        diagnostics.push(
                            codedDiagnostic({
                                type: "warning",
                                code: "doenet-w0173",
                            }),
                        );
                    }
                    for (const block of dependencyValues.blocks) {
                        const length = block.text.length;
                        if (length > MAX_HORIZONTAL_BLOCK_LENGTH) {
                            diagnostics.push(
                                codedDiagnostic({
                                    type: "warning",
                                    code: "doenet-w0174",
                                    args: {
                                        length,
                                        max: MAX_HORIZONTAL_BLOCK_LENGTH,
                                    },
                                }),
                            );
                        }
                    }
                }

                return {
                    setValue: {
                        indentationGraded: indentSpecified && !horizontal,
                    },
                    sendDiagnostics: diagnostics,
                };
            },
        };

        stateVariableDefinitions.maxIndent = {
            public: true,
            forRenderer: true,
            shadowingInstructions: {
                createComponentOfType: "integer",
            },
            description: "Maximum indentation level a student can apply.",
            returnDependencies: () => ({
                maxIndentAttr: {
                    dependencyType: "attributeComponent",
                    attributeName: "maxIndent",
                    variableNames: ["value"],
                },
                blocks: {
                    dependencyType: "stateVariable",
                    variableName: "blocks",
                },
                layout: {
                    dependencyType: "stateVariable",
                    variableName: "layout",
                },
            }),
            definition({ dependencyValues }) {
                let maxIndent;
                if (dependencyValues.maxIndentAttr !== null) {
                    maxIndent =
                        dependencyValues.maxIndentAttr.stateValues.value;
                } else {
                    maxIndent =
                        Math.max(
                            0,
                            ...dependencyValues.blocks.map((b) => b.indent),
                        ) + 1;
                }
                if (!Number.isInteger(maxIndent) || maxIndent < 1) {
                    maxIndent = 1;
                }

                // A solution block a student cannot indent far enough (or
                // that has a negative indent) makes the problem unsolvable.
                const diagnostics = [];
                if (dependencyValues.layout !== "horizontal") {
                    for (const block of dependencyValues.blocks) {
                        if (
                            !block.distractor &&
                            (block.indent < 0 || block.indent > maxIndent)
                        ) {
                            diagnostics.push(
                                codedDiagnostic({
                                    type: "warning",
                                    code: "doenet-w0170",
                                    args: { indent: block.indent, maxIndent },
                                }),
                            );
                        }
                    }
                }

                return {
                    setValue: { maxIndent },
                    sendDiagnostics: diagnostics,
                };
            },
        };

        // 1-based block indices in the order they start in the source column.
        stateVariableDefinitions.initialOrder = {
            forRenderer: true,
            returnDependencies: ({ sharedParameters }) => ({
                numBlocks: {
                    dependencyType: "stateVariable",
                    variableName: "numBlocks",
                },
                shuffle: {
                    dependencyType: "stateVariable",
                    variableName: "shuffle",
                },
                variantSeed: {
                    dependencyType: "value",
                    value: sharedParameters.variantSeed,
                },
                rngClass: {
                    dependencyType: "value",
                    value: sharedParameters.rngClass,
                    doNotProxy: true,
                },
            }),
            definition({ dependencyValues }) {
                const n = dependencyValues.numBlocks;
                const initialOrder = [...Array(n).keys()].map((x) => x + 1);

                if (dependencyValues.shuffle) {
                    const rng = dependencyValues.rngClass(
                        dependencyValues.variantSeed + "po",
                    );
                    // Fisher–Yates, as in choiceInput
                    for (let i = n - 1; i > 0; i--) {
                        const j = Math.floor(rng() * (i + 1));
                        [initialOrder[i], initialOrder[j]] = [
                            initialOrder[j],
                            initialOrder[i],
                        ];
                    }
                }

                return { setValue: { initialOrder } };
            },
        };

        // Essential (saved) arrangement of the solution column, row by row.
        // An entry of 0 in allSolutionOrder is an empty row a student left as
        // spacing; empty rows are ignored by everything but the renderer.
        for (const varName of ["allSolutionOrder", "allSolutionIndents"]) {
            stateVariableDefinitions[varName] = {
                forRenderer: true,
                hasEssential: true,
                defaultValue: [],
                returnDependencies: () => ({}),
                definition: () => ({
                    useEssentialOrDefaultValue: { [varName]: true },
                }),
                inverseDefinition({ desiredStateVariableValues }) {
                    return {
                        success: true,
                        instructions: [
                            {
                                setEssentialValue: varName,
                                value: desiredStateVariableValues[varName],
                            },
                        ],
                    };
                },
            };
        }

        // The arrangement without its empty rows.
        stateVariableDefinitions.placedOrder = {
            additionalStateVariablesDefined: ["placedIndents"],
            returnDependencies: () => ({
                allSolutionOrder: {
                    dependencyType: "stateVariable",
                    variableName: "allSolutionOrder",
                },
                allSolutionIndents: {
                    dependencyType: "stateVariable",
                    variableName: "allSolutionIndents",
                },
            }),
            definition({ dependencyValues }) {
                const order = dependencyValues.allSolutionOrder;
                return {
                    setValue: {
                        placedOrder: order.filter((ind) => ind !== 0),
                        placedIndents:
                            dependencyValues.allSolutionIndents.filter(
                                (_, i) => order[i] !== 0,
                            ),
                    },
                };
            },
        };

        // Public, read-only array views of the arrangement.
        for (const [varName, allVarName, prefix, description] of [
            [
                "solutionOrder",
                "placedOrder",
                "solutionIndex",
                "Indices (1-based) of the blocks in the solution column, top to bottom.",
            ],
            [
                "solutionIndents",
                "placedIndents",
                "solutionIndent",
                "Indentation of each block in the solution column, top to bottom.",
            ],
        ]) {
            stateVariableDefinitions[varName] = {
                description,
                public: true,
                shadowingInstructions: {
                    createComponentOfType: "number",
                },
                isArray: true,
                entryPrefixes: [prefix],
                returnArraySizeDependencies: () => ({
                    [allVarName]: {
                        dependencyType: "stateVariable",
                        variableName: allVarName,
                    },
                }),
                returnArraySize({ dependencyValues }) {
                    return [dependencyValues[allVarName].length];
                },
                returnArrayDependenciesByKey() {
                    return {
                        globalDependencies: {
                            [allVarName]: {
                                dependencyType: "stateVariable",
                                variableName: allVarName,
                            },
                        },
                    };
                },
                arrayDefinitionByKey({ globalDependencyValues }) {
                    let values = {};
                    for (let key in globalDependencyValues[allVarName]) {
                        values[key] = globalDependencyValues[allVarName][key];
                    }
                    return { setValue: { [varName]: values } };
                },
            };
        }

        stateVariableDefinitions.numBlocksNeeded = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "integer",
            },
            description:
                "The number of blocks in a correct solution (blocks that are not distractors).",
            returnDependencies: () => ({
                blocks: {
                    dependencyType: "stateVariable",
                    variableName: "blocks",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: {
                        numBlocksNeeded: dependencyValues.blocks.filter(
                            (block) => !block.distractor,
                        ).length,
                    },
                };
            },
        };

        stateVariableDefinitions.numBlocksInSolution = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "integer",
            },
            description:
                "The number of blocks currently in the solution column.",
            returnDependencies: () => ({
                placedOrder: {
                    dependencyType: "stateVariable",
                    variableName: "placedOrder",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: {
                        numBlocksInSolution:
                            dependencyValues.placedOrder.length,
                    },
                };
            },
        };

        // For length feedback, e.g.
        // <feedback condition="$p.solutionTooShort" updateWith="$ans">...</feedback>
        for (const [varName, compare, description] of [
            [
                "solutionTooShort",
                (inSolution, needed) => inSolution < needed,
                "Whether the solution column holds fewer blocks than a correct solution.",
            ],
            [
                "solutionTooLong",
                (inSolution, needed) => inSolution > needed,
                "Whether the solution column holds more blocks than a correct solution.",
            ],
        ]) {
            stateVariableDefinitions[varName] = {
                public: true,
                shadowingInstructions: {
                    createComponentOfType: "boolean",
                },
                description,
                returnDependencies: () => ({
                    numBlocksInSolution: {
                        dependencyType: "stateVariable",
                        variableName: "numBlocksInSolution",
                    },
                    numBlocksNeeded: {
                        dependencyType: "stateVariable",
                        variableName: "numBlocksNeeded",
                    },
                }),
                definition({ dependencyValues }) {
                    return {
                        setValue: {
                            [varName]: compare(
                                dependencyValues.numBlocksInSolution,
                                dependencyValues.numBlocksNeeded,
                            ),
                        },
                    };
                },
            };
        }

        stateVariableDefinitions.correct = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "boolean",
            },
            description:
                "Whether the solution column holds exactly the correct blocks, in a correct order and indentation.",
            returnDependencies: () => ({
                blocks: {
                    dependencyType: "stateVariable",
                    variableName: "blocks",
                },
                placedOrder: {
                    dependencyType: "stateVariable",
                    variableName: "placedOrder",
                },
                placedIndents: {
                    dependencyType: "stateVariable",
                    variableName: "placedIndents",
                },
                indentationGraded: {
                    dependencyType: "stateVariable",
                    variableName: "indentationGraded",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: {
                        correct: isParsonsSolutionCorrect({
                            blocks: dependencyValues.blocks,
                            order: dependencyValues.placedOrder,
                            indents: dependencyValues.placedIndents,
                            indentationGraded:
                                dependencyValues.indentationGraded,
                        }),
                    },
                };
            },
        };

        stateVariableDefinitions.valueToRecordOnSubmit = {
            isAlias: true,
            targetVariableName: "solutionOrder",
            description:
                "Indices of the blocks in the solution column (recorded when the answer is submitted).",
        };

        // Render the blocks (in order), followed by any description.
        stateVariableDefinitions.childIndicesToRender = {
            returnDependencies: () => ({
                allChildren: {
                    dependencyType: "child",
                    includeAllChildren: true,
                },
            }),
            definition({ dependencyValues }) {
                const children = dependencyValues.allChildren;
                const childIndicesToRender = [...children.keys()].filter(
                    (i) => children[i].componentType === "block",
                );
                const descriptionIdx = children.findLastIndex(
                    (child) => child.componentType === "description",
                );
                if (descriptionIdx !== -1) {
                    childIndicesToRender.push(descriptionIdx);
                }
                return { setValue: { childIndicesToRender } };
            },
            markStale: () => ({ updateRenderedChildren: true }),
        };

        return stateVariableDefinitions;
    }

    async updateArrangement({
        order,
        indents,
        actionId,
        sourceInformation = {},
        skipRendererUpdate = false,
    }) {
        if (await this.stateValues.disabled) {
            return;
        }

        // `order` lists the rows of the solution column: a 1-based block
        // index, or 0 for a row left empty.
        const numBlocks = await this.stateValues.numBlocks;
        const placed = Array.isArray(order) ? order.filter((i) => i !== 0) : [];
        const valid =
            Array.isArray(order) &&
            Array.isArray(indents) &&
            order.length === indents.length &&
            order.length <= MAX_ROWS_PER_BLOCK * numBlocks &&
            new Set(placed).size === placed.length &&
            order.every(
                (i) => Number.isInteger(i) && i >= 0 && i <= numBlocks,
            ) &&
            indents.every((x) => Number.isFinite(x));
        if (!valid) {
            console.warn("Ignoring invalid arrangement for <parsons>", {
                order,
                indents,
            });
            return;
        }

        // Empty rows below the last block are not kept.
        const numRows = order.findLastIndex((i) => i !== 0) + 1;
        order = order.slice(0, numRows);
        indents = indents.slice(0, numRows);

        const maxIndent = await this.stateValues.maxIndent;
        const clampedIndents = indents.map((x, i) =>
            order[i] === 0
                ? 0
                : Math.min(Math.max(Math.round(x), 0), maxIndent),
        );

        let event = {
            verb: "interacted",
            object: {
                componentIdx: this.componentIdx,
                componentType: this.componentType,
            },
            result: { order, indents: clampedIndents },
        };
        let answerAncestor = await this.stateValues.answerAncestor;
        if (answerAncestor) {
            event.context = { answerAncestor: answerAncestor.componentIdx };
        }

        await this.coreFunctions.performUpdate({
            updateInstructions: [
                {
                    updateType: "updateValue",
                    componentIdx: this.componentIdx,
                    stateVariable: "allSolutionOrder",
                    value: [...order],
                },
                {
                    updateType: "updateValue",
                    componentIdx: this.componentIdx,
                    stateVariable: "allSolutionIndents",
                    value: clampedIndents,
                },
            ],
            actionId,
            sourceInformation,
            skipRendererUpdate: true,
            event,
        });

        return await this.coreFunctions.triggerChainedActions({
            componentIdx: this.componentIdx,
            actionId,
            sourceInformation,
            skipRendererUpdate,
        });
    }
}

/** <block> — one draggable piece of a <parsons> problem. */
export class Block extends InlineComponent {
    static componentType = "block";

    static componentDocs = {
        summary: "A draggable block within a `<parsons>` problem.",
    };
    static rendererType = "containerInline";
    static renderChildren = true;

    static createAttributesObject() {
        let attributes = super.createAttributesObject();
        attributes.indent = {
            createComponentOfType: "integer",
            createStateVariable: "indent",
            defaultValue: 0,
            public: true,
            description:
                "Correct indentation level of this block (0 = no indent).",
        };
        attributes.distractor = {
            createComponentOfType: "boolean",
            createStateVariable: "distractor",
            defaultValue: false,
            public: true,
            description:
                "Whether this block is a distractor that does not belong in the solution.",
        };
        // Set by an enclosing <anyOrder>; not authored directly.
        attributes.anyOrderGroup = {
            createPrimitiveOfType: "number",
            createStateVariable: "anyOrderGroup",
            defaultValue: null,
            excludeFromSchema: true,
        };
        return attributes;
    }

    static returnChildGroups() {
        return [
            {
                group: "children",
                componentTypes: ["_base"],
            },
        ];
    }

    static returnStateVariableDefinitions() {
        let stateVariableDefinitions = super.returnStateVariableDefinitions();

        stateVariableDefinitions.indentSpecified = {
            returnDependencies: () => ({
                indentAttr: {
                    dependencyType: "attributeComponent",
                    attributeName: "indent",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: {
                        indentSpecified: dependencyValues.indentAttr !== null,
                    },
                };
            },
        };

        // Evaluated for every block (forRenderer) so a misplaced one is flagged.
        stateVariableDefinitions.inParsons = {
            forRenderer: true,
            returnDependencies: () => ({
                parsonsParent: {
                    dependencyType: "parentIdentity",
                    parentComponentType: "parsons",
                },
            }),
            definition({ dependencyValues }) {
                const inParsons = dependencyValues.parsonsParent !== null;
                return {
                    setValue: { inParsons },
                    sendDiagnostics: inParsons
                        ? []
                        : [
                              codedDiagnostic({
                                  type: "warning",
                                  code: "doenet-w0172",
                              }),
                          ],
                };
            },
        };

        stateVariableDefinitions.text = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "text",
            },
            additionalStateVariablesDefined: ["hasContent"],
            description: "The block's content as a text string.",
            returnDependencies: () => ({
                inlineChildren: {
                    dependencyType: "child",
                    childGroups: ["children"],
                    variableNames: ["text"],
                    variablesOptional: true,
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: {
                        text: textFromChildren(dependencyValues.inlineChildren),
                        hasContent: dependencyValues.inlineChildren.length > 0,
                    },
                };
            },
        };

        return stateVariableDefinitions;
    }
}

/**
 * <anyOrder> — inside <parsons>, groups blocks that must be contiguous but may
 * appear in any order. Expands (like <group>) into its blocks, tagging each
 * with this component's index so <parsons> sees a flat list of blocks.
 */
export class AnyOrder extends Group {
    static componentType = "anyOrder";

    static componentDocs = {
        summary:
            "Within a `<parsons>` problem, blocks that must be together but may be in any order.",
    };

    static async createSerializedReplacements(args) {
        const result = await super.createSerializedReplacements(args);
        tagBlocksWithGroup(result.replacements, args.component.componentIdx);
        if (
            result.replacements.some(
                (repl) => repl?.componentType === "anyOrder",
            )
        ) {
            result.diagnostics.push(
                codedDiagnostic({ type: "warning", code: "doenet-w0171" }),
            );
        }
        return result;
    }
}

function tagBlocksWithGroup(replacements, group) {
    for (const repl of replacements) {
        if (typeof repl === "object" && repl?.componentType === "block") {
            repl.attributes = {
                ...repl.attributes,
                anyOrderGroup: {
                    type: "primitive",
                    name: "anyOrderGroup",
                    primitive: { type: "number", value: group },
                },
            };
        }
    }
}
