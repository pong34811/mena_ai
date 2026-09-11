# Output Devices App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Django app `output_devices` (catalog + selection history + capture/current APIs + admin CRUD) that replaces the ad-hoc `TTSSettings.output_device_id` handling, and wire the frontend so a chosen output device survives page reloads.

**Architecture:** New Django app with two models — `OutputDevice` (catalog keyed by `(platform, device_id)`) and `OutputDeviceSelection` (append-only history; latest row = current device). Two read/write endpoints (`capture`, `current`) plus a list endpoint. A data migration copies the existing `TTSSettings.output_device_id` into the new app. Frontend saves via `capture` and restores via `current`, still using browser `enumerateDevices()` for `setSinkId`.

**Tech Stack:** Django 6.1 + DRF, pytest + `pytest.mark.django_db`, React 19 + TypeScript, vitest + @testing-library/react, axios.

## Global Constraints

- Python/backend runs in the `mena_ai-backend-1` Docker container; run Django commands as `docker compose exec backend python manage.py ...` and tests as `docker compose exec backend python -m pytest ...` from `C:\Users\warit\Desktop\mena_ai`.
- Frontend runs in the `frontend-1` container: `docker compose exec frontend npm run build`, `docker compose exec frontend npm test`, `docker compose exec frontend npm run lint`.
- Follow existing DRF convention: `@api_view` for custom endpoints (like `messages_tts/views.py`), `ModelSerializer` for serializers, `apps.get_model` inside data migrations.
- Tests follow the existing pytest style used in `backend/messages_tts/tests.py`: `@pytest.mark.django_db` classes calling views directly with `django.test.RequestFactory` (the `@api_view` wrapper accepts a plain `HttpRequest`).
- Platform values are exactly one of: `windows`, `macos`, `linux`, `other`; unknown → `other`. `capture` with blank `device_id` or `label` returns 400.
- Model field comments mix Thai + English (project convention); code identifiers remain English.
- API base path: registered under `config/urls.py` inside the existing `path('api/', include([...]))` block.
- `TTSSettings.output_device_id` stays in place (deprecated) — never remove the field.

---

### Task 1: Scaffold app `output_devices` + models + registration + migration

**Files:**
- Create: `backend/output_devices/__init__.py`
- Create: `backend/output_devices/apps.py`
- Create: `backend/output_devices/models.py`
- Create: `backend/output_devices/migrations/__init__.py`
- Modify: `backend/config/settings.py` (INSTALLED_APPS)
- Test: `backend/output_devices/tests.py` (model tests)

**Interfaces:**
- Consumes: Django auto-config; `INSTALLED_APPS` convention from `config/settings.py:19-36`.
- Produces: `OutputDevice` model (fields `name`, `device_id`, `platform`, `is_active`, `created_at`, `updated_at`; Meta ordering `['-is_active', 'name']`; unique constraint `(platform, device_id)`), `OutputDeviceSelection` model (fields `device` FK→OutputDevice SET_NULL null=True, `device_id_legacy`, `selected_at`, `source`; Meta ordering `['-selected_at']`). Migration `output_devices/migrations/0001_initial.py`.

- [ ] **Step 1: Register the app in INSTALLED_APPS**

Edit `backend/config/settings.py`. Add `'output_devices',` after `'messages_tts',` in the `# Local apps` list (line 35):

```python
    # Local apps
    'core',
    'providers',
    'chat_messages',
    'messages_tts',
    'output_devices',
```

- [ ] **Step 2: Create app package files**

Create `backend/output_devices/__init__.py`:

```python
```

Create `backend/output_devices/migrations/__init__.py`:

```python
```

Create `backend/output_devices/apps.py`:

```python
from django.apps import AppConfig


class OutputDevicesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'output_devices'
    verbose_name = 'Output Devices'
```

- [ ] **Step 3: Create the models**

Create `backend/output_devices/models.py`:

```python
"""
Models for output_devices: a catalog of known output (audio) devices plus an
append-only history of which device was last selected.
"""

from django.db import models


class OutputDevice(models.Model):
    """Catalog of known output (audio) devices captured from the browser."""

    PLATFORM_CHOICES = (
        ('windows', 'Windows'),
        ('macos', 'macOS'),
        ('linux', 'Linux'),
        ('other', 'Other'),
    )

    name = models.CharField(
        max_length=255,
        help_text="label สำหรับแสดงผล (default = browser label)",
    )
    device_id = models.CharField(
        max_length=255,
        help_text="deviceId จาก enumerateDevices()",
    )
    platform = models.CharField(
        max_length=32,
        choices=PLATFORM_CHOICES,
        default='other',
    )
    is_active = models.BooleanField(
        default=True,
        help_text="เปิด/ปิดการใช้งานใน dropdown",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_active', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['platform', 'device_id'],
                name='uniq_output_device_platform_device',
            ),
        ]
        verbose_name = 'Output Device'
        verbose_name_plural = 'Output Devices'

    def __str__(self):
        return self.name or self.device_id


class OutputDeviceSelection(models.Model):
    """Append-only history of selections; the latest row is the current device."""

    device = models.ForeignKey(
        OutputDevice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='selections',
    )
    device_id_legacy = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="snapshot ของ device ID (กันกรณี device ถูกลบ)",
    )
    selected_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(
        max_length=32,
        default='auto_capture',
        help_text="ที่มาของการเลือก เช่น auto_capture",
    )

    class Meta:
        ordering = ['-selected_at']
        verbose_name = 'Output Device Selection'
        verbose_name_plural = 'Output Device Selections'

    def __str__(self):
        label = self.device.name if self.device else self.device_id_legacy or '?'
        return f"{label} @ {self.selected_at}"
```

- [ ] **Step 4: Generate and apply the migration**

Run:
```
docker compose exec backend python manage.py makemigrations output_devices
```
Expected: creates `output_devices/migrations/0001_initial.py` (Create model OutputDevice, Create model OutputDeviceSelection).

Run:
```
docker compose exec backend python manage.py migrate
```
Expected: applies `output_devices.0001_initial` and (later tasks' migrations will also appear).

Run:
```
docker compose exec backend python manage.py check
```
Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 5: Write model tests**

Create `backend/output_devices/tests.py`:

```python
"""Tests for output_devices models."""

import pytest

from output_devices.models import OutputDevice, OutputDeviceSelection


@pytest.mark.django_db
class TestOutputDeviceModel:
    def test_create_device(self):
        device = OutputDevice.objects.create(
            name='CABLE Output (VB-Audio)',
            device_id='device-abc-123',
            platform='windows',
        )
        assert device.is_active is True
        assert str(device) == 'CABLE Output (VB-Audio)'

    def test_unique_platform_and_device_id(self):
        OutputDevice.objects.create(
            name='A', device_id='device-x', platform='windows'
        )
        with pytest.raises(Exception):
            OutputDevice.objects.create(
                name='B', device_id='device-x', platform='windows'
            )

    def test_same_device_id_ok_on_different_platform(self):
        OutputDevice.objects.create(
            name='A', device_id='device-x', platform='windows'
        )
        OutputDevice.objects.create(
            name='B', device_id='device-x', platform='linux'
        )
        assert OutputDevice.objects.count() == 2

    def test_default_ordering_active_first(self):
        inactive = OutputDevice.objects.create(
            name='Zulu', device_id='z', platform='other', is_active=False
        )
        active = OutputDevice.objects.create(
            name='Alpha', device_id='a', platform='other', is_active=True
        )
        assert list(OutputDevice.objects.all()) == [active, inactive]


@pytest.mark.django_db
class TestOutputDeviceSelectionModel:
    def test_latest_selection_first(self):
        first = OutputDevice.objects.create(
            name='First', device_id='d1', platform='windows'
        )
        second = OutputDevice.objects.create(
            name='Second', device_id='d2', platform='windows'
        )
        OutputDeviceSelection.objects.create(device=first, source='auto_capture')
        OutputDeviceSelection.objects.create(device=second, source='auto_capture')
        assert OutputDeviceSelection.objects.first().device == second

    def test_selection_keeps_legacy_id_string(self):
        device = OutputDevice.objects.create(
            name='A', device_id='keep-me', platform='windows'
        )
        sel = OutputDeviceSelection.objects.create(
            device=device, device_id_legacy='keep-me'
        )
        assert str(sel) == 'A @ ' + str(sel.selected_at)
```

- [ ] **Step 6: Run the model tests**

Run:
```
docker compose exec backend python -m pytest output_devices/tests.py -v
```
Expected: `6 passed` — 4 `OutputDeviceModel` + 2 `OutputDeviceSelectionModel`.

- [ ] **Step 7: Commit**

```bash
git add backend/output_devices backend/config/settings.py
git commit -m "feat(output_devices): add OutputDevice and OutputDeviceSelection models"
```

---

### Task 2: Update `TTSSettings` deprecation comment

**Files:**
- Modify: `backend/messages_tts/models.py:56-62`

**Interfaces:**
- Consumes: nothing new.
- Produces: documentation only — the field stays exactly as-is functionally.

- [ ] **Step 1: Mark the field deprecated**

Edit `backend/messages_tts/models.py` so the `output_device_id` block reads:

```python
    # Output routing — where TTS audio plays (browser-side via Web Audio API)
    # DEPRECATED: device selection now lives in the output_devices app
    # (OutputDeviceSelection is the source of truth). Field kept so the running
    # frontend can PATCH it until it fully migrates to the new endpoints.
    output_device_id = models.CharField(
        max_length=255,
        default='',
        blank=True,
        help_text="Web Audio device ID สำหรับเล่น TTS (เช่น 'default', 'communications', หรือ device ID จาก enumerateDevices). ว่างไว้ = browser default speaker.",
    )
```

- [ ] **Step 2: Verify nothing broke**

Run:
```
docker compose exec backend python manage.py check
```
Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 3: Commit**

```bash
git add backend/messages_tts/models.py
git commit -m "docs(messages_tts): mark output_device_id deprecated"
```

---

### Task 3: Serializers + views + urls (list / capture / current)

**Files:**
- Create: `backend/output_devices/serializers.py`
- Create: `backend/output_devices/views.py`
- Create: `backend/output_devices/urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/output_devices/tests.py` (append view tests)

**Interfaces:**
- Consumes: `OutputDevice`, `OutputDeviceSelection` from Task 1.
- Produces:
  - `GET /api/output-devices/` → `[{id, name, device_id, platform, is_active, created_at, updated_at}, ...]`
  - `POST /api/output-devices/capture/` body `{device_id, label, platform}` → 201 `{id, name, device_id, platform, is_active, created_at, updated_at}`; 400 `{'error': 'device_id และ label ต้องไม่ว่าง'}` on blank.
  - `GET /api/output-devices/current/` → `{'device': <OutputDeviceSerializer data>}` or `{'device': None}` (also None when the FK row was deleted).
  - Helper `_normalize_platform(raw)` — maps unknown/blank to `'other'`.

- [ ] **Step 1: Write the failing view tests**

Edit `backend/output_devices/tests.py`:
1. Change the module docstring line from `"""Tests for output_devices models."""` to `"""Tests for output_devices models and views."""`
2. Add the imports after the existing imports (`pytest`, `OutputDevice`, `OutputDeviceSelection` are already imported — add only the missing ones):

```python
from django.test import RequestFactory
from rest_framework import status

from output_devices.views import (
    output_devices_list,
    output_device_capture,
    output_device_current,
)
```

3. Append these test classes at the end of the file:

```python

@pytest.mark.django_db
class TestOutputDevicesListView:
    def test_returns_all_devices(self):
        OutputDevice.objects.create(name='A', device_id='a', platform='windows')
        OutputDevice.objects.create(name='B', device_id='b', platform='linux')
        request = RequestFactory().get('/api/output-devices/')
        response = output_devices_list(request)
        assert response.status_code == status.HTTP_200_OK
        assert [item['device_id'] for item in response.data] == ['a', 'b']


@pytest.mark.django_db
class TestOutputDeviceCaptureView:
    def test_capture_creates_device_and_selection(self):
        request = RequestFactory().post(
            '/api/output-devices/capture/',
            {'device_id': 'cable-1', 'label': 'CABLE Output', 'platform': 'windows'},
            content_type='application/json',
        )
        response = output_device_capture(request)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['device_id'] == 'cable-1'
        assert response.data['name'] == 'CABLE Output'
        assert OutputDevice.objects.count() == 1
        assert OutputDeviceSelection.objects.count() == 1

    def test_capture_upsert_updates_label(self):
        OutputDevice.objects.create(
            name='Old Label', device_id='cable-1', platform='windows'
        )
        request = RequestFactory().post(
            '/api/output-devices/capture/',
            {'device_id': 'cable-1', 'label': 'New Label', 'platform': 'windows'},
            content_type='application/json',
        )
        response = output_device_capture(request)
        assert response.status_code == status.HTTP_201_CREATED
        assert OutputDevice.objects.count() == 1
        assert OutputDevice.objects.get().name == 'New Label'
        assert OutputDeviceSelection.objects.count() == 2

    def test_capture_records_selection_on_each_call(self):
        payload = {'device_id': 'cable-1', 'label': 'CABLE', 'platform': 'windows'}
        for _ in range(3):
            request = RequestFactory().post(
                '/api/output-devices/capture/',
                payload,
                content_type='application/json',
            )
            response = output_device_capture(request)
            assert response.status_code == status.HTTP_201_CREATED
        assert OutputDevice.objects.count() == 1
        assert OutputDeviceSelection.objects.count() == 3

    def test_capture_blank_device_id_is_400(self):
        request = RequestFactory().post(
            '/api/output-devices/capture/',
            {'device_id': '  ', 'label': 'CABLE', 'platform': 'windows'},
            content_type='application/json',
        )
        response = output_device_capture(request)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert OutputDevice.objects.count() == 0

    def test_capture_blank_label_is_400(self):
        request = RequestFactory().post(
            '/api/output-devices/capture/',
            {'device_id': 'x', 'label': '', 'platform': 'windows'},
            content_type='application/json',
        )
        response = output_device_capture(request)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_capture_normalizes_unknown_platform_to_other(self):
        request = RequestFactory().post(
            '/api/output-devices/capture/',
            {'device_id': 'x', 'label': 'X', 'platform': 'beos'},
            content_type='application/json',
        )
        response = output_device_capture(request)
        assert response.status_code == status.HTTP_201_CREATED
        assert OutputDevice.objects.get().platform == 'other'


@pytest.mark.django_db
class TestOutputDeviceCurrentView:
    def test_returns_latest_selection_device(self):
        first = OutputDevice.objects.create(
            name='First', device_id='d1', platform='windows'
        )
        second = OutputDevice.objects.create(
            name='Second', device_id='d2', platform='windows'
        )
        OutputDeviceSelection.objects.create(device=first, source='auto_capture')
        OutputDeviceSelection.objects.create(device=second, source='auto_capture')
        request = RequestFactory().get('/api/output-devices/current/')
        response = output_device_current(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['device']['device_id'] == 'd2'

    def test_returns_none_without_selection(self):
        request = RequestFactory().get('/api/output-devices/current/')
        response = output_device_current(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['device'] is None

    def test_returns_none_when_device_deleted(self):
        device = OutputDevice.objects.create(
            name='A', device_id='d1', platform='windows'
        )
        OutputDeviceSelection.objects.create(
            device=device, device_id_legacy='d1', source='auto_capture'
        )
        device.delete()
        request = RequestFactory().get('/api/output-devices/current/')
        response = output_device_current(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['device'] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```
docker compose exec backend python -m pytest output_devices/tests.py -v
```
Expected: `ImportError: cannot import name 'output_devices_list'` (views don't exist yet) — the collection fails because `tests.py` imports from `output_devices.views`. That failing state is the red light; proceed to implement.

- [ ] **Step 3: Write serializers**

Create `backend/output_devices/serializers.py`:

```python
"""
Serializers for output_devices models.
"""

from rest_framework import serializers

from .models import OutputDevice, OutputDeviceSelection


class OutputDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutputDevice
        fields = [
            'id', 'name', 'device_id', 'platform',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class OutputDeviceSelectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutputDeviceSelection
        fields = ['id', 'device', 'device_id_legacy', 'selected_at', 'source']
        read_only_fields = fields
```

- [ ] **Step 4: Write views**

Create `backend/output_devices/views.py`:

```python
"""
API views for output_devices.
"""

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from .models import OutputDevice, OutputDeviceSelection
from .serializers import OutputDeviceSerializer

_ACCEPTED_PLATFORMS = ('windows', 'macos', 'linux', 'other')


def _normalize_platform(raw):
    value = str(raw or '').strip().lower()
    return value if value in _ACCEPTED_PLATFORMS else 'other'


@api_view(['GET'])
def output_devices_list(request: Request) -> Response:
    """List all catalogued output devices (active first)."""
    devices = OutputDevice.objects.all()
    return Response(OutputDeviceSerializer(devices, many=True).data)


@api_view(['POST'])
def output_device_capture(request: Request) -> Response:
    """Upsert a device from an enumerateDevices() snapshot + record selection."""
    device_id = str(request.data.get('device_id', '')).strip()
    label = str(request.data.get('label', '')).strip()
    platform = _normalize_platform(request.data.get('platform'))

    if not device_id or not label:
        return Response(
            {'error': 'device_id และ label ต้องไม่ว่าง'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    device, created = OutputDevice.objects.get_or_create(
        platform=platform,
        device_id=device_id,
        defaults={'name': label},
    )
    if not created and device.name != label:
        device.name = label
        device.save(update_fields=['name', 'updated_at'])

    OutputDeviceSelection.objects.create(
        device=device,
        device_id_legacy=device_id,
        source='auto_capture',
    )

    return Response(OutputDeviceSerializer(device).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def output_device_current(request: Request) -> Response:
    """Return the most recent selection's device (or None)."""
    selection = OutputDeviceSelection.objects.first()
    if selection is None or selection.device is None:
        return Response({'device': None})
    return Response({'device': OutputDeviceSerializer(selection.device).data})
```

- [ ] **Step 5: Write urls**

Create `backend/output_devices/urls.py`:

```python
"""
URL configuration for output_devices app.
"""

from django.urls import path

from . import views

urlpatterns = [
    path('output-devices/', views.output_devices_list, name='output-devices-list'),
    path('output-devices/capture/', views.output_device_capture, name='output-device-capture'),
    path('output-devices/current/', views.output_device_current, name='output-device-current'),
]
```

Note: `output-devices/capture/` and `output-devices/current/` differ from `output-devices/` by full path, so ordering inside `urlpatterns` is safe.

- [ ] **Step 6: Register the urls in the project**

Edit `backend/config/urls.py` so the `api/` include block becomes:

```python
    path('api/', include([
        path('', include('core.urls')),
        path('', include('providers.urls')),
        path('', include('chat_messages.urls')),
        path('', include('messages_tts.urls')),
        path('', include('output_devices.urls')),
    ])),
```

- [ ] **Step 7: Run the view tests**

Run:
```
docker compose exec backend python -m pytest output_devices/tests.py -v
```
Expected: all pass — 4 (list) + ... reviewers note actual counts: TestOutputDevicesListView(1) + TestOutputDeviceCaptureView(6) + TestOutputDeviceCurrentView(3) + Task 1's 6 = 16 total.

Run the full backend suite to confirm nothing regressed:
```
docker compose exec backend python -m pytest -q
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add backend/output_devices backend/config/urls.py
git commit -m "feat(output_devices): add list/capture/current API endpoints"
```

---

### Task 4: Admin registration

**Files:**
- Create: `backend/output_devices/admin.py`
- Test: shell one-liner to list registered admin models.

**Interfaces:**
- Consumes: `OutputDevice`, `OutputDeviceSelection` from Task 1.
- Produces: `OutputDeviceAdmin` (CRUD) and read-only `OutputDeviceSelectionAdmin` registered under app label `output_devices`.

- [ ] **Step 1: Write the admin**

Create `backend/output_devices/admin.py`:

```python
"""
Admin registration for output_devices models.
"""

from django.contrib import admin

from .models import OutputDevice, OutputDeviceSelection


@admin.register(OutputDevice)
class OutputDeviceAdmin(admin.ModelAdmin):
    list_display = ['name', 'device_id', 'platform', 'is_active', 'updated_at']
    search_fields = ['name', 'device_id']
    list_filter = ['platform', 'is_active']


@admin.register(OutputDeviceSelection)
class OutputDeviceSelectionAdmin(admin.ModelAdmin):
    list_display = ['device', 'device_id_legacy', 'source', 'selected_at']
    readonly_fields = ['device', 'device_id_legacy', 'source', 'selected_at']

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
```

- [ ] **Step 2: Verify the admin registers**

Run:
```
docker compose exec backend python manage.py check
```
Expected: `System check identified no issues (0 silenced).`

Run:
```
docker compose exec backend python manage.py shell -c "from django.contrib import admin; from output_devices.models import OutputDevice, OutputDeviceSelection; print('OutputDevice' in [m.__name__ for m in admin.site._registry]); print('OutputDeviceSelection' in [m.__name__ for m in admin.site._registry])"
```
Expected:
```
True
True
```

- [ ] **Step 3: Commit**

```bash
git add backend/output_devices/admin.py
git commit -m "feat(output_devices): register OutputDevice + OutputDeviceSelection in admin"
```

---

### Task 5: Data migration copying legacy `TTSSettings.output_device_id`

**Files:**
- Create: `backend/messages_tts/migrations/0005_copy_output_device.py`

**Interfaces:**
- Consumes: `messages_tts.0004_ttssettings_output_device_id` and `output_devices.0001_initial` (both in dependency list).
- Produces: on forward migrate, if `TTSSettings.output_device_id` is non-blank, one `OutputDevice` (`platform='other'`, `name=device_id`) + one `OutputDeviceSelection` (`source='migration'`). Where no legacy value exists, no rows are created. Reverse is a no-op.

- [ ] **Step 1: Write the data migration**

Create `backend/messages_tts/migrations/0005_copy_output_device.py`:

```python
"""Copy TTSSettings.output_device_id (if set) into the output_devices app."""

from django.db import migrations


def copy_output_device(apps, schema_editor):
    TTSSettings = apps.get_model('messages_tts', 'TTSSettings')
    OutputDevice = apps.get_model('output_devices', 'OutputDevice')
    OutputDeviceSelection = apps.get_model('output_devices', 'OutputDeviceSelection')

    settings = TTSSettings.objects.first()
    if settings is None:
        return
    device_id = (settings.output_device_id or '').strip()
    if not device_id:
        return

    device, _ = OutputDevice.objects.get_or_create(
        platform='other',
        device_id=device_id,
        defaults={'name': device_id},
    )
    OutputDeviceSelection.objects.create(
        device=device,
        device_id_legacy=device_id,
        source='migration',
    )


class Migration(migrations.Migration):
    dependencies = [
        ('messages_tts', '0004_ttssettings_output_device_id'),
        ('output_devices', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(copy_output_device, migrations.RunPython.noop),
    ]
```

- [ ] **Step 2: Apply the migration**

Run:
```
docker compose exec backend python manage.py migrate
```
Expected: `Applying messages_tts.0005_copy_output_device... OK`

- [ ] **Step 3: Verify forward migration copies a legacy value**

The migration's reverse is `noop` (rows created on forward are NOT rolled back), so clean any prior run's rows before re-applying.

Run (clean + set a legacy value):
```
docker compose exec backend python manage.py shell -c "from output_devices.models import OutputDevice, OutputDeviceSelection; OutputDeviceSelection.objects.all().delete(); print('selections cleared')"
```
```
docker compose exec backend python manage.py shell -c "from output_devices.models import OutputDevice; OutputDevice.objects.all().delete(); print('devices cleared')"
```
```
docker compose exec backend python manage.py shell -c "from messages_tts.models import TTSSettings; s=TTSSettings.get_instance(); s.output_device_id='sample-legacy-device'; s.save(); print(s.output_device_id)"
```

Roll the data migration back, then re-apply so it actually runs again:
```
docker compose exec backend python manage.py migrate messages_tts 0004
```
```
docker compose exec backend python manage.py migrate messages_tts 0005
```

Verify the copy:
```
docker compose exec backend python manage.py shell -c "from output_devices.models import OutputDevice, OutputDeviceSelection; print(list(OutputDevice.objects.values_list('device_id','platform','name'))); print('selections=', OutputDeviceSelection.objects.count())"
```
Expected:
```
[('sample-legacy-device', 'other', 'sample-legacy-device')]
selections= 1
```

- [ ] **Step 4: Reset the legacy field to blank**

Run:
```
docker compose exec backend python manage.py shell -c "from messages_tts.models import TTSSettings; s=TTSSettings.get_instance(); s.output_device_id=''; s.save()"
```

- [ ] **Step 5: Commit**

```bash
git add backend/messages_tts/migrations/0005_copy_output_device.py
git commit -m "feat(messages_tts): migrate legacy output_device_id into output_devices app"
```

---

### Task 6: Frontend — save via capture, restore via current (TTSSettingsPage)

**Files:**
- Modify: `frontend/src/pages/TTSSettingsPage.tsx`

**Interfaces:**
- Consumes: `GET /api/output-devices/current/` (`{device: {device_id, ...} | null}`) and `POST /api/output-devices/capture/` (`{device_id, label, platform}`). Browser `navigator.mediaDevices.enumerateDevices()` (already used in the page).
- Produces: on save, the selected device is posted to capture; on load, the form's `output_device_id` is seeded from `current` when present.
- New-ish helper in the file: `detectPlatform()` returns `'windows' | 'macos' | 'linux' | 'other'` from `navigator.userAgent`.

- [ ] **Step 1: Add platform detection helper**

Edit `frontend/src/pages/TTSSettingsPage.tsx`. After the `RATE_PRESETS` const (line 32) add:

```tsx
function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac') || ua.includes('ios')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'other'
}
```

- [ ] **Step 2: Seed the device from `current` on load**

In `loadSettings` (lines 131-156), replace the `settingsRes.ok` block body so that after `const data = await settingsRes.json()` it also consults `current`:

```tsx
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        // Prefer the device recorded in the output_devices app (last selection)
        try {
          const currentRes = await fetch('/api/output-devices/current/')
          if (currentRes.ok) {
            const { device } = await currentRes.json()
            if (device?.device_id) {
              data.output_device_id = device.device_id
            }
          }
        } catch (err) {
          console.error('Failed to load current output device:', err)
        }
        setSettings(data)
      }
```

- [ ] **Step 3: POST to capture on save**

In `handleSave` (lines 158-177), after the PATCH fetch and before the `tts-settings-saved` dispatch, insert the capture call:

```tsx
    // Persist the selected device in the output_devices app (catalog + history)
    const deviceId = settings.output_device_id
    if (deviceId) {
      const known = audioDevices.find((d) => d.deviceId === deviceId)
      await fetch('/api/output-devices/capture/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          label: known?.label || deviceId,
          platform: detectPlatform(),
        }),
      })
    }
```

- [ ] **Step 4: Build + lint**

Run:
```
docker compose exec frontend npm run build
```
Expected: `tsc -b` + vite build succeed.

Run:
```
docker compose exec frontend npm run lint
```
Expected: oxlint clean (no introduced errors).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/TTSSettingsPage.tsx
git commit -m "feat(tts-settings): persist selected output device via capture/current APIs"
```

---

### Task 7: Frontend — useHowlerTTS reads device from current API

**Files:**
- Modify: `frontend/src/hooks/useHowlerTTS.ts`
- Test: `frontend/src/hooks/useHowlerTTS.settings.test.ts` (new)

**Interfaces:**
- Consumes: `GET /api/output-devices/current/` alongside the existing `GET /api/tts/settings/` inside `loadSettings`.
- Produces: `loadSettings()` now fetches both `settings` and `current` via `Promise.all`, sets `data.output_device_id` from `current.device.device_id` when present, then applies it. When `current` is `{device: null}` (or errors), behavior is unchanged from today (fall back to `settings.output_device_id`).
- Existing public API of the hook (returned object keys: `isPlaying, currentItem, settings, reloadSettings, clearQueue, skip, resumeAudio, unlockAudio, speakExchange, playItem, playQuestionerItem, playSubItem, applyOutputDevice, supportsOutputRouting`) is unchanged — only `loadSettings` logic changes.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/useHowlerTTS.settings.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup, waitFor } from '@testing-library/react'
import { useHowlerTTS } from './useHowlerTTS'

const { generateMock, ctx } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  ctx: {
    state: 'suspended',
    destination: {},
    resume: vi.fn(async () => {}),
    createBuffer: () => ({}),
    createBufferSource: () => ({ buffer: null, connect: () => {}, start: () => {} }),
  },
}))

vi.mock('@/services/api', () => ({
  ttsApi: { generate: generateMock },
}))

vi.mock('howler', () => {
  class Howl {
    once() {
      return this
    }
    play() {
      return 0
    }
    stop() {
      return this
    }
  }
  return { Howl, Howler: { ctx } }
})

const settingsResponse = {
  questioner_enabled: false,
  questioner_voice: 'q-voice',
  questioner_rate: '+0%',
  questioner_say_username: true,
  responder_enabled: true,
  responder_voice: 'r-voice',
  responder_rate: '+0%',
  responder_delay_ms: 0,
  output_device_id: '',
}

const fetchCalls: string[] = []

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

beforeEach(() => {
  fetchCalls.length = 0
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    fetchCalls.push(url)
    if (url.includes('/api/tts/settings/')) {
      return { ok: true, json: async () => settingsResponse }
    }
    if (url.includes('/api/output-devices/current/')) {
      return { ok: true, json: async () => ({ device: { device_id: 'current-dev', name: 'Current' } }) }
    }
    return { ok: false, json: async () => ({}) }
  }) as unknown as typeof fetch
  ctx.state = 'suspended'
  ctx.resume.mockClear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useHowlerTTS settings loading', () => {
  it('loads settings and prefers the device from the output-devices current API', async () => {
    const { result } = renderHook(() => useHowlerTTS())

    await waitFor(() => {
      expect(result.current.settings.output_device_id).toBe('current-dev')
    })

    expect(fetchCalls).toContain('/api/tts/settings/')
    expect(fetchCalls).toContain('/api/output-devices/current/')
  })

  it('falls back to settings.output_device_id when current returns null', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/tts/settings/')) {
        return { ok: true, json: async () => ({ ...settingsResponse, output_device_id: 'legacy-dev' }) }
      }
      if (url.includes('/api/output-devices/current/')) {
        return { ok: true, json: async () => ({ device: null }) }
      }
      return { ok: false, json: async () => ({}) }
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useHowlerTTS())

    await waitFor(() => {
      expect(result.current.settings.output_device_id).toBe('legacy-dev')
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```
docker compose exec frontend npm test -- useHowlerTTS.settings.test.ts
```
Expected: fails — `output_device_id` stays `''`, because `loadSettings` doesn't yet read the current API.

- [ ] **Step 3: Update `loadSettings` in useHowlerTTS**

In `frontend/src/hooks/useHowlerTTS.ts`, replace the body of `loadSettings` (lines 160-175) with:

```ts
  const loadSettings = useCallback(async () => {
    try {
      const [settingsResponse, currentResponse] = await Promise.all([
        fetch('/api/tts/settings/'),
        fetch('/api/output-devices/current/'),
      ])
      const data = settingsResponse.ok ? await settingsResponse.json() : null
      if (!data) return
      if (currentResponse.ok) {
        const { device } = await currentResponse.json()
        if (device?.device_id) {
          // Source of truth moved to the output_devices app; the settings
          // field is kept as a deprecated fallback.
          data.output_device_id = device.device_id
        }
      }
      setState((prev) => ({ ...prev, settings: data }))
      settingsRef.current = data
      if (data.output_device_id) {
        // Defer so AudioContext is ready after first user gesture
        setTimeout(() => applyOutputDevice(data.output_device_id), 0)
      }
    } catch (err) {
      console.error('Failed to load TTS settings:', err)
    }
  }, [applyOutputDevice])
```

- [ ] **Step 4: Run the new test + full frontend suite**

Run:
```
docker compose exec frontend npm test
```
Expected: all pass (new 2 + existing autoplay/speakExchange tests).

Run:
```
docker compose exec frontend npm run build
```
Expected: `tsc -b && vite build` succeed.

Run:
```
docker compose exec frontend npm run lint
```
Expected: oxlint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useHowlerTTS.ts frontend/src/hooks/useHowlerTTS.settings.test.ts
git commit -m "feat(tts): load output device from output-devices current API"
```

---

### Task 8: End-to-end verification (acceptance criteria)

**Files:** none (manual verification commands).

**Interfaces:** all endpoints from Tasks 1-7.

- [ ] **Step 1: Backend full suite**

Run:
```
docker compose exec backend python -m pytest -q
```
Expected: all green.

- [ ] **Step 2: URL resolution smoke check**

Run:
```
docker compose exec backend python manage.py shell -c "from django.urls import reverse; print(reverse('output-devices-list')); print(reverse('output-device-capture')); print(reverse('output-device-current'))"
```
Expected:
```
/api/output-devices/
/api/output-devices/capture/
/api/output-devices/current/
```

- [ ] **Step 3: Live API smoke test**

Run:
```
docker compose exec backend python manage.py shell -c "import requests; b='http://localhost:8000/api'; r=requests.get(b+'/output-devices/current/'); print(r.status_code, r.json()); c=requests.post(b+'/output-devices/capture/', json={'device_id':'smoke-1','label':'Smoke Speaker','platform':'windows'}); print(c.status_code, c.json()); g=requests.get(b+'/output-devices/'); print(g.status_code, [d['device_id'] for d in g.json()])"
```
Expected:
```
200 {'device': None}
201 {'id': 1, 'name': 'Smoke Speaker', ... 'device_id': 'smoke-1', ...}
200 ['smoke-1']
```

- [ ] **Step 4: Admin pages render**

Run (uses the existing superuser `admin` / password `admin`):
```
docker compose exec backend python manage.py shell -c "from django.test import Client; c=Client(); assert c.login(username='admin', password='admin'); a=c.get('/admin/output_devices/outputdevice/'); print(a.status_code); b=c.get('/admin/output_devices/outputdeviceselection/'); print(b.status_code)"
```
Expected:
```
200
200
```

- [ ] **Step 5: Clean up the smoke row**

Run:
```
docker compose exec backend python manage.py shell -c "from output_devices.models import OutputDevice, OutputDeviceSelection; OutputDevice.objects.filter(device_id='smoke-1').delete(); print('cleaned')"
```
Expected: `cleaned` (cascade removes the related selection via FK? — note: Selection.device is SET_NULL, so also delete the selection explicitly: `OutputDeviceSelection.objects.filter(device_id_legacy='smoke-1').delete()`).

- [ ] **Step 6: Final commit if any uncommitted changes remain**

Run:
```
git status --short
```
If clean, skip. Acceptance criterion 5 (browser reload restore) is a manual browser test with a real audio device — flag for the user to run via the TTS settings page (select device → save → reload → value restored, confirmed via `GET /api/output-devices/current/`).
```