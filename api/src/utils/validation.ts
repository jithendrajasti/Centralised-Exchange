export function parseRequiredString(value: unknown, fieldName: string) {
    if (typeof value !== "string") {
        throw new Error(`${fieldName} must be a string`);
    }

    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error(`${fieldName} is required`);
    }

    return trimmed;
}

export function parsePositiveNumber(value: unknown, fieldName: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${fieldName} must be a positive number`);
    }
    return parsed;
}

export function parseMarketSymbol(value: unknown) {
    const symbol = parseRequiredString(value, "market").toUpperCase();
    if (!/^[A-Z0-9]+_[A-Z0-9]+$/.test(symbol)) {
        throw new Error("market must use BASE_QUOTE format, e.g. SOL_USDC");
    }
    return symbol;
}

export function parseOrderSide(value: unknown) {
    if (value !== "buy" && value !== "sell") {
        throw new Error("side must be 'buy' or 'sell'");
    }
    return value;
}