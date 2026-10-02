import GraphicalComponent from "./abstract/GraphicalComponent";

/**
 * <arrayComponent> — memory-diagram widget for a <graph>.
 *
 * Replaces the legacy <setup><module name="memSlots"/>...</setup> module
 * pattern with a single first-class component. Renders:
 *   • a vertical stack of typeable memory cells,
 *   • hex address labels on the left of each row,
 *   • optional pointer arrows (e.g. fp, sp) — draggable, constrained to rows,
 *   • optional draggable variable labels (e.g. a, b, x).
 *
 * Example:
 *   <arrayComponent name="mem" arrayName="Main Memory" size="9"
 *       addresses="0000001c 00000020 00000024 00000028 0000002c 00000030 00000034 00000038 0000003c"
 *       pointers="fp sp"
 *       variables="a b" />
 *
 * Public, queryable, mutable state arrays (Option A API):
 *   $mem.cellValues[i]   – text typed in cell i (1-indexed in DoenetML)
 *   $mem.pointerY[i]     – row index pointer i is currently snapped to
 *   $mem.varY[i]         – row index variable label i is currently snapped to
 *
 * Use those in <answer> like:
 *   <number>$mem.cellValues[7]</number> = 3
 *   $mem.pointerY[1] = 4
 *   $mem.varY[1] = 6
 */
export default class ArrayComponent extends GraphicalComponent {
    constructor(args) {
        super(args);
        Object.assign(this.actions, {
            setCellValue: this.setCellValue.bind(this),
            setPointerY: this.setPointerY.bind(this),
        });
    }

    static componentType = "arrayComponent";

    // ─── attributes ─────────────────────────────────────────────────────────
    static createAttributesObject() {
        let attributes = super.createAttributesObject();

        attributes.arrayName = {
            createComponentOfType: "text",
            createStateVariable: "arrayName",
            defaultValue: "",
            public: true,
            forRenderer: true,
        };

        attributes.size = {
            createComponentOfType: "integer",
            createStateVariable: "size",
            defaultValue: 8,
            public: true,
            forRenderer: true,
        };

        attributes.addresses = {
            createComponentOfType: "text",
            createStateVariable: "addresses",
            defaultValue: "",
            public: true,
            forRenderer: true,
        };

        attributes.pointers = {
            createComponentOfType: "text",
            createStateVariable: "pointers",
            defaultValue: "",
            public: true,
            forRenderer: true,
        };

        return attributes;
    }

    // ─── state variables ────────────────────────────────────────────────────
    static returnStateVariableDefinitions() {
        let stateVariableDefinitions = super.returnStateVariableDefinitions();

        // Helper: parse a whitespace-separated list into an array of strings.
        const parseList = (raw) => {
            const t = (raw || "").trim();
            return t === "" ? [] : t.split(/\s+/);
        };

        // ── parsed lists for the renderer ───────────────────────────────────
        stateVariableDefinitions.addressList = {
            forRenderer: true,
            returnDependencies: () => ({
                addresses: {
                    dependencyType: "stateVariable",
                    variableName: "addresses",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: {
                        addressList: parseList(dependencyValues.addresses),
                    },
                };
            },
        };

        stateVariableDefinitions.pointerNameList = {
            forRenderer: true,
            returnDependencies: () => ({
                pointers: {
                    dependencyType: "stateVariable",
                    variableName: "pointers",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: {
                        pointerNameList: parseList(dependencyValues.pointers),
                    },
                };
            },
        };

        // ── public array state variables (mutable, queryable) ──────────────
        // cellValues[i] — text in memory cell i (default "?")
        stateVariableDefinitions.cellValues = {
            public: true,
            shadowingInstructions: { createComponentOfType: "text" },
            isArray: true,
            entryPrefixes: ["cellValue"],
            forRenderer: true,
            hasEssential: true,
            essentialVarName: "cellValues",
            defaultValueByArrayKey: () => "?",
            returnArraySizeDependencies: () => ({
                size: {
                    dependencyType: "stateVariable",
                    variableName: "size",
                },
            }),
            returnArraySize({ dependencyValues }) {
                return [Math.max(0, Number(dependencyValues.size) || 0)];
            },
            returnArrayDependenciesByKey: () => ({}),
            arrayDefinitionByKey({ arrayKeys }) {
                let useEssentialOrDefaultValue = {};
                for (let key of arrayKeys) {
                    useEssentialOrDefaultValue[key] = { defaultValue: "?" };
                }
                return { useEssentialOrDefaultValue: { cellValues: useEssentialOrDefaultValue } };
            },
            async inverseArrayDefinitionByKey({ desiredStateVariableValues }) {
                return {
                    success: true,
                    instructions: [
                        {
                            setEssentialValue: "cellValues",
                            value: Object.fromEntries(
                                Object.entries(
                                    desiredStateVariableValues.cellValues,
                                ).map(([k, v]) => [k, String(v)]),
                            ),
                        },
                    ],
                };
            },
        };

        // pointerY[i] — row index pointer i is on (-1 if unplaced)
        stateVariableDefinitions.pointerY = {
            public: true,
            shadowingInstructions: { createComponentOfType: "number" },
            isArray: true,
            entryPrefixes: ["pointer"],
            forRenderer: true,
            hasEssential: true,
            essentialVarName: "pointerY",
            defaultValueByArrayKey: () => -1,
            returnArraySizeDependencies: () => ({
                pointerNameList: {
                    dependencyType: "stateVariable",
                    variableName: "pointerNameList",
                },
            }),
            returnArraySize({ dependencyValues }) {
                return [dependencyValues.pointerNameList.length];
            },
            returnArrayDependenciesByKey: () => ({}),
            arrayDefinitionByKey({ arrayKeys }) {
                let useEssentialOrDefaultValue = {};
                for (let key of arrayKeys) {
                    useEssentialOrDefaultValue[key] = { defaultValue: -1 };
                }
                return { useEssentialOrDefaultValue: { pointerY: useEssentialOrDefaultValue } };
            },
            async inverseArrayDefinitionByKey({ desiredStateVariableValues }) {
                return {
                    success: true,
                    instructions: [
                        {
                            setEssentialValue: "pointerY",
                            value: Object.fromEntries(
                                Object.entries(
                                    desiredStateVariableValues.pointerY,
                                ).map(([k, v]) => [k, Number(v)]),
                            ),
                        },
                    ],
                };
            },
        };

        return stateVariableDefinitions;
    }

    // ─── actions called from the renderer ───────────────────────────────────
    async setCellValue({ index, value, actionId, sourceInformation = {}, skipRendererUpdate = false }) {
        await this.coreFunctions.performUpdate({
            updateInstructions: [
                {
                    updateType: "updateValue",
                    componentIdx: this.componentIdx,
                    stateVariable: "cellValues",
                    value: { [index]: String(value) },
                },
            ],
            actionId,
            sourceInformation,
            skipRendererUpdate,
            event: {
                verb: "interacted",
                object: {
                    componentIdx: this.componentIdx,
                    componentType: this.componentType,
                },
                result: { index, value },
            },
        });
    }

    async setPointerY({ index, y, actionId, sourceInformation = {}, skipRendererUpdate = false }) {
        await this.coreFunctions.performUpdate({
            updateInstructions: [
                {
                    updateType: "updateValue",
                    componentIdx: this.componentIdx,
                    stateVariable: "pointerY",
                    value: { [index]: Number(y) },
                },
            ],
            actionId,
            sourceInformation,
            skipRendererUpdate,
            event: {
                verb: "interacted",
                object: {
                    componentIdx: this.componentIdx,
                    componentType: this.componentType,
                },
                result: { index, y },
            },
        });
    }

}
