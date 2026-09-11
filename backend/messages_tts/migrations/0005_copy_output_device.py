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