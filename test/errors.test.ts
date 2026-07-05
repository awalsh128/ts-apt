import { describe, expect, test } from "vitest";
import {
  AvailabilityError,
  CommandExecutionError,
  TsAptError,
  ValidationError,
} from "../src/errors.js";

describe("error types", () => {
  test("constructs base and derived errors with names", () => {
    expect(new TsAptError("base").name).toBe("TsAptError");
    expect(new ValidationError("bad").name).toBe("ValidationError");
    expect(new AvailabilityError("missing").name).toBe("AvailabilityError");
  });

  test("constructs command execution error with default message", () => {
    const error = new CommandExecutionError({
      command: "apt",
      args: ["update"],
      exitCode: 1,
      stdout: "",
      stderr: "failed",
    });

    expect(error.message).toBe("Command execution failed");
    expect(error.exitCode).toBe(1);
    expect(error.name).toBe("CommandExecutionError");
  });
});
