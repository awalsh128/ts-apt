import { describe, expect, test } from "vitest";
import {
  createPackageName,
  deserializePackageName,
  validatePackageName,
} from "../src/package.js";
import { ValidationError } from "../src/errors.js";

const pkg = (input: { name: string; version?: string; arch?: string }) =>
  createPackageName(input.name, input.version, input.arch);

describe("packages", () => {
  describe("PackageName", () => {
    test.each([
      [
        pkg({ name: "vim", version: "2:9.0", arch: "amd64" }),
        "vim:amd64=2:9.0",
      ],
      [pkg({ name: "vim" }), "vim"],
      [pkg({ name: "vim", arch: "amd64" }), "vim:amd64"],
      [pkg({ name: "vim", version: "2:9.0" }), "vim=2:9.0"],
    ])("serializes %j to %s", (input, expected) => {
      expect(input.serialize()).toBe(expected);
    });

    test.each([
      [
        { name: "vim", version: "2:9.0", arch: "amd64" },
        { name: "vim", version: "2:9.0", arch: "amd64" },
      ],
      [{ name: "vim" }, { name: "vim", version: undefined, arch: undefined }],
      [
        { name: "vim", arch: "amd64" },
        {
          name: "vim",
          version: undefined,
          arch: "amd64",
        },
      ],
      [
        { name: "vim", version: "2:9.0" },
        {
          name: "vim",
          version: "2:9.0",
          arch: undefined,
        },
      ],
    ])("serializes %j to JSON %j", (input, expected) => {
      expect(pkg(input).toJSON()).toEqual(expected);
    });

    test("compares multiple packages in stable order", () => {
      const pkg1 = deserializePackageName("vim:amd64=2:9.0")!;
      const pkg2 = deserializePackageName("vim:arm64=2:9.0")!;
      const pkg3 = deserializePackageName("curl:amd64=8.5.0-2ubuntu10.6")!;
      const pkg4 = deserializePackageName("curl:arm64=8.5.0-2ubuntu10.6")!;

      expect([pkg1, pkg2, pkg3, pkg4].sort((a, b) => a.compareTo(b))).toEqual(
        [pkg4, pkg3, pkg1, pkg2].sort((a, b) => a.compareTo(b)),
      );
    });
  });

  test.each([
    ["vim", pkg({ name: "vim", version: undefined, arch: undefined })],
    ["vim:amd64", pkg({ name: "vim", version: undefined, arch: "amd64" })],
    ["vim=2:9.0", pkg({ name: "vim", version: "2:9.0", arch: undefined })],
  ])("deserializePackageName(%j) returns %j", (input, expected) => {
    expect(deserializePackageName(input)).toEqual(expected);
  });

  test("deserializePackageName returns null for invalid package names", () => {
    expect(deserializePackageName("")).toBeNull();
    expect(deserializePackageName("bad package")).toBeNull();
  });

  describe("validatePackageName", () => {
    test.each([
      ["vim"], // Name only
      ["vim:arm64"], // Name + Arch
      ["libc6=2.0"], // Name + Version
      ["vim:arm64=2.0"], // Name + Arch + Version
      ["vim=2:9.0"], // Name + Version with Epoch
      ["vim:arm64=2:9.0"], // Name + Arch + Version with Epoch
      ["vim:arm64=2:9.0-extra"], // Complex version
    ])("accepts valid package name strings: %s", (input) => {
      expect(() => validatePackageName(input)).not.toThrow();
    });

    test("rejects empty package names", () => {
      expect(() => validatePackageName("")).toThrow(ValidationError);
    });

    test.each([
      "a", // Too short
      "Vim", // Uppercase
      "vim_arch", // Underscore in name
    ])("rejects non-apt package patterns: %s", (input) => {
      expect(() => validatePackageName(input)).toThrow(ValidationError);
    });

    test("rejects package names longer than 255 chars", () => {
      const longName = `a${"b".repeat(255)}`;
      expect(() => validatePackageName(longName)).toThrow(ValidationError);
    });

    test("rejects distro path syntax", () => {
      expect(() => validatePackageName("vim/focal")).toThrow(ValidationError);
    });
  });
});
