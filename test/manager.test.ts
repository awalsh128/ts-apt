import winston from "winston";
import { AptPackageManager } from "../src/manager.js";
import { AptOutputParser } from "../src/parser.js";
import { FakeCommandRunner } from "./common.js";

describe("apt manager", () => {
  const logger = winston.createLogger({
    level: "fatal",
    transports: [new winston.transports.Console({ silent: true })],
  });

  test("install executes apt-get install and parses installed package", async () => {
    const runner = new FakeCommandRunner(
      new Map([
        [
          "/usr/bin/apt-get --quiet=0 -y install -f vim",
          {
            cmdLine:
              "/usr/bin/apt-get --quiet=0 -y install -f vim",
            stdout: "Setting up vim (2:9.0) ...\n",
            stderr: "",
            exitCode: 0,
          },
        ],
      ]),
    );

    const manager = new AptPackageManager(
      false,
      runner,
      new AptOutputParser(logger),
      logger,
    );
    const out = await manager.install(["vim"]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: "vim",
      version: "2:9.0",
      status: "installed",
    });
  });

  test("search executes apt search and returns parsed packages", async () => {
    const runner = new FakeCommandRunner(
      new Map([
        [
          "/usr/bin/apt --quiet=0 search vim",
          {
            cmdLine: "/usr/bin/apt --quiet=0 search vim",
            stdout: [
              "vim/stable 2:9.0 amd64",
              "  editor",
              "",
              "foo/stable 1.0 amd64",
              "  foo",
            ].join("\n"),
            stderr: "",
            exitCode: 0,
          },
        ],
      ]),
    );

    const manager = new AptPackageManager(
      false,
      runner,
      new AptOutputParser(logger),
      logger,
    );
    const out = await manager.search(["vim"]);

    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "vim", version: "2:9.0" }),
        expect.objectContaining({ name: "foo", version: "1.0" }),
      ]),
    );
  });

  test("listInstalled executes dpkg-query and parses package versions", async () => {
    const cmd = "/usr/bin/dpkg-query -W -f ${binary:Package}=${Version}\\n";
    const runner = new FakeCommandRunner(
      new Map([
        [
          cmd,
          {
            cmdLine: cmd,
            stdout: "vim:amd64=2:9.0\nfoo:amd64=1.0\n",
            stderr: "",
            exitCode: 0,
          },
        ],
      ]),
    );

    const manager = new AptPackageManager(
      false,
      runner,
      new AptOutputParser(logger),
      logger,
    );
    const out = await manager.listInstalled();

    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "vim", version: "2:9.0" }),
        expect.objectContaining({ name: "foo", version: "1.0" }),
      ]),
    );
    expect(out.every((pkg) => pkg.status === "installed")).toBe(true);
  });

  test("remove includes --autoremove when enabled", async () => {
    const cmd = "/usr/bin/apt-get --quiet=0 -y remove -f vim --autoremove";
    const runner = new FakeCommandRunner(
      new Map([
        [
          cmd,
          {
            cmdLine: cmd,
            stdout: "Removing vim (2:9.0) ...\n",
            stderr: "",
            exitCode: 0,
          },
        ],
      ]),
    );

    const manager = new AptPackageManager(
      false,
      runner,
      new AptOutputParser(logger),
      logger,
    );
    const out = await manager.remove(["vim"], true);

    expect(out).toEqual([
      expect.objectContaining({
        name: "vim",
        version: "2:9.0",
        status: "available",
      }),
    ]);
  });

  test("remove omits --autoremove when disabled", async () => {
    const cmd = "/usr/bin/apt-get --quiet=0 -y remove -f vim";
    const runner = new FakeCommandRunner(
      new Map([
        [
          cmd,
          {
            cmdLine: cmd,
            stdout: "Removing vim (2:9.0) ...\n",
            stderr: "",
            exitCode: 0,
          },
        ],
      ]),
    );

    const manager = new AptPackageManager(
      false,
      runner,
      new AptOutputParser(logger),
      logger,
    );
    const out = await manager.remove(["vim"], false);

    expect(out).toEqual([
      expect.objectContaining({
        name: "vim",
        version: "2:9.0",
        status: "available",
      }),
    ]);
  });

  test("getPackageInfo uses apt-cache defaults once", async () => {
    const cmd = "/usr/bin/apt-cache --quiet=0 --no-all-versions show bash";
    const runner = new FakeCommandRunner(
      new Map([
        [
          cmd,
          {
            cmdLine: cmd,
            stdout:
              "Package: bash\nVersion: 5.0-6ubuntu1\nArchitecture: amd64\n\n",
            stderr: "",
            exitCode: 0,
          },
        ],
      ]),
    );

    const manager = new AptPackageManager(
      false,
      runner,
      new AptOutputParser(logger),
      logger,
    );
    const out = await manager.getPackageInfo(["bash"]);

    expect(out).toEqual([
      expect.objectContaining({
        name: "bash",
        version: "5.0-6ubuntu1",
        arch: "amd64",
      }),
    ]);
  });
});
