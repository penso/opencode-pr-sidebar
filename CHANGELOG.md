# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Local development tooling with pinned dependencies and a lockfile, plus `just`
  recipes for installation, formatting, linting, strict type-checking, tests,
  watch mode, and a combined quality gate.
- Global OpenCode TUI sidebar card for the current branch's GitHub pull request,
  displayed above the Context section.
- PR number, linked title, source and target branches, lifecycle and draft status,
  review decision, merge readiness, and auto-merge status.
- Passed, failed, pending, and skipped check counts, with explicit reporting when
  no checks exist. Optional check failures do not imply a merge blocker.
- PR additions, deletions, changed-file count, last update, and last successful
  refresh time.
- Open, Copy URL, Details, and Refresh actions in the sidebar and command palette.
  Browser and clipboard actions support macOS.
- Automatic refresh with throttling, subprocess timeouts, cancellation, and
  protection against outdated responses after branch or directory changes.
- Explicit stale-data warnings after refresh failures, using the existing GitHub
  CLI authentication without additional credentials or model calls.
- Logic tests for status interpretation, response validation, refresh throttling,
  stale data, branch and directory changes, and non-repository behavior.
- Documentation covering setup, behavior, limitations, and verification.

### Fixed

- Keep the sidebar slot's root mounted so the card appears when its initial
  asynchronous PR lookup completes.
- Avoid displaying the merged or closed lifecycle twice in the card and details.

### Changed

- Convert the model and tests from JavaScript modules to TypeScript, and replace
  the UI's untyped state with a shared snapshot type.
- Apply consistent Biome formatting and import ordering to source/configuration.
