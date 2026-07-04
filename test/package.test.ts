import { describe, expect, test } from "vitest";
import { deserializePackageName, validatePackageName } from "../src/package.js";
import { ValidationError } from "../src/errors.js";

describe("package helpers", () => {
  test("deserializes simple package names", () => {
    const pkg = deserializePackageName("vim");
    expect(pkg).not.toBeNull();
    expect(pkg?.name).toBe("vim");
    expect(pkg?.serialize()).toBe("vim");
  });

  test("deserializes names with distro and version", () => {
    const withDistro = deserializePackageName("vim/focal");
    const withVersion = deserializePackageName("vim=2:9.0");
    const withBoth = deserializePackageName("vim/focal=2:9.0");

    expect(withDistro?.serialize()).toBe("vim/focal");
    expect(withVersion?.serialize()).toBe("vim=2:9.0");
    expect(withBoth?.serialize()).toBe("vim/focal=2:9.0");
  });

  test("returns null for invalid package names", () => {
    expect(deserializePackageName("")).toBeNull();
    expect(deserializePackageName("bad package")).toBeNull();
  });

  test("accepts valid package name strings", () => {
    expect(() => validatePackageName("vim")).not.toThrow();
    expect(() => validatePackageName("libc6=2.39-0ubuntu8.4")).not.toThrow();
  });

  test("rejects empty package names", () => {
    expect(() => validatePackageName("")).toThrow(ValidationError);
  });

  test("rejects non-apt package patterns", () => {
    expect(() => validatePackageName("bad package")).toThrow(ValidationError);
  });

  test("rejects package names longer than 255 chars", () => {
    const longName = `a${"b".repeat(255)}`;
    expect(() => validatePackageName(longName)).toThrow(ValidationError);
  });

  test("rejects unsafe characters when distro path is present", () => {
    expect(() => validatePackageName("vim/focal")).toThrow(ValidationError);
  });
});
