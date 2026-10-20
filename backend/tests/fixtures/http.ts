import jwt from "jsonwebtoken";
import { launchRequestFixture, pipelineFixture } from "./pipeline";

export const HTTP_TEST_SECRET = "http-contract-test-secret";
export const HTTP_TEST_TIME = new Date("2026-01-02T03:04:05.000Z");

export function userToken(id = "owner-user", options: jwt.SignOptions = {}) {
  return jwt.sign({ _id: id }, HTTP_TEST_SECRET, { expiresIn: "1h", ...options });
}

export function httpUserFixture(id = "owner-user", roles: string[] = []) {
  return { _id: id, email: `${id}@example.com`, roles, balance: { remaining: 10 }, createdAt: new Date("2025-01-01T00:00:00.000Z") };
}

export function httpProjectFixture() {
  return {
    _id: "project-http", title: "Contract project", visibility: "private", revision: "revision-1",
    createdAt: new Date("2025-01-01T00:00:00.000Z"), createdBy: { _id: "owner-user" },
    pipeline: pipelineFixture(), launchRequest: launchRequestFixture(),
  };
}
