import { describe, expect, test } from "vitest";
import {
  InternetMessage,
  MessageHeaders,
  parseMessage,
  stringifyMessage,
} from "../src/internetMessage.js";

describe("internet message", () => {
  test("preserves case-insensitive header lookups", () => {
    const headers = new MessageHeaders({ "Content-Type": "text/plain" });
    expect(headers.get("content-type")).toBe("text/plain");
    expect(headers.get("CONTENT-TYPE")).toBe("text/plain");
  });

  test("parses headers and body", () => {
    const message = parseMessage("Subject: Test\n\nHello");
    expect(message.getHeader("subject")).toBe("Test");
    expect(message.body).toBe("Hello");
  });

  test("stringifies using configurable separators", () => {
    const message = new InternetMessage({ Subject: "Hi" }, "Body");
    expect(stringifyMessage(message, { eol: "\n", sob: "\n\n" })).toBe(
      "subject: Hi\n\nBody",
    );
  });
});
