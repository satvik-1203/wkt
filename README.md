# WKT

Git worktree manager for macOS.

## Build from source

Requires [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/).

```bash
git clone <repo-url>
cd dev-ux
pnpm install
pnpm make
```

The built `.dmg` will be at:

```
out/make/WKT-1.0.0-arm64.dmg
```

Open the `.dmg` and drag **WKT.app** into your Applications folder.

### "WKT is damaged and can't be opened"

The app isn't code-signed, so macOS Gatekeeper blocks it. After moving WKT to Applications, run:

```bash
xattr -cr /Applications/WKT.app
```

Then open it normally.

### Development

```bash
pnpm start
```
