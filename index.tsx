/** @jsxImportSource @opentui/solid */
import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { age, clean, createMonitor, openBrowser, run, type Snapshot, summarize } from "./model.ts"

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
      const cwd = directory()
      const message = await openBrowser(value.url, cwd, api.lifecycle.signal)
      if (
        message &&
        !api.lifecycle.signal.aborted &&
        directory() === cwd &&
        pr()?.url === value.url
      )
        details(message)
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
    function details(message = "") {
      if (!pr()) return
      api.ui.dialog.replace(() => <Details message={message} />)
    }

    function Details(props: { message: string }) {
      let scroll: ScrollBoxRenderable | undefined
      const dimensions = useTerminalDimensions()
      const theme = () => api.theme.current
      const status = () => {
        const value = pr()
        return value ? summarize(value) : null
      }
      const checkTone = {
        passed: "success",
        failed: "error",
        pending: "warning",
        skipped: "textMuted",
      } as const
      createEffect(() => {
        api.ui.dialog.setSize(dimensions().width >= 100 ? "large" : "medium")
      })
      const disposeKeys = api.keymap.registerLayer({
        mode: "modal",
        bindings: [
          { key: "up", cmd: () => scroll?.scrollBy(-1) },
          { key: "down", cmd: () => scroll?.scrollBy(1) },
          { key: "pageup", cmd: () => scroll?.scrollBy(-1, "viewport") },
          { key: "pagedown", cmd: () => scroll?.scrollBy(1, "viewport") },
          { key: "home", cmd: () => scroll?.scrollTo(0) },
          { key: "end", cmd: () => scroll?.scrollTo(scroll.scrollHeight) },
        ],
      })
      onCleanup(disposeKeys)
      return (
        <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
          <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <text fg={theme().text}>
              <b>Pull Request {pr() ? `#${pr()?.number}` : ""}</b>
            </text>
            <text fg={theme().textMuted} onMouseUp={() => api.ui.dialog.clear()}>
              esc
            </text>
          </box>
          <scrollbox
            ref={(element) => {
              scroll = element
            }}
            scrollX={false}
            // OpenTUI's auto-visibility can flash while initial text wrapping settles.
            scrollbarOptions={{ visible: false }}
            height={Math.max(
              3,
              Math.min(
                24 + (status()?.checks.details.length ?? 0) * 2,
                Math.floor(dimensions().height * 0.75) - 7,
              ),
            )}
            contentOptions={{ gap: 1 }}
          >
            <Show
              when={pr()}
              fallback={<text fg={theme().textMuted}>No pull request for the current branch.</text>}
            >
              <box flexShrink={0}>
                <text fg={theme().primary}>
                  <b>
                    <a href={pr()?.url ?? ""}>{clean(pr()?.title)}</a>
                  </b>
                </text>
                <Show when={props.message}>
                  <text fg={theme().warning}>{props.message}</text>
                </Show>
                <text fg={theme().primary} wrapMode="char">
                  <a href={pr()?.url ?? ""}>{pr()?.url}</a>
                </text>
                <text fg={theme().text}>
                  <span style={{ fg: theme().textMuted }}>Branch </span>
                  {clean(pr()?.headRefName)} -&gt; {clean(pr()?.baseRefName)}
                </text>
              </box>
              <Show when={state().error}>
                <box
                  backgroundColor={theme().backgroundElement}
                  paddingLeft={1}
                  paddingRight={1}
                  flexShrink={0}
                >
                  <text fg={theme().warning}>
                    <b>STALE DATA</b> / {state().error}
                  </text>
                  <text fg={theme().textMuted}>
                    Showing the last successful result. Refresh to retry.
                  </text>
                </box>
              </Show>
              <box flexShrink={0}>
                <text fg={theme().text}>
                  <b>Status</b>
                </text>
                <text
                  fg={
                    pr()?.state === "MERGED"
                      ? theme().success
                      : pr()?.state === "CLOSED"
                        ? theme().error
                        : theme().primary
                  }
                >
                  {status()?.lifecycle}
                </text>
                <Show when={pr()?.state === "OPEN"}>
                  <text fg={theme()[status()?.tone ?? "textMuted"]}>
                    <b>{status()?.merge}</b>
                  </text>
                </Show>
                <text
                  fg={
                    pr()?.reviewDecision === "APPROVED"
                      ? theme().success
                      : pr()?.reviewDecision === "CHANGES_REQUESTED"
                        ? theme().error
                        : theme().textMuted
                  }
                >
                  Review {status()?.review}
                </text>
                <Show when={pr()?.state === "OPEN"}>
                  <text fg={theme().textMuted}>
                    Auto-merge {pr()?.autoMergeRequest ? "Enabled" : "Off"}
                  </text>
                </Show>
              </box>
              <box flexShrink={0}>
                <text fg={theme().text}>
                  <b>Changes</b>
                </text>
                <text>
                  <span style={{ fg: theme().diffAdded }}>
                    <b>+{pr()?.additions.toLocaleString()}</b> added
                  </span>
                  <span style={{ fg: theme().textMuted }}> / </span>
                  <span style={{ fg: theme().diffRemoved }}>
                    <b>-{pr()?.deletions.toLocaleString()}</b> removed
                  </span>
                  <span style={{ fg: theme().textMuted }}> / {pr()?.changedFiles} files</span>
                </text>
              </box>
              <box flexShrink={0}>
                <text fg={theme().text}>
                  <b>Checks</b>
                </text>
                <Show
                  when={status()?.checks.details.length}
                  fallback={
                    <text fg={theme().textMuted}>
                      No checks reported. This does not mean CI passed.
                    </text>
                  }
                >
                  <text>
                    <span style={{ fg: theme().success }}>{status()?.checks.passed} passed</span>
                    <span style={{ fg: theme().error }}> / {status()?.checks.failed} failed</span>
                    <span style={{ fg: theme().warning }}>
                      {" "}
                      / {status()?.checks.pending} pending
                    </span>
                    <span style={{ fg: theme().textMuted }}>
                      {" "}
                      / {status()?.checks.skipped} skipped
                    </span>
                  </text>
                  <box marginTop={1}>
                    <For each={status()?.checks.details}>
                      {(check) => (
                        <text fg={theme().text}>
                          <span style={{ fg: theme()[checkTone[check.category]] }}>
                            [{check.category.toUpperCase()}]{" "}
                          </span>
                          {check.name}
                          <span style={{ fg: theme().textMuted }}>
                            {" "}
                            / {check.state.toLowerCase().replaceAll("_", " ")}
                          </span>
                        </text>
                      )}
                    </For>
                  </box>
                  <text fg={theme().textMuted}>
                    Includes optional checks. GitHub determines merge eligibility.
                  </text>
                </Show>
              </box>
              <box flexShrink={0}>
                <text fg={theme().text}>
                  <b>Activity</b>
                </text>
                <text fg={theme().textMuted}>
                  PR updated {new Date(pr()?.updatedAt ?? NaN).toLocaleString()} (
                  {age(pr()?.updatedAt, state().now)})
                </text>
                <text fg={state().error ? theme().warning : theme().textMuted}>
                  Last checked {new Date(state().fetchedAt).toLocaleString()}
                </text>
                <Show when={pr()?.state === "OPEN"}>
                  <text fg={theme().textMuted}>
                    GitHub merge state {clean(pr()?.mergeStateStatus)} / {clean(pr()?.mergeable)}
                  </text>
                </Show>
              </box>
            </Show>
          </scrollbox>
          <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <text fg={theme().textMuted}>Up/Down / PgUp/PgDn to scroll</text>
            <ActionButton
              label={state().loading ? "Refreshing" : "Refresh"}
              disabled={state().loading}
              onPress={() => {
                void monitor?.tick(true)
              }}
            />
          </box>
        </box>
      )
    }
    api.keymap.registerLayer({
      commands: [
        { name: "penso.pr.open", title: "Open PR on GitHub", run: open },
        { name: "penso.pr.copy", title: "Copy PR URL", run: copy },
        { name: "penso.pr.details", title: "PR status details", run: () => details() },
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

    function ActionButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
      const [hovered, setHovered] = createSignal(false)
      const [pressed, setPressed] = createSignal(false)
      const theme = () => api.theme.current
      const highlighted = () => !props.disabled && hovered()
      return (
        <box
          height={1}
          flexShrink={0}
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={highlighted() ? theme().primary : theme().backgroundElement}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => {
            setHovered(false)
            setPressed(false)
          }}
          onMouseDown={(event) => {
            if (event.button === 0 && !props.disabled) setPressed(true)
          }}
          onMouseUp={(event) => {
            const activate = pressed() && event.button === 0 && !props.disabled
            setPressed(false)
            if (!activate || api.renderer.getSelection()?.getSelectedText()) return
            event.stopPropagation()
            props.onPress()
          }}
        >
          <text
            fg={
              props.disabled
                ? theme().textMuted
                : highlighted()
                  ? theme().selectedListItemText
                  : theme().text
            }
          >
            {props.label}
          </text>
        </box>
      )
    }

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
                onMouseUp={(event) => {
                  if (event.button !== 0 || api.renderer.getSelection()?.getSelectedText()) return
                  event.stopPropagation()
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
          <box flexDirection="row" flexWrap="wrap" gap={1}>
            <Show when={pr()}>
              <ActionButton label="Details" onPress={() => details()} />
            </Show>
            <ActionButton
              label="Refresh"
              disabled={state().loading}
              onPress={() => {
                void monitor?.tick(true)
              }}
            />
          </box>
        </box>
      )
    }
    api.slots.register({ order: 50, slots: { sidebar_content: () => <Card /> } })
  },
} satisfies TuiPluginModule
