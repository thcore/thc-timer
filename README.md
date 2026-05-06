# thc-timer

Personal desktop work timer — stopwatch + pomodoro, session log persisted locally.

Built with Tauri 2 + React + TypeScript.

## Develop

```powershell
npm install
npm run tauri dev
```

## Build a local installer

```powershell
npm run tauri build
```

Outputs land in `src-tauri/target/release/bundle/`.

## Releasing a new version (with auto-update)

The app auto-checks `https://github.com/thcore/thc-timer/releases/latest/download/latest.json` on startup. To ship a new version:

### One-time setup (GitHub repo → Settings → Secrets and variables → Actions)

Create two repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY` — paste the **entire contents** of `C:\Users\shenc\.tauri\thc-timer.key` (the file, not the path).
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — empty string (the key was generated without a password). Set to your password if you regenerate the key with one.

> ⚠ Keep the private key file safe. If lost, all installed apps will stop receiving updates and you'll need to re-distribute fresh installers signed with a new key.

### Cutting a release

```powershell
# 1. Bump version in package.json AND src-tauri/tauri.conf.json
# 2. Commit
git commit -am "release v0.1.1"

# 3. Tag and push
git tag v0.1.1
git push origin main --tags
```

GitHub Actions (`.github/workflows/release.yml`) takes over:

1. Builds the Windows NSIS installer + MSI.
2. Signs the updater bundle with `TAURI_SIGNING_PRIVATE_KEY`.
3. Creates a GitHub Release `v0.1.1` and uploads the installer + `latest.json`.
4. Existing installs detect the new version on next launch and prompt to update.

To trigger a build without a tag (smoke test): GitHub → Actions → release → Run workflow.

## Files of note

- `src/App.tsx` — timer UI + persistence + update check.
- `src-tauri/tauri.conf.json` — window config + updater pubkey/endpoint.
- `src-tauri/src/lib.rs` — Tauri builder + plugin registration.
- `src-tauri/capabilities/default.json` — runtime permissions.
- `.github/workflows/release.yml` — release pipeline.
