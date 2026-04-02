export class NamecheapApiError extends Error {
    code;
    command;
    constructor(message, code, command) {
        super(message);
        this.code = code;
        this.command = command;
        this.name = 'NamecheapApiError';
    }
}
//# sourceMappingURL=types.js.map