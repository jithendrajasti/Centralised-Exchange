import { NextFunction, Request, Response } from "express";

export function requireRoles(allowedRoles: string[]) {
    const normalizedRoles = allowedRoles.filter((role) => typeof role === "string");

    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.auth) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const userRoles = Array.isArray(req.auth.roles) ? req.auth.roles : [];
        const hasRole = normalizedRoles.some((role) => userRoles.includes(role));

        if (!hasRole) {
            return res.status(403).json({ error: "Insufficient permissions" });
        }

        return next();
    };
}
