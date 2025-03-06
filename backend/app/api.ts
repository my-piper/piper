import bodyParser from "body-parser";
import express from "express";

export const api = express();
api.use(bodyParser.text());
api.use(bodyParser.json({ limit: "50mb" }));
api.use(express.urlencoded({ limit: "20mb", extended: true }));

api.get("/health", (req, res) => {
  res.status(200).send("I am alive 😘");
});

api.get("/api/health", (req, res) => {
  res.status(200).send("I am alive 😘");
});
