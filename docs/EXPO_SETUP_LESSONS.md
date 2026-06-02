# Expo / React Native Setup — Lessons Learned
## What went wrong and how to avoid it next time

---

## The Golden Rule

> **Never manually manage React Native version numbers. Always let Expo pick them.**

Every issue we hit came from manually setting `react-native` and `react` versions in `package.json` that didn't match what Expo Go expected. Expo has a strict native binary ↔ JS bundle contract, and even a minor version mismatch causes cryptic crashes.

---

## Starting a New Project — The Right Way

Always start from the official template, never from scratch:

```bash
npx create-expo-app@latest YourAppName --template blank
cd YourAppName
```

Then install extra packages using `npx expo install` (NOT `npm install`):

```bash
npx expo install zustand @react-native-async-storage/async-storage \
  @react-navigation/native @react-navigation/native-stack \
  react-native-screens react-native-safe-area-context \
  react-native-gesture-handler expo-linear-gradient \
  expo-haptics @expo/vector-icons
```

`npx expo install` queries Expo's registry and pins the exact versions compatible with your SDK. `npm install` just picks whatever is latest, which breaks things.

---

## Upgrading Expo SDK — The Right Way

When Expo Go updates and your project's SDK is behind:

```bash
# Step 1 — upgrade expo itself
npm install expo@latest

# Step 2 — let Expo fix all other packages to match
npx expo install --fix

# Step 3 — clean reinstall
rd /s /q node_modules
del package-lock.json
npm install --legacy-peer-deps
```

**Never manually edit `react-native` or `react` versions in `package.json`.**  
If `--fix` doesn't update them, use `npx expo install react-native react` instead.

---

## If the Project Is Badly Broken — Nuclear Option

When node_modules is corrupted or versions are hopelessly tangled, start fresh and copy source code over. This always works:

```bash
# 1. Create a clean fresh project
npx create-expo-app@latest ProjectNameFresh --template blank

# 2. Copy your source code
xcopy /E /I /Y OldProject\src ProjectNameFresh\src
copy /Y OldProject\App.js ProjectNameFresh\App.js

# 3. Install extra packages via expo install (not npm)
cd ProjectNameFresh
npx expo install [your extra packages...]

# 4. Start
npx expo start --tunnel
```

---

## Common Errors and Fixes

### `PlatformConstants could not be found` (red screen on phone)
**Cause:** React Native version in node_modules doesn't match Expo Go's native binary.  
**Fix:** Don't manually pin `react-native`. Run `npx expo install --fix` or use the nuclear option above.

### `Project is incompatible with Expo Go — SDK 51, needs 54`
**Cause:** Expo Go auto-updates on your phone but your project stays on the old SDK.  
**Fix:** Follow the SDK upgrade steps above.

### `Unable to resolve module promise/setimmediate/es6-extensions`
**Cause:** node_modules is in a broken/partial state after a failed upgrade.  
**Fix:** Full clean reinstall:
```bash
rd /s /q node_modules
del package-lock.json
npm cache clean --force
npm install --legacy-peer-deps
```

### `PluginError: Failed to resolve plugin for module "expo-status-bar"`
**Cause:** `expo-status-bar` listed in `app.json` plugins — it doesn't need to be there.  
**Fix:** Remove `"expo-status-bar"` from the `plugins` array in `app.json`.

### `Cannot find module './utils/autoAddConfigPlugins.js'`
**Cause:** `@expo/cli` in node_modules is partially installed / corrupted.  
**Fix:** Full clean reinstall (same as above).

### `ERESOLVE unable to resolve dependency tree`
**Cause:** npm strict peer dependency checking fails on version mismatches.  
**Fix:** Add `--legacy-peer-deps` flag: `npm install --legacy-peer-deps`

### `Port 8081 is being used by another process`
**Cause:** A previous Expo server didn't shut down cleanly.  
**Fix:** Kill it then restart:
```bash
# Free port 8081
for /f "tokens=5" %a in ('netstat -aon ^| findstr ":8081 "') do taskkill /F /PID %a
npx expo start --tunnel --clear
```
Or just use a different port: `npx expo start --tunnel --port 8082`

### `127.0.0.1:8081` error on phone / `could not connect to server`
**Cause:** Phone and PC on different networks, or tunnel not active.  
**Fix:** Run `npx expo start --tunnel` (not just `npx expo start`). The tunnel works across any network.

---

## app.json Rules

```json
{
  "expo": {
    "name": "YourApp",
    "slug": "yourapp",
    "newArchEnabled": false,
    "plugins": [
      ["expo-splash-screen", { "backgroundColor": "#yourcolor" }]
    ]
  }
}
```

- `"newArchEnabled": false` — avoids New Architecture TurboModule issues with Expo Go. Note this only affects native builds (EAS), not Expo Go itself.
- Do NOT add `expo-status-bar` to plugins — it doesn't have one.
- Do NOT add `expo-haptics`, `expo-linear-gradient` to plugins — not needed.

---

## Running on iPhone vs Android

| Method | Requirement | Command |
|---|---|---|
| iPhone via Expo Go | Install Expo Go from App Store | `npx expo start --tunnel` → scan QR with Camera app |
| Android via Expo Go | Install Expo Go from Play Store, same WiFi | `npx expo start --tunnel` → scan QR in Expo Go |
| Android Emulator | Android Studio + AVD running | `npx expo start --android` |
| iOS Simulator | Mac + Xcode only | `npx expo start --ios` |
| Browser (rough preview) | Nothing extra | `npx expo start --web` |

Always use `--tunnel` when phone and PC might be on different networks.

---

## Package Version Reference (Expo SDK 54)

These are installed automatically by `npx create-expo-app` + `npx expo install`. Do not manually change them:

| Package | Let Expo decide |
|---|---|
| `react-native` | ✅ Expo managed |
| `react` | ✅ Expo managed |
| `react-native-screens` | ✅ Expo managed |
| `react-native-safe-area-context` | ✅ Expo managed |
| `react-native-gesture-handler` | ✅ Expo managed |
| `expo-linear-gradient` | ✅ Expo managed |
| `expo-haptics` | ✅ Expo managed |
| `zustand` | Any latest — safe to npm install |
| `@react-navigation/*` | Any v6/v7 — safe to npm install |

---

## Bat Files Created for This Project

| File | What it does |
|---|---|
| `start-voyvibe.bat` | Starts Expo dev server in a new window |
| `stop-voyvibe.bat` | Kills the dev server and frees port 8081 |
| `fix-install.bat` | Clean wipe of node_modules + fresh install |
| `create-fresh.bat` | Nuclear option — fresh Expo app + copies source |
