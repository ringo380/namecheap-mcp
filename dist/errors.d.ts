export declare function toErrorResult(err: unknown): {
    [x: string]: unknown;
    content: {
        type: 'text';
        text: string;
    }[];
    structuredContent: Record<string, unknown>;
    isError: true;
};
