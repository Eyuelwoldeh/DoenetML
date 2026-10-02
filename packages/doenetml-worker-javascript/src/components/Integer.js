import NumberComponent from "./Number";
import {
    moveGraphicalObjectWithAnchorAction,
    returnAnchorAttributes,
    returnAnchorStateVariableDefinition,
} from "../utils/graphical";
import {
    returnNumberDisplayAttributeComponentShadowing,
} from "../utils/numberDisplay";
import me from "math-expressions";
import { renameStateVariable } from "../utils/stateVariables";
import { textToAst } from "../utils/math";

export default class Integer extends NumberComponent {
    static componentType = "integer";

    static componentDocs = {
        summary: "An integer value",
    };
    static rendererType = "number";

    // Support for representation attribute
    static createAttributesObject() {
        let attributes = super.createAttributesObject();

        // representation attribute to specify decimal, binary, or hexadecimal
        attributes.representation = {
            createPrimitiveOfType: "string",
            createStateVariable: "representation",
            defaultValue: "decimal",
            public: true,
            forRenderer: true,
        };

        Object.assign(attributes, returnAnchorAttributes());

        return attributes;
    }

    static returnStateVariableDefinitions() {
        let stateVariableDefinitions = super.returnStateVariableDefinitions();

        // Anchor definition for graphical positioning
        let anchorDefinition = returnAnchorStateVariableDefinition();
        Object.assign(stateVariableDefinitions, anchorDefinition);

        // Delete both valuePreRound and value from parent to completely override
        delete stateVariableDefinitions.valuePreRound;
        delete stateVariableDefinitions.value;

        // COMPLETELY OVERRIDE value to access children directly
        stateVariableDefinitions.value = {
            description: "The integer value.",
            public: true,
            shadowingInstructions: {
                createComponentOfType: "integer",
                addAttributeComponentsShadowingStateVariables:
                    returnNumberDisplayAttributeComponentShadowing(),
            },
            hasEssential: true,
            defaultValue: NaN,
            forRenderer: false,
            returnDependencies: () => ({
                representation: {
                    dependencyType: "stateVariable",
                    variableName: "representation",
                },
                stringChildren: {
                    dependencyType: "child",
                    childGroups: ["strings"],
                    variableNames: ["value"],
                },
                numberChildren: {
                    dependencyType: "child",
                    childGroups: ["numbers"],
                    variableNames: ["value"],
                },
                mathChildren: {
                    dependencyType: "child",
                    childGroups: ["maths"],
                    variableNames: ["value"],
                },
                textChildren: {
                    dependencyType: "child",
                    childGroups: ["texts"],
                    variableNames: ["value"],
                },
            }),
            definition({ dependencyValues }) {
                let representation = dependencyValues.representation;

                // If no children, use essential/default
                let totalChildren =
                    dependencyValues.stringChildren.length +
                    dependencyValues.numberChildren.length +
                    dependencyValues.mathChildren.length +
                    dependencyValues.textChildren.length;

                if (totalChildren === 0) {
                    return {
                        useEssentialOrDefaultValue: {
                            value: { defaultValue: NaN },
                        },
                    };
                }

                // If we have a single number child, use its value
                if (
                    dependencyValues.numberChildren.length === 1 &&
                    totalChildren === 1
                ) {
                    return {
                        setValue: {
                            value: Math.round(
                                dependencyValues.numberChildren[0].stateValues
                                    .value,
                            ),
                        },
                    };
                }

                // If we have a single math child, evaluate it
                if (
                    dependencyValues.mathChildren.length === 1 &&
                    totalChildren === 1
                ) {
                    let value = dependencyValues.mathChildren[0].stateValues
                        .value.evaluate_to_constant();
                    return {
                        setValue: {
                            value: Math.round(value),
                        },
                    };
                }

                // If we have a single string child or text child, parse based on representation
                if (
                    (dependencyValues.stringChildren.length === 1 ||
                     dependencyValues.textChildren.length === 1) &&
                    totalChildren === 1
                ) {
                    let stringValue;
                    if (dependencyValues.stringChildren.length === 1) {
                        // String children from childGroups:["strings"] are raw string values
                        stringValue = dependencyValues.stringChildren[0];
                    } else {
                        // Text children are component objects with stateValues
                        stringValue = dependencyValues.textChildren[0].stateValues.value;
                    }

                    let parsedValue = NaN;

                    if (representation === "binary") {
                        parsedValue = parseBinary(stringValue);
                    } else if (representation === "hexadecimal") {
                        parsedValue = parseHexadecimal(stringValue);
                    } else {
                        // Default decimal parsing
                        parsedValue = Number(stringValue);
                        if (Number.isNaN(parsedValue)) {
                            try {
                                parsedValue = me
                                    .fromAst(textToAst.convert(stringValue))
                                    .evaluate_to_constant();
                                if (parsedValue === null) {
                                    parsedValue = NaN;
                                }
                            } catch (e) {
                                parsedValue = NaN;
                            }
                        }
                    }

                    return {
                        setValue: {
                            value: Number.isNaN(parsedValue)
                                ? NaN
                                : Math.round(parsedValue),
                        },
                    };
                }

                // Multiple children - not supported, return NaN
                return {
                    setValue: { value: NaN },
                };
            },
            inverseDefinition({ desiredStateVariableValues, dependencyValues }) {
                let desiredValue = desiredStateVariableValues.value;
                if (desiredValue instanceof me.class) {
                    desiredValue = desiredValue.evaluate_to_constant();
                } else {
                    desiredValue = Number(desiredValue);
                }
                desiredValue = Math.round(desiredValue);

                // If no children, set essential value
                let totalChildren =
                    dependencyValues.stringChildren.length +
                    dependencyValues.numberChildren.length +
                    dependencyValues.mathChildren.length +
                    dependencyValues.textChildren.length;

                if (totalChildren === 0) {
                    return {
                        success: true,
                        instructions: [
                            {
                                setEssentialValue: "value",
                                value: desiredValue,
                            },
                        ],
                    };
                }

                // If single child, try to update it
                if (totalChildren === 1) {
                    if (dependencyValues.stringChildren.length === 1) {
                        return {
                            success: true,
                            instructions: [
                                {
                                    setDependency: "stringChildren",
                                    desiredValue: String(desiredValue),
                                    childIndex: 0,
                                    variableIndex: 0,
                                },
                            ],
                        };
                    } else if (dependencyValues.textChildren.length === 1) {
                        return {
                            success: true,
                            instructions: [
                                {
                                    setDependency: "textChildren",
                                    desiredValue: String(desiredValue),
                                    childIndex: 0,
                                    variableIndex: 0,
                                },
                            ],
                        };
                    } else if (dependencyValues.numberChildren.length === 1) {
                        return {
                            success: true,
                            instructions: [
                                {
                                    setDependency: "numberChildren",
                                    desiredValue: desiredValue,
                                    childIndex: 0,
                                    variableIndex: 0,
                                },
                            ],
                        };
                    }
                }

                return { success: false };
            },
        };

        // Add state variables for accessing value in different representations
        stateVariableDefinitions.decimal = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "text",
            },
            returnDependencies: () => ({
                value: {
                    dependencyType: "stateVariable",
                    variableName: "value",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: {
                        decimal: String(dependencyValues.value),
                    },
                };
            },
        };

        stateVariableDefinitions.binary = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "text",
            },
            returnDependencies: () => ({
                value: {
                    dependencyType: "stateVariable",
                    variableName: "value",
                },
            }),
            definition({ dependencyValues }) {
                let value = dependencyValues.value;
                let binaryString = "";

                if (Number.isNaN(value) || !Number.isFinite(value)) {
                    binaryString = String(value);
                } else if (value === 0) {
                    binaryString = "0";
                } else if (value < 0) {
                    // Handle negative numbers
                    binaryString = "-" + Math.abs(value).toString(2);
                } else {
                    binaryString = value.toString(2);
                }

                return {
                    setValue: {
                        binary: binaryString,
                    },
                };
            },
        };

        stateVariableDefinitions.hexadecimal = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "text",
            },
            returnDependencies: () => ({
                value: {
                    dependencyType: "stateVariable",
                    variableName: "value",
                },
            }),
            definition({ dependencyValues }) {
                let value = dependencyValues.value;
                let hexString = "";

                if (Number.isNaN(value) || !Number.isFinite(value)) {
                    hexString = String(value);
                } else if (value === 0) {
                    hexString = "0";
                } else if (value < 0) {
                    // Handle negative numbers
                    hexString = "-" + Math.abs(value).toString(16).toUpperCase();
                } else {
                    hexString = value.toString(16).toUpperCase();
                }

                return {
                    setValue: {
                        hexadecimal: hexString,
                    },
                };
            },
        };

        // Override text state variable to use representation
        stateVariableDefinitions.text = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "text",
            },
            forRenderer: true,
            returnDependencies: () => ({
                value: {
                    dependencyType: "stateVariable",
                    variableName: "value",
                },
                representation: {
                    dependencyType: "stateVariable",
                    variableName: "representation",
                },
                decimal: {
                    dependencyType: "stateVariable",
                    variableName: "decimal",
                },
                binary: {
                    dependencyType: "stateVariable",
                    variableName: "binary",
                },
                hexadecimal: {
                    dependencyType: "stateVariable",
                    variableName: "hexadecimal",
                },
            }),
            definition({ dependencyValues }) {
                let text = "";

                if (dependencyValues.representation === "binary") {
                    text = dependencyValues.binary;
                } else if (dependencyValues.representation === "hexadecimal") {
                    text = dependencyValues.hexadecimal;
                } else {
                    text = dependencyValues.decimal;
                }

                return {
                    setValue: {
                        text: text,
                    },
                };
            },
            async inverseDefinition({
                desiredStateVariableValues,
                dependencyValues,
            }) {
                let desiredText = desiredStateVariableValues.text;
                let representation = dependencyValues.representation;
                let desiredNumber = NaN;

                if (representation === "binary") {
                    desiredNumber = parseBinary(desiredText);
                } else if (representation === "hexadecimal") {
                    desiredNumber = parseHexadecimal(desiredText);
                } else {
                    desiredNumber = Number(desiredText);
                }

                if (Number.isFinite(desiredNumber)) {
                    return {
                        success: true,
                        instructions: [
                            {
                                setDependency: "value",
                                desiredValue: Math.round(desiredNumber),
                            },
                        ],
                    };
                } else {
                    return { success: false };
                }
            },
        };
        
        return stateVariableDefinitions;
    }
}

// Helper function to parse binary strings
function parseBinary(str) {
    if (!str || typeof str !== "string") {
        return NaN;
    }

    let trimmed = str.trim();
    let isNegative = false;

    // Handle negative sign
    if (trimmed.startsWith("-")) {
        isNegative = true;
        trimmed = trimmed.substring(1).trim();
    }

    // Handle optional 0b prefix
    if (trimmed.startsWith("0b") || trimmed.startsWith("0B")) {
        trimmed = trimmed.substring(2);
    }

    // Validate binary string (only 0 and 1)
    if (!/^[01]+$/.test(trimmed)) {
        return NaN;
    }

    // Parse binary to decimal
    let value = parseInt(trimmed, 2);

    return isNegative ? -value : value;
}

// Helper function to parse hexadecimal strings
function parseHexadecimal(str) {
    if (!str || typeof str !== "string") {
        return NaN;
    }

    let trimmed = str.trim();
    let isNegative = false;

    // Handle negative sign
    if (trimmed.startsWith("-")) {
        isNegative = true;
        trimmed = trimmed.substring(1).trim();
    }

    // Handle optional 0x prefix
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
        trimmed = trimmed.substring(2);
    }

    // Validate hexadecimal string (0-9, a-f, A-F)
    if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
        return NaN;
    }

    // Parse hexadecimal to decimal
    let value = parseInt(trimmed, 16);

    return isNegative ? -value : value;
}
