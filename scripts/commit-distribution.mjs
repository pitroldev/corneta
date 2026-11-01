import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const [channel, checkout, version] = process.argv.slice(2);
const repositories = {
  scoop: "pitroldev/scoop-corneta",
  chocolatey: "pitroldev/chocolatey-corneta",
};
const paths = {
  scoop: ["bucket/corneta.json"],
  chocolatey: ["corneta.nuspec", "tools/chocolateyInstall.ps1"],
};
if (
  !repositories[channel] ||
  process.env.GITHUB_REPOSITORY !== repositories[channel] ||
  !/^\d+\.\d+\.\d+$/.test(version) ||
  !process.env.GH_TOKEN ||
  !checkout
)
  throw new Error(
    "Package commits require the intended repository, version, and workflow token.",
  );
const cwd = resolve(checkout);
function git(args, env = process.env) {
  const result = spawnSync("git", args, {
    cwd,
    env,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0)
    throw new Error("Package Git operation failed: " + result.stderr);
  return result.stdout.trim();
}
const remote = git(["remote", "get-url", "origin"]);
if (
  ![
    "https://github.com/" + repositories[channel],
    "https://github.com/" + repositories[channel] + ".git",
  ].includes(remote)
)
  throw new Error("Unexpected package repository origin.");
git(["add", "--", ...paths[channel]]);
const staged = git(["diff", "--cached", "--name-only"])
  .split("\n")
  .filter(Boolean);
if (staged.some((path) => !paths[channel].includes(path)))
  throw new Error("Unexpected staged files; package publication blocked.");
if (staged.length) {
  git([
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit",
    "-m",
    "chore: update Corneta to " + version,
  ]);
  git(["push", "origin", "HEAD:main"], {
    ...process.env,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0:
      "AUTHORIZATION: basic " +
      Buffer.from("x-access-token:" + process.env.GH_TOKEN).toString("base64"),
  });
}
console.log(
  staged.length
    ? "Package version committed."
    : "Package version is already current.",
);
