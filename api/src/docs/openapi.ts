export const openApiSpec = {
    openapi: "3.0.3",
    info: {
        title: "Centralised Exchange API",
        version: "1.0.0",
        description: "HTTP API for trading, market data, and auth.",
    },
    servers: [
        {
            url: "http://localhost:3000",
            description: "Local development",
        },
    ],
    tags: [
        { name: "system" },
        { name: "auth" },
        { name: "orders" },
        { name: "wallet" },
        { name: "market" },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
        },
        schemas: {
            Health: {
                type: "object",
                properties: {
                    status: { type: "string", example: "ok" },
                    uptime: { type: "number", example: 123.45 },
                    timestamp: { type: "number", example: 1700000000000 },
                },
                required: ["status", "uptime", "timestamp"],
            },
            ErrorResponse: {
                type: "object",
                properties: {
                    error: { type: "string", example: "Invalid credentials" },
                    message: { type: "string" },
                    details: { type: "string" },
                },
                required: ["error"],
            },
            AuthRequest: {
                type: "object",
                properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", format: "password" },
                },
                required: ["email", "password"],
            },
            AuthUser: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    email: { type: "string", format: "email" },
                    roles: {
                        type: "array",
                        items: { type: "string" },
                        example: ["user"],
                    },
                },
                required: ["id", "email", "roles"],
            },
            AuthResponse: {
                type: "object",
                properties: {
                    user: { $ref: "#/components/schemas/AuthUser" },
                    accessToken: { type: "string" },
                    expiresIn: { type: "string", example: "15m" },
                },
                required: ["user", "accessToken", "expiresIn"],
            },
            RefreshResponse: {
                type: "object",
                properties: {
                    user: { $ref: "#/components/schemas/AuthUser" },
                    accessToken: { type: "string" },
                    expiresIn: { type: "string", example: "15m" },
                },
                required: ["user", "accessToken", "expiresIn"],
            },
            WsTicket: {
                type: "object",
                properties: {
                    ticket: { type: "string", format: "uuid" },
                    expiresIn: { type: "number", example: 60 },
                },
                required: ["ticket", "expiresIn"],
            },
            OrderCreateRequest: {
                type: "object",
                properties: {
                    market: { type: "string", example: "SOL_USDC" },
                    price: {
                        oneOf: [{ type: "string" }, { type: "number" }],
                        example: "135.12",
                    },
                    quantity: {
                        oneOf: [{ type: "string" }, { type: "number" }],
                        example: "0.5",
                    },
                    side: { type: "string", enum: ["buy", "sell"] },
                },
                required: ["market", "price", "quantity", "side"],
            },
            OrderCancelRequest: {
                type: "object",
                properties: {
                    orderId: { type: "string" },
                    market: { type: "string", example: "SOL_USDC" },
                },
                required: ["orderId", "market"],
            },
            OrderFill: {
                type: "object",
                properties: {
                    price: { type: "string" },
                    qty: { type: "number" },
                    tradeId: { type: "number" },
                },
                required: ["price", "qty", "tradeId"],
            },
            OrderPlaced: {
                type: "object",
                properties: {
                    orderId: { type: "string" },
                    executedQty: { type: "number" },
                    fills: {
                        type: "array",
                        items: { $ref: "#/components/schemas/OrderFill" },
                    },
                },
                required: ["orderId", "executedQty", "fills"],
            },
            OrderCancelled: {
                type: "object",
                properties: {
                    orderId: { type: "string" },
                    executedQty: { type: "number" },
                    remainingQty: { type: "number" },
                },
                required: ["orderId", "executedQty", "remainingQty"],
            },
            OpenOrder: {
                type: "object",
                properties: {
                    orderId: { type: "string" },
                    executedQty: { type: "number" },
                    price: { type: "string" },
                    quantity: { type: "string" },
                    side: { type: "string", enum: ["buy", "sell"] },
                    userId: { type: "string" },
                },
                required: ["orderId", "executedQty", "price", "quantity", "side", "userId"],
            },
            Depth: {
                type: "object",
                properties: {
                    bids: {
                        type: "array",
                        items: {
                            type: "array",
                            items: [{ type: "string" }, { type: "string" }],
                            minItems: 2,
                            maxItems: 2,
                        },
                    },
                    asks: {
                        type: "array",
                        items: {
                            type: "array",
                            items: [{ type: "string" }, { type: "string" }],
                            minItems: 2,
                            maxItems: 2,
                        },
                    },
                },
                required: ["bids", "asks"],
            },
            Ticker: {
                type: "object",
                properties: {
                    firstPrice: { type: "string" },
                    high: { type: "string" },
                    lastPrice: { type: "string" },
                    low: { type: "string" },
                    priceChange: { type: "string" },
                    priceChangePercent: { type: "string" },
                    quoteVolume: { type: "string" },
                    symbol: { type: "string" },
                    trades: { type: "string" },
                    volume: { type: "string" },
                },
                required: [
                    "firstPrice",
                    "high",
                    "lastPrice",
                    "low",
                    "priceChange",
                    "priceChangePercent",
                    "quoteVolume",
                    "symbol",
                    "trades",
                    "volume",
                ],
            },
            Trade: {
                type: "object",
                properties: {
                    id: { type: "number" },
                    price: { type: "string" },
                    quantity: { type: "string" },
                    quoteQuantity: { type: "string" },
                    timestamp: { type: "number", example: 1700000000000 },
                    isBuyerMaker: { type: "boolean" },
                },
                required: ["id", "price", "quantity", "quoteQuantity", "timestamp", "isBuyerMaker"],
            },
            Kline: {
                type: "object",
                properties: {
                    open: { type: "string" },
                    high: { type: "string" },
                    low: { type: "string" },
                    close: { type: "string" },
                    volume: { type: "string" },
                    quoteVolume: { type: "string" },
                    start: { type: "string", format: "date-time" },
                    end: { type: "string", format: "date-time" },
                    trades: { type: "string" },
                },
                required: ["open", "high", "low", "close", "volume", "quoteVolume", "start", "end", "trades"],
            },
            OnrampRequest: {
                type: "object",
                properties: {
                    amount: {
                        oneOf: [{ type: "string" }, { type: "number" }],
                        example: 1000,
                    },
                },
                required: ["amount"],
            },
            OnrampResponse: {
                type: "object",
                properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    userId: { type: "string" },
                    amount: { type: "number" },
                },
                required: ["success", "message", "userId", "amount"],
            },
            BalanceAsset: {
                type: "object",
                properties: {
                    available: { type: "number" },
                    locked: { type: "number" },
                },
                required: ["available", "locked"],
            },
            BalancesResponse: {
                type: "object",
                properties: {
                    userId: { type: "string" },
                    balances: {
                        type: "object",
                        additionalProperties: { $ref: "#/components/schemas/BalanceAsset" },
                    },
                },
                required: ["userId", "balances"],
            },
        },
        responses: {
            Unauthorized: {
                description: "Missing or invalid access token",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ErrorResponse" },
                    },
                },
            },
            Forbidden: {
                description: "Insufficient permissions",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ErrorResponse" },
                    },
                },
            },
            BadRequest: {
                description: "Invalid request",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ErrorResponse" },
                    },
                },
            },
            ServerError: {
                description: "Server error",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ErrorResponse" },
                    },
                },
            },
        },
    },
    paths: {
        "/health": {
            get: {
                tags: ["system"],
                summary: "Health check",
                responses: {
                    "200": {
                        description: "Service is healthy",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/Health" },
                            },
                        },
                    },
                },
            },
        },
        "/api/v1/auth/register": {
            post: {
                tags: ["auth"],
                summary: "Register a new user",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/AuthRequest" },
                        },
                    },
                },
                responses: {
                    "201": {
                        description: "Registered",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/AuthResponse" },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/BadRequest" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/api/v1/auth/login": {
            post: {
                tags: ["auth"],
                summary: "Login",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/AuthRequest" },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Logged in",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/AuthResponse" },
                            },
                        },
                    },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/api/v1/auth/refresh": {
            post: {
                tags: ["auth"],
                summary: "Refresh access token",
                description: "Uses refresh token cookie or optional request body value.",
                parameters: [
                    {
                        name: "refreshToken",
                        in: "cookie",
                        required: false,
                        schema: { type: "string" },
                    },
                ],
                requestBody: {
                    required: false,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    refreshToken: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Refreshed",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/RefreshResponse" },
                            },
                        },
                    },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/api/v1/auth/logout": {
            post: {
                tags: ["auth"],
                summary: "Logout",
                description: "Clears refresh session and cookie if present.",
                parameters: [
                    {
                        name: "refreshToken",
                        in: "cookie",
                        required: false,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description: "Logged out",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        success: { type: "boolean", example: true },
                                    },
                                    required: ["success"],
                                },
                            },
                        },
                    },
                },
            },
        },
        "/api/v1/auth/me": {
            get: {
                tags: ["auth"],
                summary: "Get current user",
                security: [{ bearerAuth: [] }],
                responses: {
                    "200": {
                        description: "Authenticated user",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        user: {
                                            type: "object",
                                            properties: {
                                                id: { type: "string", format: "uuid" },
                                                email: { type: "string", format: "email" },
                                                sessionId: { type: "string", format: "uuid" },
                                                roles: {
                                                    type: "array",
                                                    items: { type: "string" },
                                                },
                                            },
                                            required: ["id", "email", "sessionId", "roles"],
                                        },
                                    },
                                    required: ["user"],
                                },
                            },
                        },
                    },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                },
            },
        },
        "/api/v1/auth/ws-ticket": {
            post: {
                tags: ["auth"],
                summary: "Create WebSocket auth ticket",
                security: [{ bearerAuth: [] }],
                responses: {
                    "200": {
                        description: "Ticket issued",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/WsTicket" },
                            },
                        },
                    },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "400": { $ref: "#/components/responses/BadRequest" },
                },
            },
        },
        "/api/v1/order": {
            post: {
                tags: ["orders"],
                summary: "Create order",
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/OrderCreateRequest" },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Order placed",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/OrderPlaced" },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/BadRequest" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
            delete: {
                tags: ["orders"],
                summary: "Cancel order",
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/OrderCancelRequest" },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Order cancelled",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/OrderCancelled" },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/BadRequest" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/api/v1/order/open": {
            get: {
                tags: ["orders"],
                summary: "Get open orders",
                security: [{ bearerAuth: [] }],
                parameters: [
                    {
                        name: "market",
                        in: "query",
                        required: true,
                        schema: { type: "string", example: "SOL_USDC" },
                    },
                ],
                responses: {
                    "200": {
                        description: "Open orders",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
                                    items: { $ref: "#/components/schemas/OpenOrder" },
                                },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/BadRequest" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/api/v1/onramp": {
            post: {
                tags: ["wallet"],
                summary: "Add funds",
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/OnrampRequest" },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Funds added",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/OnrampResponse" },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/BadRequest" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/api/v1/wallet/balances": {
            get: {
                tags: ["wallet"],
                summary: "Get wallet balances",
                security: [{ bearerAuth: [] }],
                responses: {
                    "200": {
                        description: "Balances",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/BalancesResponse" },
                            },
                        },
                    },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "403": { $ref: "#/components/responses/Forbidden" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/api/v1/depth": {
            get: {
                tags: ["market"],
                summary: "Order book depth",
                parameters: [
                    {
                        name: "symbol",
                        in: "query",
                        required: true,
                        schema: { type: "string", example: "SOL_USDC" },
                    },
                ],
                responses: {
                    "200": {
                        description: "Order book depth",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/Depth" },
                            },
                        },
                    },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/api/v1/tickers": {
            get: {
                tags: ["market"],
                summary: "Tickers",
                parameters: [
                    {
                        name: "symbol",
                        in: "query",
                        required: false,
                        schema: { type: "string", example: "SOL_USDC" },
                    },
                ],
                responses: {
                    "200": {
                        description: "Tickers",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
                                    items: { $ref: "#/components/schemas/Ticker" },
                                },
                            },
                        },
                    },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/api/v1/trades": {
            get: {
                tags: ["market"],
                summary: "Recent trades",
                description: "Use market query parameter. symbol is accepted as an alias.",
                parameters: [
                    {
                        name: "market",
                        in: "query",
                        required: true,
                        schema: { type: "string", example: "SOL_USDC" },
                    },
                    {
                        name: "limit",
                        in: "query",
                        required: false,
                        schema: { type: "number", example: 100 },
                    },
                ],
                responses: {
                    "200": {
                        description: "Trades",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
                                    items: { $ref: "#/components/schemas/Trade" },
                                },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/BadRequest" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
        "/api/v1/klines": {
            get: {
                tags: ["market"],
                summary: "Klines (candles)",
                description: "startTime and endTime are unix seconds.",
                parameters: [
                    {
                        name: "market",
                        in: "query",
                        required: true,
                        schema: { type: "string", example: "SOL_USDC" },
                    },
                    {
                        name: "interval",
                        in: "query",
                        required: true,
                        schema: {
                            type: "string",
                            enum: ["1m", "5m", "15m", "1h", "4h", "1d", "1w"],
                            example: "1m",
                        },
                    },
                    {
                        name: "startTime",
                        in: "query",
                        required: true,
                        schema: { type: "number", example: 1700000000 },
                    },
                    {
                        name: "endTime",
                        in: "query",
                        required: true,
                        schema: { type: "number", example: 1700003600 },
                    },
                ],
                responses: {
                    "200": {
                        description: "Klines",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
                                    items: { $ref: "#/components/schemas/Kline" },
                                },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/BadRequest" },
                    "500": { $ref: "#/components/responses/ServerError" },
                },
            },
        },
    },
} as const;
