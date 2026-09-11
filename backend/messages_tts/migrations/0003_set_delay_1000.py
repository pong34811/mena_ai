"""Ensure responder_delay_ms is set to 1000 ms for all existing rows.
"""

from django.db import migrations, models


def set_all_delay(apps, schema_editor):
    TTSSettings = apps.get_model('messages_tts', 'TTSSettings')
    TTSSettings.objects.all().update(responder_delay_ms=1000)


class Migration(migrations.Migration):
    dependencies = [
        ('messages_tts', '0002_responder_delay_1s'),
    ]
    operations = [
        migrations.RunPython(set_all_delay, migrations.RunPython.noop),
    ]
