# Output Device on Chat Page — Design

**Date:** 2026-09-11
**Status:** Approved by user
**Feature:** Make chat-page TTS honor the latest backend-stored output device, and move the Output Device picker from the TTS settings page to the chat page header.

## Problem

- The TTS "Test" button on the TTS settings page routes audio to the selected device correctly (it uses `<audio>` + `HTMLMediaElement.setSinkId`).
- Chat-page TTS works (audio plays) but **is not routed to the selected device** — it goes to the system default.
- The chat page routes audio through Howler's shared Web Audio `AudioContext` via `AudioContext.setSinkId`, which does not work reliably on the user's machine; the `<audio>` mechanism does.

## Goals

1. Backend remains the single source of truth for "the latest configured output device" (`OutputDeviceSelection`), and the chat page must always apply that device automatically on load and before every playback.
2. Move the Output Device picker from `TTSSettingsPage` (`/tts-settings`) into the chat page header bar.

## Non-Goals (YAGNI)

- No backend schema/API change; `GET /api/output-devices/current/` and `POST /api/output-devices/capture/` stay as-is.
- No server-side audio playback (playback is browser-side only).
- No Web Audio / Howler debug loop. The `<audio>` mechanism is the one proven to work.

## Architecture

### Backend (unchanged behavior)

- `OutputDeviceSelection` (append-only history in `output_devices`) remains the source of truth for the current device.
- `GET /api/output-devices/current/` returns the latest selection's device.
- `POST /api/output-devices/capture/` upserts a device by `(platform, device_id)` and appends a selection row.
- No migrations. Existing `output_devices` and `messages_tts` tests must keep passing.

### Frontend — playback layer (`frontend/src/hooks/useHowlerTTS.ts`)

Replace the Howler playback layer with a single managed `<audio>` element. All queue/FIFO/skip/stop logic that already exists in the hook stays — only the actual sound playback changes.

- `playSubItem(text, voice, rate)`:
  1. Re-apply sink: `await audio.setSinkId(deviceId)` where `deviceId = settingsRef.current.output_device_id`.
  2. `ttsApi.generate(...)` → blob URL → `audio.src = url`.
  3. `.play()`, resolve on `ended` / `error` / cancelled stop.
- `applyOutputDevice(deviceId)`:
  - Guard: if `typeof HTMLMediaElement.setSinkId !== 'function'` → warn and continue (plays on default).
  - `await audio.setSinkId(deviceId)` before each playback; do not cache-and-skip (the old cache caused stale routing).
- `supportsOutputRouting()` → `typeof HTMLMediaElement.setSinkId === 'function'`.
- Autoplay handling (`unlockAudio` / hydrate click): prime the element with a muted `play()` + `pause()` on the first user gesture (replaces `AudioContext.resume()`).
- New `setOutputDevice(deviceId)`: `POST /api/output-devices/capture/` → update local state → apply sink immediately → `reloadSettings()`.
- `loadSettings()` keeps fetching `/api/tts/settings/` + `/api/output-devices/current/` and prefers `current.device_id` (backend = truth), then applies it.
- The `tts-settings-saved` window event is kept so other flows can force a reload + re-apply.

### Frontend — device picker UI

**New component `frontend/src/components/ui/OutputDeviceSelector.tsx`:**
- Enumerates `navigator.mediaDevices.enumerateDevices()` filtered to `audiooutput`.
- Dropdown `<select>` (default=deviceId `''` labeled "ค่าเริ่มต้น (Default Speaker)") + test button (▶), using the same styling as the removed TTS-settings block (`bg-surface-light`, `border-border`, `text-accent`).
- Permission button "ขอสิทธิ์ดูชื่ออุปกรณ์ (เช่น CABLE Output)" when labels are empty; "เบราว์เซอร์ไม่รองรับ" badge when `setSinkId`/`enumerateDevices` unavailable.
- Test uses a transient `<audio>` + `setSinkId` (copied from `TTSSettingsPage.testOutputDevice`).
- Props: `value: string`, `onDeviceChange: (deviceId: string) => void`.

**ChatPage:**
- Render `OutputDeviceSelector` in the chat header bar (where the current TTS toggle area is).
- `onDeviceChange` → `tts.setOutputDevice(deviceId)`.
- Display the currently used device (from selector value / hook state).

**TTSSettingsPage:**
- Remove the "อุปกรณ์เสียง (Output Device)" section and now-unused handlers/states (`detectAudioOutputs`, `testOutputDevice`, `requestDevicePermission`, `audioDevices`, `devicePermissionGranted`, `testPlaying`-for-output, etc.).
- Remove unused imports/dependencies they pull in; `howler` stays only if still referenced elsewhere (verify; remove from `package.json` if it becomes unused).

## Data Flow (goal 1)

1. Chat page mounts → `useHowlerTTS.loadSettings()` fetches `/current/` → if a device exists, apply sink to the audio element. After this, chat TTS routes to the previously configured device with no manual re-selection.
2. User changes device in the header selector → `capture` to backend immediately → apply sink now → next playback uses it.
3. Before every single playback, re-apply sink from the latest settings → never falls back to default silently.

## Error Handling

- Browser without `setSinkId`/`enumerateDevices` → selector shows the unsupported notice; TTS still plays to the system default.
- `capture` POST fails (network) → apply locally + log via `console.error`, playback still routes this session; backend will catch up on the next successful capture.
- `<audio>` `error` event → resolve the play promise and log, same as today's Howler `loaderror` behavior.

## Testing

- **Vitest:** new `OutputDeviceSelector.test.tsx`:
  - renders select + test button; shows permission button when labels empty.
  - calls `onDeviceChange` with the selected `deviceId`.
  - shows unsupported message when `enumerateDevices` is absent.
  - mock `navigator.mediaDevices.enumerateDevices`.
- **Playwright e2e** (`chat.spec.ts`): assert the device selector exists in the chat header (behind a browser-support guard, since CI browsers may not expose media devices).
- **Backend:** no changes → full `pytest` suite must still pass (191 tests).
- **Manual checklist:**
  1. Select `CABLE Output (VB-Audio Virtual Cable)` on the chat header → Test ▶ → sound reaches the VB-Cable.
  2. Send a chat message → TTS audio is heard through the VB-Cable (observe in OBS or Windows volume-mixer / a recording attached to CABLE Output).
  3. Reload the chat page → device remains the previously selected one (auto-applied from `/current/`), no re-selection needed.
  4. TTS settings page no longer shows the Output Device section.

## Out of Scope

- Changing how the backend stores devices.
- Mixing audio / equalizer settings.
- Device detection in non-Chromium browsers beyond the existing unsupported notice.