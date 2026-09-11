# PR sidebar

[![CI](https://github.com/penso/opencode-pr-sidebar/actions/workflows/ci.yml/badge.svg)](https://github.com/penso/opencode-pr-sidebar/actions/workflows/ci.yml)

CI checks formatting, lint, types, and tests on Node 24 for every push and pull request.

Read-only GitHub pull request sidebar for the OpenCode TUI, previously verified
with OpenCode 1.18.13 on macOS. Other OpenCode versions are not verified.
Register globally in `~/.config/opencode/tui.json`; no repository configuration needed.
Uses the existing authenticated GitHub CLI, with no additional credentials or
model calls. OpenCode supplies its Solid/OpenTUI runtime. The local development
dependencies pin those APIs for type-checking; the plugin needs no build step.

## Installation

Requires OpenCode with the TUI plugin API, Git, and an authenticated
[GitHub CLI](https://cli.github.com/) (`gh auth login`). Git and `gh` must be on
the TUI process's `PATH`.

Clone this repository into the global OpenCode configuration directory:

```sh
git clone https://github.com/penso/opencode-pr-sidebar.git ~/.config/opencode/pr-sidebar
```

Add the entry below to `~/.config/opencode/tui.json`, preserving any existing
settings and plugin entries:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["./pr-sidebar/index.tsx"]
}
```

The path is relative to `tui.json`; adjust it if you clone elsewhere. Register
the TSX file directly, not the directory or an npm package name. This repository
is a local-file plugin, not an npm-distributed package (`private: true` prevents
accidental npm publication, not a public GitHub repository). Development
dependencies are only needed for the checks below.

Quit and restart OpenCode, open a GitHub-backed working tree on a PR branch, and
use the command palette's Show sidebar if needed.

## Behavior

The card appears above Context when the working directory's current branch has a
PR, including merged/closed PRs. It shows draft/lifecycle, review decision, GitHub
merge eligibility, checks, PR additions/deletions and file count, update time,
refresh time, and auto-merge status. The title is a terminal hyperlink. Details
and Refresh are sidebar buttons. Open PR, Copy PR URL, Details, and Refresh remain
available in the command palette.
Clicking the title (or using Open PR) launches macOS `open` or Linux `xdg-open`.
Over SSH (`SSH_CONNECTION`, `SSH_CLIENT`, or `SSH_TTY`), on headless Linux, or on
other platforms, it opens Details with the full URL instead. Missing launchers,
launch errors, and timeouts also open Details with an explanatory message. A
successful launcher exit cannot confirm that a browser window actually appeared;
Details always provides the URL for manually opening it. Copying uses macOS `pbcopy`.

Details opens a live, theme-aware modal with the full, selectable PR URL (wrapped
on narrow terminals), plus Status, Changes, Checks, and Activity sections.
Failed and pending checks appear first. Use Up/Down, Page Up/Down, or
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
tracking branches do not display a PR and may show a lookup error instead.
Remote-server attachment is not supported:
commands execute on the TUI machine. Data is held in memory only.
Running OpenCode itself over SSH is supported; Git and authenticated `gh` must be
available on that remote machine. Browser fallback detection uses the TUI process's
environment; multiplexers that strip SSH variables may prevent SSH detection.

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

The current lockfile resolves packages through the Microsoft-hosted
`ms-feed-25.pkgs.visualstudio.com` npm mirror, not `registry.npmjs.org`, and uses
SHA-1 integrity hashes. A clean development install requires access to that mirror.

### Manual TUI checks

TUI smoke checks: confirm the current PR card, open PR status details, refresh,
resize the terminal, hide/show the sidebar, and verify no-PR/non-Git directories.
Check that Details shows the entire URL on narrow terminals. Over SSH, clicking
the title and using Open PR should show Details without launching a remote browser.
Locally, a missing or failing browser launcher should show the same URL fallback.
A stable root box in the slot is important: returning an initially empty `Show`
prevented the slot from rendering when the asynchronous lookup completed.
