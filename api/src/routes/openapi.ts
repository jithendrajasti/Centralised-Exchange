import { Router } from "express";
import { openApiSpec } from "../docs/openapi";

export const openApiRouter = Router();

openApiRouter.get("/", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.json(openApiSpec);
});
