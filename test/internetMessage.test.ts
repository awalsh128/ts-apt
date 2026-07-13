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

  test("supports header collection APIs", () => {
    const headers = new MessageHeaders([
      ["Subject", "Hello"],
      ["X-Test", "1"],
    ]);

    expect(headers.has("subject")).toBe(true);
    expect(Array.from(headers.keys())).toEqual(["subject", "x-test"]);
    expect(Array.from(headers.values())).toEqual(["Hello", "1"]);

    const iterated: Array<[string, string]> = [];
    headers.forEach((value, name) => iterated.push([name, value]));
    expect(iterated).toEqual([
      ["subject", "Hello"],
      ["x-test", "1"],
    ]);

    expect(headers.delete("x-test")).toBe(true);
    expect(headers.delete("missing")).toBe(false);
    expect(headers.toObject()).toEqual({ subject: "Hello" });
  });

  test("parses CRLF input and strips trailing carriage return", () => {
    const message = parseMessage("Subject: Test\r\n\r\nBody", { eol: "\n" });
    expect(message.getHeader("subject")).toBe("Test");
    expect(message.body).toBe("Body");
  });

  test("throws on malformed message without line ending", () => {
    expect(() => parseMessage("Subject: Test", { eol: "\n" })).toThrow(
      SyntaxError,
    );
  });

  test("supports parsing without body extraction", () => {
    const message = parseMessage("Subject: Test\n\nBody", { body: false });
    expect(message.getHeader("subject")).toBe("Test");
    expect(message.body).toBeUndefined();
  });

  test("stringifyMessage returns header block when body is undefined", () => {
    const message = new InternetMessage({ Subject: "NoBody" });
    expect(stringifyMessage(message)).toBe("subject: NoBody");
  });

  test("instance parse and toJSON helpers round-trip", () => {
    const parsed = InternetMessage.parse("Subject: Hi\n\nBody");
    expect(parsed.toJSON()).toEqual({
      headers: { subject: "Hi" },
      body: "Body",
    });

    parsed.removeHeader("subject");
    parsed.setHeader("X-New", "yes");
    expect(parsed.getHeader("x-new")).toBe("yes");
    expect(parsed.toString({ eol: "\n", sob: "\n\n" })).toBe(
      "x-new: yes\n\nBody",
    );
  });

  test("preserves first header key casing on repeated set", () => {
    const headers = new MessageHeaders();
    headers.set("Subject", "First");
    headers.set("subject", "Second");

    expect(headers.toObject()).toEqual({ subject: "Second" });
  });

  test("toJSON omits body when undefined", () => {
    const message = new InternetMessage({ Subject: "OnlyHeaders" });
    expect(message.toJSON()).toEqual({
      headers: { subject: "OnlyHeaders" },
    });
  });

  test("ignores malformed header lines with empty names", () => {
    const message = parseMessage(": missing-name\nSubject: ok\n\nBody");
    expect(message.getHeader("subject")).toBe("ok");
    expect(message.getHeader("")).toBeUndefined();
  });
});
