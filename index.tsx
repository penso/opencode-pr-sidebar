/** @jsxImportSource @opentui/solid */
import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"
import { age, clean, createMonitor, run, type Snapshot, summarize } from "./model.ts"

export default {
  id: "penso.pr-sidebar",
  async tui(api) {
    const [state, setState] = createSignal<Snapshot>({
      pr: null,
      error: "",
      fetchedAt: 0,
      now: Date.now(),
      loading: false,
    })
    let monitor: ReturnType<typeof createMonitor> | undefined
    const directory = () => api.state.path.directory
    const pr = () => (state().directory === directory() ? state().pr : null)
    const toast = (message: string, variant: "info" | "error" = "info") =>
      api.ui.toast({ title: "Pull Request", message, variant })

    async function open() {
      const value = pr()
      if (!value) return
      try {
        if (process.platform !== "darwin") throw new Error("Unsupported platform")
        await run("open", [value.url], directory(), api.lifecycle.signal)
      } catch {
        toast("Could not open PR in your browser", "error")
      }
    }
    async function copy() {
      const value = pr()
      if (!value) return
      try {
        if (process.platform !== "darwin") throw new Error("Unsupported platform")
        await run("pbcopy", [], directory(), api.lifecycle.signal, value.url)
        toast("PR URL copied")
      } catch {
        toast("Could not copy PR URL", "error")
      }
    }
    function details() {
      const value = pr()
      if (!value) return
      const status = summarize(value)
      const Alert = api.ui.DialogAlert
      api.ui.dialog.replace(() => (
        <Alert
          title={`PR #${value.number}`}
          message={[
            clean(value.title),
            value.url,
            `${clean(value.headRefName)} -> ${clean(value.baseRefName)}`,
            value.state === "OPEN" ? `${status.lifecycle} | ${status.merge}` : status.lifecycle,
            `Review: ${status.review}`,
            `GitHub merge state: ${clean(value.mergeStateStatus)} / ${clean(value.mergeable)}`,
            ...status.checks.details,
            !status.checks.details.length
              ? "No checks reported"
              : "Check results include optional checks; GitHub determines merge eligibility.",
            `+${value.additions} -${value.deletions} in ${value.changedFiles} files`,
            value.autoMergeRequest ? "Auto-merge enabled" : "Auto-merge disabled",
            `PR updated: ${value.updatedAt}`,
            `Last successful refresh: ${new Date(state().fetchedAt).toLocaleString()}`,
            state().error ? `STALE: ${state().error}` : "",
          ]
            .filter(Boolean)
            .join("\n")}
        />
      ))
    }
    api.keymap.registerLayer({
      commands: [
        { name: "penso.pr.open", title: "Open PR on GitHub", run: open },
        { name: "penso.pr.copy", title: "Copy PR URL", run: copy },
        { name: "penso.pr.details", title: "PR status details", run: details },
        {
          name: "penso.pr.refresh",
          title: "Refresh PR status",
          run: () => {
            void monitor?.tick(true)
          },
        },
      ].map((command) => ({
        ...command,
        category: "Pull Request",
        namespace: "palette",
        enabled: () => (command.name === "penso.pr.refresh" ? Boolean(monitor) : Boolean(pr())),
      })),
    })
    api.event.on("session.status", (event) => {
      if (event.properties.status.type !== "idle") return
      const route = api.route.current
      if (route.name === "session" && route.params?.sessionID === event.properties.sessionID)
        void monitor?.tick(false, true)
    })
    api.event.on("vcs.branch.updated", () => {
      void monitor?.tick()
    })
    api.lifecycle.onDispose(() => monitor?.stop())

    function Card() {
      const theme = () => api.theme.current
      const status = () => {
        const value = pr()
        return value ? summarize(value) : null
      }
      onMount(() => {
        monitor = createMonitor({ directory, publish: setState })
        void monitor.tick()
      })
      createEffect(() => {
        directory()
        api.state.vcs?.branch
        void monitor?.tick()
      })
      const timer = setInterval(() => {
        void monitor?.tick()
      }, 5000)
      onCleanup(() => {
        clearInterval(timer)
        monitor?.stop()
        monitor = undefined
      })
      // The slot registry needs a stable root even before the first lookup completes.
      return (
        <box visible={Boolean(pr() || state().error)} gap={1} flexShrink={0}>
          <text fg={theme().text}>
            <b>Pull Request</b>
          </text>
          <Show when={pr()}>
            <box>
              <text
                fg={theme().primary}
                onMouseUp={() => {
                  void open()
                }}
              >
                <b>#{pr()?.number}</b> <a href={pr()?.url ?? ""}>{clean(pr()?.title)}</a>
              </text>
              <text fg={theme().textMuted}>
                {clean(pr()?.headRefName)} -&gt; {clean(pr()?.baseRefName)}
              </text>
            </box>
            <box>
              <text
                fg={
                  pr()?.state === "MERGED"
                    ? theme().success
                    : pr()?.state === "CLOSED"
                      ? theme().error
                      : theme().text
                }
              >
                {status()?.lifecycle}
              </text>
              <Show when={pr()?.state === "OPEN"}>
                <text fg={theme()[status()?.tone ?? "textMuted"]}>
                  <b>{status()?.merge}</b>
                </text>
              </Show>
              <text fg={theme().textMuted}>Review: {status()?.review}</text>
              <text fg={status()?.checks.failed ? theme().warning : theme().textMuted}>
                {status()?.checks.details.length
                  ? `Checks: ${status()?.checks.passed} passed / ${status()?.checks.failed} failed / ${status()?.checks.pending} pending${status()?.checks.skipped ? ` / ${status()?.checks.skipped} skipped` : ""}`
                  : "No checks reported"}
              </text>
              <Show when={pr()?.autoMergeRequest}>
                <text fg={theme().primary}>Auto-merge enabled</text>
              </Show>
            </box>
            <box>
              <text>
                <span style={{ fg: theme().diffAdded }}>+{pr()?.additions.toLocaleString()}</span>{" "}
                <span style={{ fg: theme().diffRemoved }}>-{pr()?.deletions.toLocaleString()}</span>
                <span style={{ fg: theme().textMuted }}> / {pr()?.changedFiles} files</span>
              </text>
              <text fg={theme().textMuted}>Updated {age(pr()?.updatedAt, state().now)}</text>
              <text fg={theme().textMuted}>
                {state().loading
                  ? "Refreshing..."
                  : `Checked ${age(state().fetchedAt, state().now)}`}
              </text>
            </box>
          </Show>
          <Show when={state().error}>
            <text fg={theme().warning}>
              {pr() ? "STALE: " : ""}
              {state().error}
            </text>
          </Show>
          <box flexDirection="row" gap={2}>
            <Show when={pr()}>
              <text
                fg={theme().primary}
                onMouseUp={() => {
                  void open()
                }}
              >
                Open
              </text>
              <text
                fg={theme().primary}
                onMouseUp={() => {
                  void copy()
                }}
              >
                Copy URL
              </text>
              <text fg={theme().primary} onMouseUp={details}>
                Details
              </text>
            </Show>
            <text
              fg={theme().primary}
              onMouseUp={() => {
                void monitor?.tick(true)
              }}
            >
              Refresh
            </text>
          </box>
        </box>
      )
    }
    api.slots.register({ order: 50, slots: { sidebar_content: () => <Card /> } })
  },
} satisfies TuiPluginModule
