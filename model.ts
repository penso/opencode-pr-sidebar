import { execFile } from "node:child_process"

export type PullRequest = {
  number: number
  url: string
  title: string
  state: "OPEN" | "CLOSED" | "MERGED"
  isDraft: boolean
  headRefName: string
  baseRefName: string
  additions: number
  deletions: number
  changedFiles: number
  updatedAt: string
  mergeStateStatus: string
  mergeable: string
  reviewDecision: string
  autoMergeRequest?: object | null
  statusCheckRollup: {
    __typename?: string
    name?: string
    context?: string
    state?: string
    status?: string
    conclusion?: string | null
  }[]
}

export type Snapshot = {
  pr: PullRequest | null
  error: string
  fetchedAt: number
  now: number
  loading: boolean
  directory?: string
  branch?: string
}

export const fields =
  "url,number,title,state,isDraft,additions,deletions,changedFiles,headRefName,baseRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,autoMergeRequest,updatedAt"

export function run(
  file: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  input?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GH_PROMPT_DISABLED: "1",
      GIT_TERMINAL_PROMPT: "0",
      NO_COLOR: "1",
    }
    // A launching shell's overrides must not select another worktree or repository.
    for (const key of ["GH_REPO", "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"])
      delete env[key]
    const child = execFile(
      file,
      args,
      { cwd, env, signal, timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stderr }))
        } else resolve(stdout)
      },
    )
    child.stdin?.on("error", () => {})
    child.stdin?.end(input)
  })
}

export function clean(value: unknown) {
  return (
    String(value ?? "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Strip terminal controls and bidi overrides from provider text.
      .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  )
}

export function summarize(pr: PullRequest) {
  const checks = { passed: 0, failed: 0, pending: 0, skipped: 0, details: [] as string[] }
  for (const check of pr.statusCheckRollup ?? []) {
    const state =
      (check.__typename === "StatusContext"
        ? check.state
        : check.status !== "COMPLETED"
          ? "PENDING"
          : check.conclusion) ?? "UNKNOWN"
    const category = ["SUCCESS"].includes(state)
      ? "passed"
      : ["NEUTRAL", "SKIPPED"].includes(state)
        ? "skipped"
        : [
              "FAILURE",
              "ERROR",
              "CANCELLED",
              "TIMED_OUT",
              "ACTION_REQUIRED",
              "STARTUP_FAILURE",
              "STALE",
            ].includes(state)
          ? "failed"
          : "pending"
    checks[category]++
    checks.details.push(`${clean(check.name ?? check.context)}: ${clean(state || "UNKNOWN")}`)
  }
  const reviews: Record<string, string> = {
    APPROVED: "Approved",
    CHANGES_REQUESTED: "Changes requested",
    REVIEW_REQUIRED: "Review required",
  }
  const review = reviews[pr.reviewDecision] ?? "No review decision"
  const lifecycle =
    pr.state === "MERGED"
      ? "Merged"
      : pr.state === "CLOSED"
        ? "Closed"
        : pr.isDraft
          ? "Draft"
          : "Open / Ready for review"
  let merge = "Merge status unknown"
  let tone: "warning" | "success" | "error" | "textMuted" = "warning"
  if (pr.state !== "OPEN") {
    merge = pr.state === "MERGED" ? "Merged" : "Closed without merging"
    tone = pr.state === "MERGED" ? "success" : "textMuted"
  } else if (pr.isDraft || pr.mergeStateStatus === "DRAFT") {
    merge = "Blocked: draft"
  } else if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") {
    merge = "Blocked: merge conflicts"
    tone = "error"
  } else if (pr.reviewDecision === "CHANGES_REQUESTED") {
    merge = "Changes requested"
    tone = "error"
  } else if (pr.mergeStateStatus === "BLOCKED") {
    merge = "Blocked by repository rules"
  } else if (pr.mergeStateStatus === "BEHIND") {
    merge = "Behind base branch"
  } else if (pr.mergeStateStatus === "UNSTABLE") {
    merge = "Checks not passing"
  } else if (pr.mergeStateStatus === "HAS_HOOKS") {
    merge = "Merge hooks must pass"
  } else if (pr.reviewDecision === "REVIEW_REQUIRED") {
    merge = "Awaiting required review"
  } else if (pr.mergeStateStatus === "CLEAN" && pr.mergeable === "MERGEABLE") {
    merge = "Ready to merge"
    tone = "success"
  }
  return { lifecycle, merge, tone, review, checks }
}

export function age(time: string | number | undefined, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - new Date(time ?? NaN).getTime()) / 1000))
  if (!Number.isFinite(seconds)) return "unknown"
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function parsePR(text: string): PullRequest {
  const pr = JSON.parse(text)
  if (
    !pr ||
    typeof pr !== "object" ||
    !Number.isInteger(pr.number) ||
    pr.number < 1 ||
    !["OPEN", "CLOSED", "MERGED"].includes(pr.state)
  )
    throw new Error("Invalid PR response")
  const url = new URL(pr.url)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !/^\/[^/]+\/[^/]+\/pull\/\d+$/.test(url.pathname)
  )
    throw new Error("Invalid PR URL")
  for (const key of ["title", "headRefName", "baseRefName", "updatedAt"])
    if (typeof pr[key] !== "string") throw new Error("Invalid PR response")
  for (const key of ["additions", "deletions", "changedFiles"])
    if (!Number.isInteger(pr[key]) || pr[key] < 0) throw new Error("Invalid PR response")
  if (typeof pr.isDraft !== "boolean" || !Array.isArray(pr.statusCheckRollup))
    throw new Error("Invalid PR response")
  return pr
}

export function errorKind(error: unknown) {
  const detail =
    error && typeof error === "object"
      ? (error as { stderr?: unknown; message?: unknown; code?: unknown })
      : {}
  const text = String(detail.stderr ?? detail.message ?? "")
  if (/no pull requests? found|no GitHub remotes|none of the git remotes.*GitHub/i.test(text))
    return "absent"
  if (detail.code === "ENOENT") return "GitHub CLI unavailable"
  if (/auth login|authentication|HTTP 401|Bad credentials|not logged/i.test(text))
    return "GitHub authentication required"
  if (/rate limit/i.test(text)) return "GitHub rate limit reached"
  return "PR refresh failed"
}

export function createMonitor({
  directory,
  publish,
  execute = run,
  now = Date.now,
}: {
  directory: () => string
  publish: (value: Snapshot) => void
  execute?: typeof run
  now?: () => number
}) {
  let current: Snapshot = { pr: null, error: "", fetchedAt: 0, now: now(), loading: false }
  let key = ""
  let version = 0
  let stopped = false
  let detecting = false
  let attempt = 0
  let request: AbortController | undefined
  let detection: AbortController | undefined
  let pendingForce = false
  const emit = (patch: Partial<Snapshot>) => {
    current = { ...current, ...patch, now: now() }
    publish(current)
  }
  const reset = (next: string) => {
    key = next
    version++
    request?.abort()
    request = undefined
    attempt = 0
    emit({ pr: null, error: "", fetchedAt: 0, loading: false })
  }
  async function tick(force = false, activity = false) {
    if (stopped) return
    if (detecting) {
      pendingForce ||= force || activity
      return
    }
    detecting = true
    const cwd = directory()
    try {
      if (!cwd) {
        if (key) reset("")
        return
      }
      if (current.directory !== cwd) {
        reset("")
        emit({ directory: cwd })
      }
      const controller = new AbortController()
      detection = controller
      let git: string
      try {
        git = await execute(
          "git",
          ["rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD"],
          cwd,
          controller.signal,
        )
      } catch {
        if (!stopped && directory() === cwd) reset("")
        return
      }
      if (stopped || directory() !== cwd) return
      const [root, branch] = git.trim().split("\n")
      if (!root || !branch || branch === "HEAD") {
        reset("")
        return
      }
      const next = JSON.stringify([cwd, root, branch])
      if (next !== key) reset(next)
      emit({ branch })
      if (request || (!force && attempt && now() - attempt < (activity ? 10000 : 60000))) return
      const expected = version
      const abort = new AbortController()
      request = abort
      attempt = now()
      emit({ loading: true })
      // Detection remains independent so a slow GitHub response cannot mask a branch switch.
      void execute("gh", ["pr", "view", "--json", fields], cwd, abort.signal)
        .then((text) => {
          if (stopped || expected !== version || directory() !== cwd) return
          const pr = parsePR(text)
          if (pr.headRefName !== branch) throw new Error("PR branch does not match current branch")
          emit({ pr, error: "", fetchedAt: now() })
        })
        .catch((error) => {
          if (stopped || expected !== version || directory() !== cwd) return
          const kind = errorKind(error)
          emit(kind === "absent" ? { pr: null, error: "", fetchedAt: now() } : { error: kind })
        })
        .finally(() => {
          if (expected !== version || stopped) return
          request = undefined
          emit({ loading: false })
        })
    } finally {
      detecting = false
      detection = undefined
      if (pendingForce && !stopped) {
        pendingForce = false
        void tick(true)
      }
    }
  }
  return {
    tick,
    stop() {
      stopped = true
      version++
      request?.abort()
      detection?.abort()
    },
  }
}
