import assert from "node:assert/strict"
import { test } from "node:test"
import {
  age,
  clean,
  createMonitor,
  errorKind,
  openBrowser,
  type PullRequest,
  parsePR,
  type Snapshot,
  summarize,
} from "./model.ts"

const base: PullRequest = {
  number: 42,
  url: "https://github.com/owner/repo/pull/42",
  title: "Example",
  state: "OPEN",
  isDraft: false,
  headRefName: "feature",
  baseRefName: "main",
  additions: 20,
  deletions: 3,
  changedFiles: 2,
  updatedAt: "2026-09-10T12:00:00Z",
  mergeStateStatus: "CLEAN",
  mergeable: "MERGEABLE",
  reviewDecision: "",
  statusCheckRollup: [],
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

test("browser opening falls back without launching in SSH, headless, or unsupported sessions", async () => {
  for (const [platform, env, expected] of [
    ["darwin", { SSH_CONNECTION: "client server" }, /SSH session/],
    ["linux", { SSH_CLIENT: "client", DISPLAY: ":0" }, /SSH session/],
    ["darwin", { SSH_TTY: "/dev/pts/0" }, /SSH session/],
    ["linux", {}, /No graphical display/],
    ["win32", {}, /unavailable/],
  ] satisfies [NodeJS.Platform, NodeJS.ProcessEnv, RegExp][]) {
    const message = await openBrowser(base.url, "/repo", new AbortController().signal, {
      platform,
      env,
      execute: async () => assert.fail("must not launch a browser"),
    })
    assert.match(message ?? "", expected)
  }
})

test("local browser launches use the platform launcher and preserve the full URL", async () => {
  for (const [platform, env, launcher] of [
    ["darwin", {}, "open"],
    ["linux", { DISPLAY: ":0" }, "xdg-open"],
    ["linux", { WAYLAND_DISPLAY: "wayland-0" }, "xdg-open"],
  ] satisfies [NodeJS.Platform, NodeJS.ProcessEnv, string][]) {
    const signal = new AbortController().signal
    let calls = 0
    const message = await openBrowser(base.url, "/repo", signal, {
      platform,
      env,
      execute: async (...args) => {
        calls++
        assert.deepEqual(args, [launcher, [base.url], "/repo", signal])
        return ""
      },
    })
    assert.equal(calls, 1)
    assert.equal(message, undefined)
  }
})

test("missing, failed, or timed-out browser launchers return a URL fallback message", async () => {
  for (const failure of [{ code: "ENOENT" }, { code: 1 }, { killed: true }]) {
    const message = await openBrowser(base.url, "/repo", new AbortController().signal, {
      platform: "darwin",
      env: {},
      execute: async () => {
        throw failure
      },
    })
    assert.match(message ?? "", /Could not launch a browser.*URL below/)
  }
})

test("disposing the plugin does not launch a browser or show a fallback", async () => {
  const controller = new AbortController()
  assert.equal(
    await openBrowser(base.url, "/repo", controller.signal, {
      platform: "darwin",
      env: {},
      execute: async () => {
        controller.abort()
        throw new Error("aborted")
      },
    }),
    undefined,
  )
  assert.equal(
    await openBrowser(base.url, "/repo", controller.signal, {
      execute: async () => assert.fail("must not launch after disposal"),
    }),
    undefined,
  )
})

test("merge readiness uses combined state, not conflict detection alone", () => {
  for (const [patch, expected] of [
    [{}, "Ready to merge"],
    [{ isDraft: true }, "Blocked: draft"],
    [{ mergeable: "CONFLICTING" }, "Blocked: merge conflicts"],
    [{ mergeStateStatus: "BLOCKED" }, "Blocked by repository rules"],
    [{ mergeStateStatus: "BEHIND" }, "Behind base branch"],
    [{ mergeStateStatus: "UNSTABLE" }, "Checks not passing"],
    [{ mergeStateStatus: "HAS_HOOKS" }, "Merge hooks must pass"],
    [{ mergeStateStatus: "UNKNOWN" }, "Merge status unknown"],
    [{ mergeable: "UNKNOWN" }, "Merge status unknown"],
    [{ reviewDecision: "CHANGES_REQUESTED" }, "Changes requested"],
    [{ reviewDecision: "REVIEW_REQUIRED" }, "Awaiting required review"],
    [{ state: "MERGED" }, "Merged"],
    [{ state: "CLOSED" }, "Closed without merging"],
  ] satisfies [Partial<PullRequest>, string][])
    assert.equal(summarize({ ...base, ...patch }).merge, expected)
})

test("checks aggregate statuses and conclusions without inventing required blockers", () => {
  const status = summarize({
    ...base,
    statusCheckRollup: [
      { __typename: "StatusContext", context: "legacy", state: "ERROR" },
      { __typename: "StatusContext", context: "queued", state: "EXPECTED" },
      ...[
        "SUCCESS",
        "SKIPPED",
        "NEUTRAL",
        "FAILURE",
        "CANCELLED",
        "TIMED_OUT",
        "ACTION_REQUIRED",
        "STARTUP_FAILURE",
        "STALE",
      ].map((conclusion) => ({ name: conclusion, status: "COMPLETED", conclusion })),
      { name: "running", status: "IN_PROGRESS", conclusion: "" },
    ],
  })
  assert.deepEqual(
    [status.checks.passed, status.checks.failed, status.checks.pending, status.checks.skipped],
    [1, 7, 2, 2],
  )
  assert.equal(status.merge, "Ready to merge")
  assert.deepEqual(status.checks.details[0], { name: "legacy", state: "ERROR", category: "failed" })
  assert.deepEqual(
    status.checks.details.map((check) => check.category),
    [...Array(7).fill("failed"), ...Array(2).fill("pending"), "passed", "skipped", "skipped"],
  )
  assert.equal(summarize(base).checks.details.length, 0)
  assert.equal(summarize({ ...base, isDraft: true }).lifecycle, "Draft")
})

test("sanitize display strings, validate URLs and handle lookup errors", () => {
  assert.equal(clean("a\n\x1bb\u202ec"), "a b c")
  assert.deepEqual(parsePR(JSON.stringify(base)), base)
  for (const url of [
    "javascript:alert(1)",
    "https://user:pass@github.com/a/b/pull/1",
    "https://github.com/a/b/issues/1",
  ]) {
    assert.throws(() => parsePR(JSON.stringify({ ...base, url })))
  }
  assert.equal(errorKind({ stderr: "no pull requests found for branch" }), "absent")
  assert.equal(errorKind({ stderr: "HTTP 401 Bad credentials" }), "GitHub authentication required")
  assert.equal(errorKind({ stderr: "API rate limit exceeded" }), "GitHub rate limit reached")
  assert.equal(age("2026-09-10T12:00:00Z", Date.parse("2026-09-10T13:00:00Z")), "1h ago")
})

test("throttle refreshes, retain stale data on errors, clear missing PRs", async () => {
  let clock = 100000
  let calls = 0
  let failure: unknown
  let state!: Snapshot
  const monitor = createMonitor({
    directory: () => "/repo",
    publish: (value) => {
      state = value
    },
    now: () => clock,
    execute: async (file) => {
      if (file === "git") return "/repo\nfeature\n"
      calls++
      if (failure) throw failure
      return JSON.stringify(base)
    },
  })
  await monitor.tick()
  await settle()
  assert.equal(state.pr?.number, 42)
  await monitor.tick()
  await settle()
  assert.equal(calls, 1)
  clock += 10000
  await monitor.tick(false, true)
  await settle()
  assert.equal(calls, 2)
  failure = new Error("network")
  await monitor.tick(true)
  await settle()
  assert.equal(state.pr?.number, 42)
  assert.equal(state.error, "PR refresh failed")
  failure = { stderr: "no pull requests found" }
  await monitor.tick(true)
  await settle()
  assert.equal(state.pr, null)
  assert.equal(state.error, "")
  monitor.stop()
})

test("branch and directory changes discard in-flight responses", async () => {
  let cwd = "/repo-a"
  let branch = "feature"
  let state!: Snapshot
  const requests: { resolve: (value: string) => void; signal: AbortSignal }[] = []
  const snapshot = () => state
  const monitor = createMonitor({
    directory: () => cwd,
    publish: (value) => {
      state = value
    },
    execute: async (file, _args, directory, signal) => {
      if (file === "git") return `${directory}\n${branch}\n`
      return new Promise((resolve) => requests.push({ resolve, signal }))
    },
  })
  await monitor.tick()
  branch = "next"
  await monitor.tick()
  assert.equal(requests[0].signal.aborted, true)
  requests[0].resolve(JSON.stringify(base))
  await settle()
  assert.equal(state.pr, null)
  requests[1].resolve(JSON.stringify({ ...base, headRefName: "next" }))
  await settle()
  assert.equal(snapshot().pr?.headRefName, "next")
  cwd = "/repo-b"
  await monitor.tick()
  assert.equal(state.pr, null)
  monitor.stop()
  assert.equal(requests[2].signal.aborted, true)
  requests[2].resolve(JSON.stringify({ ...base, headRefName: "next" }))
  await settle()
  assert.equal(state.pr, null)
})

test("non-repositories and detached HEAD do not query GitHub", async () => {
  for (const detached of [true, false]) {
    const monitor = createMonitor({
      directory: () => "/tmp",
      publish: () => {},
      execute: async (file) => {
        assert.equal(file, "git")
        if (detached) return "/tmp\nHEAD\n"
        throw new Error("not a repository")
      },
    })
    await monitor.tick()
    monitor.stop()
  }
})
