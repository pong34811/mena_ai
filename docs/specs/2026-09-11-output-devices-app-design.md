# Design: Django app `output_devices`

## 1. Overview / Goal

สร้าง Django app ใหม่ `output_devices` สำหรับจัดการ **Output Devices (อุปกรณ์เสียง)** อย่างเป็นระบบ
แทนการฝัง device ID ไว้ใน `TTSSettings.output_device_id` (field เดิม) เพื่อให้:

1. มี **แคตตาล็อกอุปกรณ์** (catalog) เก็บ/แก้ไขผ่านหน้า Django admin ได้แบบ CRUD ปกติ
2. Frontend ส่งค่าจาก `enumerateDevices()` ไปเก็บ (auto-capture) + มี label ที่ user ตั้งเอง
3. มี **ประวัติการเลือก** ว่าครั้งล่าสุดใช้อุปกรณ์ตัวไหน เพื่อ restore กลับหลัง reload

## 2. User Stories

> 1. ในฐานะ streamer ฉันต้องการเห็นรายการอุปกรณ์เสียงทั้งหมดใน Django admin เพื่อจัดการ label/เปิด-ปิดอุปกรณ์ที่รู้จัก
> 2. ในฐานะ streamer ฉันต้องการให้เมื่อเลือก Output Device ที่หน้า TTS settings แล้ว ค่านั้นถูกบันทึกและกลับมาเหมือนเดิมเมื่อโหลดหน้าใหม่
> 3. ในฐานะ dev/admin ฉันต้องการดูว่าครั้งสุดท้ายเลือกอุปกรณ์ตัวไหน (ประวัติ)

## 3. Current Architecture (เกี่ยวข้อง)

- `backend/messages_tts/models.py` → `TTSSettings` (singleton) มี field `output_device_id` (CharField, default `''`)
  — เป็นแหล่งเก็บ device ID เดิม ฝังใน settings singleton
- `backend/messages_tts/views.py` → `GET /api/tts/settings/` + `PATCH /api/tts/settings/update/` อ่าน/เขียน `output_device_id`
- `backend/messages_tts/admin.py` → `TTSSettingsAdmin` (เพิ่งเพิ่ม `output_device_id` ใน fieldsets)
- Frontend `frontend/src/hooks/useHowlerTTS.ts` + `frontend/src/pages/TTSSettingsPage.tsx`
  อ่าน/เขียน `output_device_id` ผ่าน API `/api/tts/settings/` เพื่อ route เสียงผ่าน `setSinkId`

ปัญหาที่พบ:
- หน้า admin ของ TTSSettings เป็น singleton redirect (ชี้ไป change form เดียว) — user หา "หน้าใหม่" ไม่เจอ
- ข้อมูลอุปกรณ์ (device_id + label) ไม่ได้ถูกเก็บอย่างเป็นโครงสร้าง

## 4. Desired Architecture

### App ใหม่: `output_devices`

```
backend/output_devices/
├── __init__.py
├── apps.py            # OutputDevicesConfig
├── models.py          # OutputDevice, OutputDeviceSelection
├── serializers.py     # OutputDeviceSerializer
├── views.py           # list / capture / current
├── urls.py            # /api/output-devices/*
├── admin.py           # OutputDeviceAdmin (CRUD), OutputDeviceSelectionAdmin (read-only)
├── migrations/
└── tests.py
```

### 4.1 Models

**`OutputDevice`** — แคตตาล็อกอุปกรณ์
| Field | Type | หมายเหตุ |
|-------|------|----------|
| `name` | CharField(255) | label สำหรับแสดงผล (default = browser label) |
| `device_id` | CharField(255) | deviceId จาก `enumerateDevices()`, unique |
| `platform` | CharField(32) | `windows`/`macos`/`linux`/`other` |
| `is_active` | BooleanField(default=True) | เปิด/ปิดใช้ใน dropdown |
| `created_at` | DateTimeField(auto_now_add) | |
| `updated_at` | DateTimeField(auto_now) | |

`Meta`: unique constraint `(platform, device_id)`

**`OutputDeviceSelection`** — ประวัติการเลือก
| Field | Type | หมายเหตุ |
|-------|------|----------|
| `device` | FK → OutputDevice (on_delete=SET_NULL, null=True) | |
| `device_id_legacy` | CharField(255) | snapshot device ID (กัน offline/ลบ device) |
| `selected_at` | DateTimeField(auto_now_add) | |
| `source` | CharField(32, default='auto_capture') | ที่มา: `auto_capture` |

### 4.2 API

| Method | Path | หน้าที่ |
|--------|------|---------|
| GET | `/api/output-devices/` | list `OutputDevice` ทั้งหมด (active ก่อน) |
| POST | `/api/output-devices/capture/` | upsert อุปกรณ์ด้วย `{device_id, label, platform}` + สร้าง `OutputDeviceSelection` |
| GET | `/api/output-devices/current/` | คืน selection ล่าสุด (`{device_id, name, ...}` หรือ `null`) |

`capture` behavior:
- `get_or_create` โดย `(platform, device_id)`
- ถ้า `label` ต่างจากที่เก็บ → update `name`
- สร้าง `OutputDeviceSelection` ใหม่เสมอ (history)

### 4.3 ความสัมพันธ์กับ TTSSettings / Migration

- สร้าง data migration คัดลอกค่า `TTSSettings.output_device_id` (ถ้าไม่ว่าง) →
  สร้าง `OutputDevice` (name = device_id, platform='other') + `OutputDeviceSelection`
- `TTSSettings.output_device_id`: **คง field ไว้** (deprecated, ยังถูกใช้โดย frontend เป็น primary จนกว่าจะย้ายฝั่ง frontend)
  แต่ source of truth ใหม่คือ `OutputDeviceSelection` ล่าสุด
- Frontend: `useHowlerTTS` / `TTSSettingsPage` เปลี่ยนให้อ่านจาก
  `GET /api/output-devices/current/` (ตอนโหลด) และเรียก `POST /api/output-devices/capture/` (ตอนบันทึก)
  — ยังอ่าน `enumerateDevices()` ใน browser เหมือนเดิม (จำเป็นสำหรับ `setSinkId`)
  แต่ persist ผ่าน app ใหม่แทน field เดิม

### 4.4 Admin

- **`OutputDeviceAdmin`**: list_display = name, device_id, platform, is_active, updated_at
  search_fields = [name, device_id], list_filter = [platform, is_active]
- **`OutputDeviceSelectionAdmin`**: read-only, list_display = device, device_id_legacy, source, selected_at

### 4.5 Error Handling

- capture รับ device_id/label ว่าง → 400
- current: ไม่มี selection → 200 `{device: null}`
- POST capture ไม่ใช่ JSON / missing fields → 400

### 4.6 Testing

- Backend (Django test): capture upsert (สร้างใหม่ + อัปเดต label เดิม), current คืนล่าสุด, list เฉพาะ active ก่อน
  ใช้ `APITestCase` ตาม patch ที่มีอยู่
- Frontend: อัปเดต mock/fixtures ของ `useHowlerTTS` tests ให้ใช้ path ใหม่ (ถ้าจำเป็น)

## 5. Files

| File | Change |
|------|--------|
| `backend/output_devices/` (ใหม่) | app ใหม่ทั้งหมด |
| `backend/config/settings.py` | + `output_devices` ใน INSTALLED_APPS |
| `backend/config/urls.py` | + `path('', include('output_devices.urls'))` |
| `backend/messages_tts/migrations/000X` | data migration ย้ายค่า output_device_id |
| `backend/messages_tts/models.py` | เพิ่ม comment ว่า deprecated (field คงไว้) |
| `frontend/src/pages/TTSSettingsPage.tsx` | เรียก capture API ตอน save; อ่าน current ตอนโหลด |
| `frontend/src/hooks/useHowlerTTS.ts` | อ่าน device จาก current API แทน settings.output_device_id |

## 6. Acceptance Criteria

1. สร้าง app `output_devices` → เห็นหน้า admin `OutputDevice` + `OutputDeviceSelection` CRUD/อ่านได้
2. `POST /api/output-devices/capture/` upsert + เก็บประวัติได้
3. `GET /api/output-devices/current/` คืนอุปกรณ์ที่เลือกครั้งล่าสุด
4. ข้อมูลเก่าใน `TTSSettings.output_device_id` migrate ไป app ใหม่โดยข้อมูลไม่หาย
5. Frontend เลือกอุปกรณ์ → save → reload หน้า → ค่าที่เลือก restore กลับ (ทดสอบในเบราว์เซอร์)