"""Reduce the username→message pause default from 3s to 1s.

Also updates the existing singleton row: rows still holding the old 3000 ms
default (i.e. never customized by the user) drop to 1000 ms.
"""

from django.db import migrations, models


def update_existing_row(apps, schema_editor):
    TTSSettings = apps.get_model('messages_tts', 'TTSSettings')
    TTSSettings.objects.filter(pk=1, responder_delay_ms=3000).update(
        responder_delay_ms=1000
    )


class Migration(migrations.Migration):

    dependencies = [
        ('messages_tts', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ttssettings',
            name='responder_delay_ms',
            field=models.IntegerField(
                default=1000,
                help_text='เวลารอระหว่างชื่อผู้ใช้กับข้อความ (มิลลิวินาที)',
            ),
        ),
        migrations.AlterField(
            model_name='ttssettings',
            name='questioner_say_username',
            field=models.BooleanField(
                default=True,
                help_text='พูดชื่อผู้ใช้ก่อนข้อความ (เช่น username... รอ 1 วินาที... ข้อความ)',
            ),
        ),
        migrations.RunPython(update_existing_row, migrations.RunPython.noop),
    ]
