type RateLimitInfo = {
    limit?: number;
    remaining?: number;
    reset?: string | number;
};

type TwitterApiErrorDetail = {
    parameters?: Record<string, unknown>;
    message?: string;
};

type TwitterApiErrorData = {
    errors?: TwitterApiErrorDetail[];
};

type TwitterApiErrorShape = {
    code?: number;
    rateLimit?: RateLimitInfo | null;
    data?: TwitterApiErrorData;
};

function asTwitterApiError(error: unknown): TwitterApiErrorShape | null {
    if (typeof error === "object" && error !== null) {
        return error as TwitterApiErrorShape;
    }
    return null;
}

export function getErrorCode(error: unknown): number | undefined {
    const apiError = asTwitterApiError(error);
    return typeof apiError?.code === "number" ? apiError.code : undefined;
}

export function getRateLimitInfo(error: unknown): RateLimitInfo | undefined {
    const apiError = asTwitterApiError(error);
    const rateLimit = apiError?.rateLimit;

    if (!rateLimit || typeof rateLimit !== "object") {
        return undefined;
    }

    const { limit, remaining, reset } = rateLimit;
    return { limit, remaining, reset };
}

export function formatRateLimitInfo(error: unknown): string | null {
    const rateLimit = getRateLimitInfo(error);
    if (!rateLimit) {
        return null;
    }

    const parts: string[] = [];

    if (typeof rateLimit.limit !== "undefined") {
        parts.push(`limit=${rateLimit.limit}`);
    }
    if (typeof rateLimit.remaining !== "undefined") {
        parts.push(`remaining=${rateLimit.remaining}`);
    }
    if (typeof rateLimit.reset !== "undefined") {
        parts.push(`reset=${rateLimit.reset}`);
    }

    return parts.length > 0 ? parts.join(", ") : null;
}

export function hasInvalidSinceId(error: unknown): boolean {
    const apiError = asTwitterApiError(error);
    const details = apiError?.data?.errors;

    if (!Array.isArray(details)) {
        return false;
    }

    return details.some((detail) => {
        if (!detail || typeof detail !== "object") {
            return false;
        }

        const parameters = detail.parameters;
        if (
            parameters &&
            typeof parameters === "object" &&
            Object.hasOwn(parameters, "since_id")
        ) {
            return true;
        }

        return typeof detail.message === "string"
            ? detail.message.includes("since_id")
            : false;
    });
}
