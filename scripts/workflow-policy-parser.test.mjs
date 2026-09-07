import { expect, it } from "vitest";
import { assertLockedWorkflows } from "./workflow-policy.mjs";
const fixture = (run) => `jobs:\n  test:\n    steps:\n      - run: ${run}\n`;
const required = { "cargo test": 1 };
it.each([
  "cargo test --locked",
  "cargo test --locked -- --nocapture",
  "cargo 'test' \"--locked\" -- '--nocapture'",
  "|\n          cargo test --locked",
  ">-\n          cargo test\n          --locked",
  "|\n          # cargo test without a lock is only a comment\n          cargo test `\n            --locked",
])("inspects effective commands in YAML %s", (run) => {
  expect(assertLockedWorkflows([fixture(run)], required)).toEqual(required);
});
it.each([
  "cargo test",
  "cargo test -- --locked",
  "|\n          cargo test",
  "|\n          cargo test # --locked",
  "|\n          echo --locked; cargo test",
])("rejects a missing effective lock: %s", (run) => {
  expect(() => assertLockedWorkflows([fixture(run)], required)).toThrow(
    "--locked",
  );
});
it.each([
  "echo ok",
  "|\n          # cargo test --locked",
  "echo 'cargo test --locked'",
  'echo "cargo test --locked"; echo fine',
])("rejects zero inspected commands: %s", (run) => {
  expect(() => assertLockedWorkflows([fixture(run)], required)).toThrow(
    "not inspected",
  );
});
it("requires Tauri's cargo argument separator, not a lock buried in config or a CLI option", () => {
  const minimum = { "pnpm tauri build": 1 };
  for (const run of [
    "pnpm tauri build --locked",
    "pnpm tauri build --config 'contains --locked'",
    "pnpm tauri build -- -- --locked",
  ])
    expect(() => assertLockedWorkflows([fixture(run)], minimum)).toThrow(
      "--locked",
    );
  expect(
    assertLockedWorkflows([fixture("pnpm tauri build -- --locked")], minimum),
  ).toEqual(minimum);
});
it("rejects missing jobs/steps and duplicate YAML keys", () => {
  for (const source of ["name: Empty", "jobs: {}", "jobs: {}\njobs: {}"])
    expect(() => assertLockedWorkflows([source], required)).toThrow();
});
