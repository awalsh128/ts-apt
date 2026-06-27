import { CommandExecutionError } from "../src/errors.js";
import { MockCommandRunner } from "./mockCommandRunner.js";
import { AptPackageManager } from "../src/manager.js";

describe("apt manager", () => {
  test("install builds expected command", async () => {
    const runner = new MockCommandRunner();
    runner.setResult("apt", ["install", "-f", "vim", "-y"], {
      stdout: "Setting up vim (2:9.0) ...\n",
      stderr: "",
      exitCode: 0,
    });

    const manager = new AptPackageManager({ runner });
    const out = await manager.install(["vim"]);

    expect(out).toHaveLength(1);
    expect(runner.calls[0]?.args).toEqual(["install", "-f", "vim", "-y"]);
  });

  test("find merges apt search with dpkg statuses", async () => {
    const runner = new MockCommandRunner();
    runner.setResult("apt", ["search", "vim"], {
      stdout: [
        "Sorting...",
        "Full Text Search...",
        "vim/stable 2:9.0 amd64",
        "editor",
        "",
        "foo/stable 1.0 amd64",
        "foo",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    });
    runner.setResult(
      "dpkg-query",
      [
        "-W",
        "--showformat",
        "${binary:Package} ${Status} ${Version}\\n",
        "vim",
        "foo",
      ],
      {
        stdout:
          "vim install ok installed 2:9.0\nfoo deinstall ok config-files 1.0\n",
        stderr: "",
        exitCode: 0,
      },
    );

    const manager = new AptPackageManager({ runner });
    const out = await manager.search(["vim"]);

    expect(out.find((p) => p.name === "vim")?.status).toBe("installed");
    expect(out.find((p) => p.name === "foo")?.status).toBe("available");
  });

  test("dpkg-query exit code 1 is tolerated in find", async () => {
    const runner = new MockCommandRunner();
    runner.setResult("apt", ["search", "ghostpkg"], {
      stdout:
        "Sorting...\nFull Text Search...\nghostpkg/stable 1.0 amd64\ndesc\n",
      stderr: "",
      exitCode: 0,
    });
    runner.setError(
      "dpkg-query",
      [
        "-W",
        "--showformat",
        "${binary:Package} ${Status} ${Version}\\n",
        "ghostpkg",
      ],
      new CommandExecutionError({
        command: "dpkg-query",
        args: ["-W"],
        exitCode: 1,
        stdout: "",
        stderr: "dpkg-query: no packages found matching ghostpkg",
      }),
    );

    const manager = new AptPackageManager({ runner });
    const out = await manager.search(["ghostpkg"]);

    expect(out[0]?.status).toBe("available");
  });
});
