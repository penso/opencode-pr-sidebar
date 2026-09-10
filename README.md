# PR sidebar

Global, read-only OpenCode TUI plugin, verified with OpenCode 1.18.13 on macOS.
Registered in `~/.config/opencode/tui.json`; no repository configuration needed.
Uses the existing authenticated GitHub CLI, with no additional credentials or
model calls. OpenCode supplies its Solid/OpenTUI runtime. The local development
dependencies pin those APIs for type-checking; the plugin needs no build step.

The card appears above Context when the working directory's current branch has a
PR, including merged/closed PRs. It shows draft/lifecycle, review decision, GitHub
merge eligibility, checks, PR additions/deletions and file count, update time,
refresh time, and auto-merge status. The title is a terminal hyperlink. Details
and Refresh are sidebar buttons. Open PR, Copy PR URL, Details, and Refresh remain
available in the command palette.
Opening and copying use macOS `open` and `pbcopy`.

Details opens a live, theme-aware modal with Status, Changes, Checks, and Activity
sections. Failed and pending checks appear first. Use Up/Down, Page Up/Down, or
the mouse wheel to scroll long content; Escape closes the modal. Scrollbar tracks
are hidden to avoid OpenTUI's initial-layout visibility flicker. Refresh updates
the modal and sidebar together, and failed refreshes display a stale-data warning.

Actions use padded OpenTUI boxes with theme-aware backgrounds and hover feedback,
following [OpenCode's own confirmation controls](https://github.com/anomalyco/opencode/blob/v1.18.13/packages/tui/src/ui/dialog-confirm.tsx).
The [TUI plugin API](https://github.com/anomalyco/opencode/blob/v1.18.13/packages/opencode/specs/tui-plugins.md)
exposes theme tokens and command registration, but no public Button component.
Refresh is dimmed while loading. Keyboard users can access every action through
the command palette; the buttons do not capture typing from the composer.

Git is checked every five seconds while the sidebar slot is mounted; GitHub is
queried at most once per minute normally, or after active-session completion with
a ten-second throttle. Manual refresh bypasses that throttle. Each subprocess
times out after fifteen seconds. Branch/directory changes clear the old card and
cancel outstanding work. Hiding the sidebar or disabling the plugin stops polling.
Network/authentication failures retain the last result with an explicit STALE
warning. Non-Git directories, detached HEAD, unsupported remotes, and missing PRs
hide the card. An initial lookup failure instead displays a short error.

Readiness is not inferred from conflict detection alone. GitHub must report CLEAN
and MERGEABLE, with no draft or outstanding required review, for "Ready to merge".
Check counts include optional checks; failures are not automatically described as
merge blockers. No checks is explicitly "No checks reported", not passing.
GitHub policy changes and the viewer's permissions can still prevent a merge;
this is a polled status display, not authorization to merge.

Scope is GitHub repositories supported by `gh`, not GitLab/Bitbucket. The local
branch must match the PR head branch; detached heads and differently named local
tracking branches do not display a PR. Remote-server attachment is not supported:
commands execute on the TUI machine. Data is held in memory only.

## Reload and verification

Quit and restart OpenCode after edits. Existing processes retain loaded modules.
Use the command palette's Show sidebar if the sidebar is hidden. The Plugins
dialog can disable `penso.pr-sidebar` without deleting files.

## Development

Requires Node.js 22.18 or newer, npm, and [just](https://just.systems/).
The UI is TSX; the model and tests are TypeScript. Node runs the model tests using
built-in type stripping, while OpenCode loads the TSX entrypoint directly.

From this directory:

```sh
just install
just check
```

| Command | Purpose |
| --- | --- |
| `just` | List available commands |
| `just install` | Install locked development dependencies without lifecycle scripts |
| `just fmt` | Format source/configuration and organize imports |
| `just fmt-check` | Check source/configuration formatting without edits |
| `just lint` | Check lint rules and import ordering |
| `just typecheck` | Strictly type-check the UI, model, and tests without emitting files |
| `just test` | Run isolated model tests without GitHub access |
| `just test-watch` | Re-run tests when source changes |
| `just check` | Run formatting, lint, type-checking, and tests |

Biome handles TypeScript/TSX and JSON formatting. Markdown follows the existing
style and is not included in Biome's formatting checks. DOM accessibility lint
rules are disabled because these are OpenTUI terminal components, not HTML;
actions remain available through OpenCode's keyboard-driven command palette.
Third-party declaration files are skipped by TypeScript, but all plugin source
and tests are checked. Dependencies are pinned in `package.json` and
`package-lock.json`; neither global OpenCode dependencies nor its configuration
are modified by `just install`.

### Manual TUI checks

TUI smoke checks: confirm the current PR card, open PR status details, refresh,
resize the terminal, hide/show the sidebar, and verify no-PR/non-Git directories.
A stable root box in the slot is important: returning an initially empty `Show`
prevented the slot from rendering when the asynchronous lookup completed.
