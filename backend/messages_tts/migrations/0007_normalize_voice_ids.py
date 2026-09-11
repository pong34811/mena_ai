"""Normalize persisted TTSSettings voice ids to the Piper voice.

Matches any legacy edge-tts voice id and stores the canonical Piper id
(th_TH-tsync2-medium) so the frontend voice picker always shows a valid value.
"""
from django.db import migrations

PIPER_VOICE = "th_TH-tsync2-medium"
LEGACY_VOICES = {
    "th-TH-PremwadeeNeural", "th-TH-NiwatNeural",
    "en-US-AriaNeural", "en-US-GuyNeural", "en-US-JennyNeural",
    "en-US-MichelleNeural", "en-GB-SoniaNeural", "en-GB-RyanNeural",
    "ja-JP-NanamiNeural", "ja-JP-KeitaNeural",
}


def normalize_voices(apps, schema_editor):
    TTSSettings = apps.get_model("messages_tts", "TTSSettings")
    for obj in TTSSettings.objects.all():
        changed = False
        if obj.questioner_voice in LEGACY_VOICES:
            obj.questioner_voice = PIPER_VOICE
            changed = True
        if obj.responder_voice in LEGACY_VOICES:
            obj.responder_voice = PIPER_VOICE
            changed = True
        if changed:
            obj.save(update_fields=["questioner_voice", "responder_voice"])


def unormalize_voices(apps, schema_editor):
    # Non-reversible; keep forward default.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("messages_tts", "0006_alter_ttssettings_questioner_voice_and_more"),
    ]

    operations = [
        migrations.RunPython(normalize_voices, unormalize_voices),
    ]