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