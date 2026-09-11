"""Tests for output_devices models and views."""

import pytest
from django.test import RequestFactory
from rest_framework import status

from output_devices.models import OutputDevice, OutputDeviceSelection
from output_devices.views import (
    output_devices_list,
    output_device_capture,
    output_device_current,
)

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
        assert OutputDeviceSelection.objects.count() == 1

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