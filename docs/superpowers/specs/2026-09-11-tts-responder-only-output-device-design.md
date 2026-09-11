# TTS: Only Responder Audio Routed to Output Device

Date: 2026-09-11

## Problem

Currently the chat TTS plays **both** the questioner (viewer's chat message) and the
responder (Mina's AI reply) through the same managed `<audio>` element, which has
`setSinkId` applied to the selected output device (e.g. CABLE Input / VB-Audio).

For streaming, the user wants the output device (CABLE) to carry **only the
responder's voice**. The questioner's voice should keep playing normally on the
default speakers — so the streamer still hears viewer messages locally, but the
stream (via CABLE) only gets Mina's reply.

## Behavior After Change

| Speaker | Output destination |
|---------|--------------------|
| Questioner (viewer chat message) | Default speakers (no `setSinkId`) |
| Responder (Mina's AI reply) | Selected output device from header selector (e.g. CABLE) |

- The single header `OutputDeviceSelector` continues to set the **responder's**
  output device (existing `setOutputDevice` flow: local state → apply sink →
  capture to backend → persists across reload).
- Questioner output is hardcoded to default speakers in the hook. No selector,
  no capture, no persistence needed for questioner.
- Chat (manual typing) and YouTube auto-reply both go through the same
  `speakExchange` path, so this behavior applies to both uniformly.

## Approach

Modify `frontend/src/hooks/useHowlerTTS.ts` only:

1. `playSubItem(text, voice, rate, routeDevice = true)` — add a boolean param.
   - `routeDevice === true` (default) → `applyOutputDevice(settings.output_device_id)`
   - `routeDevice === false` → `applyOutputDevice('')` (resets to default speakers)
2. `playItem` (used for responder items) → calls `playSubItem(...)` → keeps default
   `routeDevice = true`.
3. `playQuestionerItem` (used for questioner items) → its two `playSubItem` calls
   (username + message text) pass `routeDevice = false`.

No changes to `OutputDeviceSelector`, ChatPage wiring, or backend endpoints.

## Edge Cases / Notes

- When no output device is selected (`output_device_id === ''`), responder sound
  already goes to default speakers — behavior unchanged.
- `applyOutputDevice('')` is a valid call: `setSinkId('')` resets to the system
  default, and the existing `appliedSinkRef` guard means a no-op when already
  reset.
- The questioner item keeps its `say_username` / delay behavior exactly as today;
  only the routing changes.

## Testing

- Update/extend hook tests (`useHowlerTTS.speakExchange.test.ts` +
  `useHowlerTTS.outputDevice.test.ts`):
  - responder item → `setSinkId` called with `output_device_id`
  - questioner item → `setSinkId` called with `''` (default)
  - mixed queue (questioner then responder) → sink resets to default, then
    re-applies to device
- Full frontend suite must pass (`npx vitest run`), `tsc -b --noEmit` clean.
- Manual: with CABLE selected, send a chat message → Mina's voice heard via CABLE;
  viewer questioner (YouTube chat) heard on default speakers only (not CABLE).