export interface Tool {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
    execute: (args: Record<string, any>) => Promise<any> | any;
}
