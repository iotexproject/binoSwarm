export class AgentNotFound extends Error {
    constructor(message: string = "Agent not found") {
        super(message);
    }
}

export class NoResponseError extends Error {
    constructor(message: string = "No response from generateMessageResponse") {
        super(message);
    }
}

export class NoTextError extends Error {
    constructor(message: string = "No text provided") {
        super(message);
    }
}