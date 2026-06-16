declare global {
    namespace Express {
        interface Request {
            requestId?: string;
            auth?: {
                userId: string;
                email: string;
                sessionId: string;
                roles: string[];
            };
        }
    }
}

export {};