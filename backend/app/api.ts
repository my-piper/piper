import api from "core-kit/packages/server";
import { Request, Response } from "express";

api.options("*", (req: Request, res: Response) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, api-token",
    "Access-Control-Allow-Credentials": "true",
  });
  res.status(204).send();
});

export default api;
