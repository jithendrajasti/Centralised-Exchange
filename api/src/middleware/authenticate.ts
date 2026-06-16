import { NextFunction, Request, Response } from "express";
import { AuthService } from "../auth/AuthService";

function extractBearerToken(header?: string) {
    if (!header) {
        return null;
    }

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
        return null;
    }

    return token;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
        return res.status(401).json({ error: "Missing Bearer access token" });
    }

    try {
        req.auth = AuthService.getInstance().verifyAccessToken(token);
        return next();
    } catch (error: any) {
        return res.status(401).json({ error: error?.message || "Invalid access token" });
    }
}