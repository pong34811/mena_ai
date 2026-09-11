# Requirement: TTS Output Device Selection (VB-Audio Virtual Cable)

## 1. Overview / Goal

ผู้ใช้ต้องการ route TTS audio ออกไปยัง **VB-Audio Virtual Cable (CABLE Output)** แทน (หรือคู่กับ) default speaker เพื่อให้ OBS หรือโปรแกรมอื่นสามารถคว้าเสียง TTS ได้เป็นแหล่งแยก ไม่ปะปนกับ system audio

ต้องการให้ผู้ใช้เลือก output device ของ browser ได้ผ่าน TTS Settings page แล้วเสียง TTS ที่เล่นผ่าน Howler.js จะไปยัง device ที่เลือก

## 2. User Story

> ในฐานะ streamer/moderator ฉันต้องการให้ TTS ออกที่ VB-Audio Virtual Cable (CABLE Output) เพื่อให้ OBS คว้าเสียง TTS แยกจากเพลง/เกม โดยไม่ต้องลงโปรแกรมเพิ่ม

## 3. Current Architecture

### Backend
- `messages_tts/models.py` → `TTSSettings` (singleton) เก็บค่า: voice, rate, enabled, say_username, responder_delay_ms
- `messages_tts/views.py` → API endpoints: `GET /api/tts/settings/` และ `PATCH /api/tts/settings/update/`
- `core/tts_service.py` → `TTSService.generate()` ใช้ edge-tts สร้างไฟล์ mp3 cache ไว้ที่ `backend/tts_cache/`
- `core/tts_views.py` → `POST /api/tts/generate/` และ `/api/tts/chat-message/` ส่ง mp3 กลับไป

### Frontend
- `hooks/useHowlerTTS.ts` → เล่นเสียง TTS ผ่าน Howl (Howler.js)
- `pages/TTSSettingsPage.tsx` → UI สำหรับตั้งค่า TTS (voice, rate, enabled, etc.)

### Data Flow
```
[User sends chat] → [Django: generate TTS mp3 via edge-tts] → [Cache on disk]
     ↓                                                                    ↓
[Frontend: fetch /api/tts/generate/] ←───────────────────────────── [Return mp3 blob]
     ↓
[Howler.js: new Howl({ src: [blobUrl] })] → [Plays through browser default output device]
```

## 4. Desired Architecture

### หลักการ

- **Browser-side routing**: Web Audio API (`AudioContext.setSinkId()`) อนุญาตให้เลือก output device ได้ (รองรับ Chrome/Edge, ยังไม่รองรับ Firefox/Safari)
- **Backend ไม่ต้องแก้ logic TTS generation** — edge-tts ยังสร้าง mp3 เหมือนเดิม
- **Backend เพิ่ม field** เก็บ device ID ที่เลือก สำหรับ persist ค่าเมื่อ save settings
- **Frontend** ดึงรายการ audio output devices ผ่าน `navigator.mediaDevices.enumerateDevices()` แล้วแสดงใน dropdown
- **useHowlerTTS hook** เรียก `Howler.ctx.setSinkId(deviceId)` เพื่อ route เสียงไป device ที่เลือก

### Data Flow ใหม่
```
[TTS Settings: User selects output device]
     ↓
[Save to backend: PATCH /api/tts/settings/update/ { output_device_id: "..." }]
     ↓
[useHowlerTTS loads settings → calls Howler.ctx.setSinkId(deviceId) on startup]
     ↓
[When TTS plays → audio goes to selected device (e.g., CABLE Output)]
```

## 5. Requirements Detail

### 5.1 Backend Changes

#### 5.1.1 Model — `messages_tts/models.py`
เพิ่ม field:
```python
output_device_id = models.CharField(
    max_length=255,
    default='',
    blank=True,
    help_text="Web Audio device ID สำหรับเล่น TTS (เช่น 'default', 'communications', หรือ device ID จาก enumerateDevices). ว่างไว้ = browser default speaker.",
)
```

#### 5.1.2 Views — `messages_tts/views.py`
- `tts_settings_get`: เพิ่ม `'output_device_id'` ใน response
- `tts_settings_update`: เพิ่ม `'output_device_id'` ใน fields list

#### 5.1.3 Migration
- สร้าง migration ใหมีจาก model change: `python manage.py makemigrations messages_tts`

### 5.2 Frontend Changes

#### 5.2.1 TTSSettings Interface — `pages/TTSSettingsPage.tsx`
เพิ่ม field ใน local `TTSSettings` interface:
```typescript
output_device_id: string
```

#### 5.2.2 Output Device Dropdown UI
เพิ่ม section ในหน้า TTS Settings (ระหว่าง Questioner และ Responder):

- แสดง label: **"อุปกรณ์เสียง (Output Device)"**
- ดึงรายการ devices ผ่าน:
  ```typescript
  const devices = await navigator.mediaDevices.umerateDevices()
  const audioOutputs = devices.filter(d => d.kind === 'audiooutput')
  ```
- แสดง `<select>` รายการ:
  - `<option value="">ค่าเริ่มต้น (Default Speaker)</option>` (ค่าว่าง)
  - แต่ละ device แสดง `device.label` (ถ้ามี) หรือ `audiooutput ${index + 1}` (ถ้า label ว่าง — ต้องขอ permission ก่อนถึงจะมี label)
- เมื่อเลือก device → update `settings.output_device_id`
- เพิ่มปุ่ม **"ทดสอบ"** ข้าง dropdown เล่นเสียง "สวัสดีค่ะ นี่คือเสียงทดสอบ" ผ่าน device ที่เลือก

#### 5.2.3 Howler Output Routing — `hooks/useHowlerTTS.ts`
เพิ่ม logic ใน hook:

```typescript
// Track current sink so we can re-apply if context is recreated
const appliedSinkRef = useRef<string>('')

const applyOutputDevice = useCallback(async (deviceId: string) => {
  const ctx = Howler.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> } | null
  if (!ctx) return

  // Not supported (Firefox/Safari) — silently skip
  if (typeof ctx.setSinkId !== 'function') {
    console.warn('[TTS] setSinkId not supported — output device routing unavailable')
    return
  }

  // Already applied — no-op
  if (appliedSinkRef.current === deviceId) return

  try {
    await ctx.setSinkId(deviceId)
    appliedSinkRef.current = deviceId
    console.info(`[TTS] Output device set to: ${deviceId || 'default'}`)
  } catch (err) {
    console.error('[TTS] Failed to set output device:', err)
  }
}, [])
```

เรียก `applyOutputDevice` ใน:
- หลัง `loadSettings()` เสร็จ (เมื่อ settings มี `output_device_id`)
- เมื่อมี event `tts-settings-saved` (เมื่อ user save settings ใหม่)
- หลัง `unlockAudio()` (กรณี context ถูกสร้างใหม่)

#### 5.2.4 Browser Support Warning
เมื่อ `typeof Howler.ctx?.setSinkId !== 'function'`:
- แสดง warning text ใต้ dropdown: "⚠️ เบราว์เซอร์ไม่รองรับการเลือก output device — ใช้ Chrome หรือ Edge"

#### 5.2.5 AudioContext Permission for Device Labels
- ถ้า device labels ว่าง (เบราว์เซอร์ปกป้องถ้าไม่ไดขอ permission) → แสดง label สำรอง: `Speaker N`
- เมื่อ user กด "ขอสิทธิ์ดูชื่ออุปกรณ์" → เรียก `navigator.mediaDevices.getUserMedia({ audio: true })` แล้ว enumerate ใหม่ (จะได้ label จริง เช่น "CABLE Output (VB-Audio Virtual Cable)")

### 5.3 Edge Cases

| Case | Behavior |
|------|----------|
| `output_device_id` ว่าง | ใช้ browser default (ไม่เรียก setSinkId) |
| Device ID ไม่มีอยู่แล้ว (unplugged) | setSinkId จะ throw → ใช้ default แล้ว log warning |
| Firefox/Safari ไม่รองรับ setSinkId | แสดง warning, dropdown disabled, ใช้ default |
| User chưa grant audio permission | แสดง placeholder labels และปุ่มขอ permission |
| AudioContext ยังไม่พร้อมตอนโหลด settings | เก็บค่าไว้ แล้ว apply เมื่อ context พร้อม (หลัง user gesture / unlockAudio) |

### 5.4 Testing Plan

- [ ] เปิด TTS Settings → เห็น dropdown "อุปกรณ์เสียง" มี "CABLE Output (VB-Audio Virtual Cable)" ในรายการ
- [ ] เลือก CABLE Output → กดทดสอบ → เสียงออกที่ virtual cable (OBS คว้าได้)
- [ ] Save settings → refresh → ค่าที่เลือกยังอยู่
- [ ] เปิดด้วย Firefox → เห็น warning ว่าไม่รองรับ
- [ ] กด "skip" ระหว่างเล่น → เสียงหยุดถูกต้อง

### 5.5 Scope / Non-Goals

**In scope:**
- เลือก output device สำหรับ TTS playback
- Persist ค่าใน DB ผ่าน settings API
- Browser-side routing (no server-side audio processing)

**Out of scope:**
- Per-character output device (ใช้ค่าเดียวกับทั้ง questioner + responder)
- Server-side virtual audio routing (ไม่ต้องสร้าง audio device ใน Django)
- VoiceMeeter / multiple cable support — แค่เลือก device เดียวที่ OS/browser มองเห็น

## 6. Files to Modify

| File | Change |
|------|--------|
| `backend/messages_tts/models.py` | เพิ่ม `output_device_id` field |
| `backend/messages_tts/views.py` | เพิ่ม field ใน GET + PATCH |
| `backend/messages_tts/migrations/000X_...py` | New migration |
| `frontend/src/pages/TTSSettingsPage.tsx` | เพิ่ม UI dropdown + test button |
| `frontend/src/hooks/useHowlerTTS.ts` | เพิ่ม `applyOutputDevice` logic |

## 7. Acceptance Criteria

1. ✅ ผู้ใช้เห็น output device dropdown ใน TTS Settings
2. ✅ เมื่อเลือก "CABLE Output (VB-Audio Virtual Cable)" แล้วกดทดสอบ → OBS/อุปกรณ์ที่รับจาก cable ได้ยินเสียง "สวัสดีค่ะ นี่คือเสียงทดสอบ"
3. ✅ Save แล้ว refresh → ค่าที่เลือก persist อยู่
4. ✅ TTS ที่เล่นจาก chat/YouTube auto-reply หลังจากนั้น → เสียงออกที่ cable ไม่ใช่ speaker
5. ✅ Graceful fallback เมื่อ browser ไม่รองรับ
