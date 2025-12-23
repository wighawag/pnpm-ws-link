# pnpm-ws-link

A CLI tool to generate pnpm overrides for linking external workspace packages.

## Description

`pnpm-ws-link` helps you link packages from external monorepos into your current project by automatically generating the necessary `pnpm.overrides` in your `package.json`. It scans the provided package directories, identifies their `workspace:` dependencies, resolves the paths, and adds link overrides.

## Installation

```bash
npm install -g pnpm-ws-link
# or
pnpm add -g pnpm-ws-link
# or if you use volta
volta install pnpm-ws-link
```

## Usage

Run the command in the root of the repository where you want to add the overrides:

```bash
pnpm-ws-link /path/to/external/package1 /path/to/external/package2
```

This will:

- Read the `package.json` of each specified package directory.
- Add the packages themselves to the overrides.
- For any `workspace:` dependencies in their `dependencies` field, resolve their paths and add them to overrides.
- Update your `package.json` with the new `pnpm.overrides`.

### Options

- `--dry`: Preview the overrides without modifying `package.json`.

```bash
pnpm-ws-link --dry /path/to/external/package
```

## Example

Suppose you have an external monorepo with packages `pkg-a` and `pkg-b`, where `pkg-a` depends on `pkg-b` via `workspace:*`.

Running:

```bash
pnpm-ws-link /external/repo/packages/pkg-a
```

Will add to your `package.json`:

```json
{
	"pnpm": {
		"overrides": {
			"pkg-a": "link:../external/repo/packages/pkg-a",
			"pkg-b": "link:../external/repo/packages/pkg-b"
		}
	}
}
```

## Requirements

- The external packages must be in directories containing `package.json`.
- If a package has `workspace:` dependencies, the tool will look for `pnpm-workspace.yaml` upward from the package directory to resolve the workspace packages.
