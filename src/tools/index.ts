export interface ToolContext {
    sessionId: string;
}

export interface Tool {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
    execute: (args: Record<string, any>, context: ToolContext) => Promise<any> | any;
}
