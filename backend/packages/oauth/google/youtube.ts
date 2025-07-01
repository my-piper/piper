import "reflect-metadata";

import { BASE_URL } from "consts/core";
import app from "core-kit/packages/server";
import { google } from "googleapis";
import { CLIENT_ID, CLIENT_SECRET } from "./consts";

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

const client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  [BASE_URL, "oauth/google/youtube/callback"].join("/")
);

app.get("/google/youtube", (req, resp) => {
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  resp.redirect(authUrl);
});

app.get("/google/youtube/callback", async ({ query: { code } }, resp) => {
  const { tokens } = await client.getToken(code as string);
  resp.status(200).send(Buffer.from(JSON.stringify(tokens)).toString("base64"));
});
