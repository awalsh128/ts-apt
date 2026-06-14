import { AvailabilityError } from "../../src/errors.js";
import { MockCommandRunner } from "../../src/core/mockCommandRunner.js";
import {
  createPackageManager,
  getAvailableManagers,
} from "../../src/factory.js";

function primeBaseAvailability(runner: MockCommandRunner): void {
  runner.setResult("which", ["apt"], {
    stdout: "/usr/bin/apt\n",
    stderr: "",
    exitCode: 0,
  });
  runner.setResult("which", ["apt-fast"], {
    stdout: "/usr/bin/apt-fast\n",
    stderr: "",
    exitCode: 0,
  });
  runner.setResult("which", ["dpkg"], {
    stdout: "/usr/bin/dpkg\n",
    stderr: "",
    exitCode: 0,
  });
  runner.setResult("apt", ["--version"], {
    stdout: "apt 2.6.1\n",
    stderr: "",
    exitCode: 0,
  });
  runner.setResult("apt-fast", ["--version"], {
    stdout: "apt-fast 1.10\n",
    stderr: "",
    exitCode: 0,
  });
}

describe("factory", () => {
  test("returns preferred apt-fast when available", async () => {
    const runner = new MockCommandRunner();
    primeBaseAvailability(runner);

    const manager = await createPackageManager({
      preferred: "apt-fast",
      runner,
    });
    expect(manager.getPackageManager()).toBe("apt-fast");
  });

  test("falls back to apt when apt-fast unavailable and fallback enabled", async () => {
    const runner = new MockCommandRunner();
    runner.setResult("which", ["apt-fast"], {
      stdout: "",
      stderr: "",
      exitCode: 1,
    });
    runner.setResult("which", ["apt"], {
      stdout: "/usr/bin/apt\n",
      stderr: "",
      exitCode: 0,
    });
    runner.setResult("which", ["dpkg"], {
      stdout: "/usr/bin/dpkg\n",
      stderr: "",
      exitCode: 0,
    });
    runner.setResult("apt", ["--version"], {
      stdout: "apt 2.6.1\n",
      stderr: "",
      exitCode: 0,
    });

    const manager = await createPackageManager({
      preferred: "apt-fast",
      aptFastFallbackToApt: true,
      runner,
    });

    expect(manager.getPackageManager()).toBe("apt");
  });

  test("throws when apt-fast unavailable and fallback disabled", async () => {
    const runner = new MockCommandRunner();
    runner.setResult("which", ["apt-fast"], {
      stdout: "",
      stderr: "",
      exitCode: 1,
    });

    await expect(
      createPackageManager({
        preferred: "apt-fast",
        aptFastFallbackToApt: false,
        runner,
      }),
    ).rejects.toBeInstanceOf(AvailabilityError);
  });

  test("returns available managers", async () => {
    const runner = new MockCommandRunner();
    primeBaseAvailability(runner);

    const available = await getAvailableManagers(runner);
    expect(available).toEqual(["apt", "apt-fast"]);
  });
});
