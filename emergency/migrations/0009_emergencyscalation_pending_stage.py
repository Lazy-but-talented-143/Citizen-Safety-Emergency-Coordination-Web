from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("emergency", "0008_emergency_closure_note_emergency_priority_and_more")]

    operations = [
        migrations.AlterField(
            model_name="emergencyescalation",
            name="contact_type",
            field=models.CharField(choices=[("PRIMARY", "Primary Guardian"), ("SECONDARY", "Secondary Guardian"), ("EMERGENCY", "Emergency Contact"), ("SECURITY", "Security"), ("VOLUNTEER", "Volunteer"), ("PENDING", "Open Pending Queue")], max_length=20),
        ),
    ]
