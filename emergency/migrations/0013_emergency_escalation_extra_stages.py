from django.db import migrations, models
class Migration(migrations.Migration):
    dependencies = [("emergency", "0012_emergency_reached_and_additional_responders")]
    operations = [migrations.AlterField(model_name="emergencyescalation", name="contact_type", field=models.CharField(max_length=20, choices=[("PRIMARY","Primary Guardian"),("SECONDARY","Secondary Guardian"),("EMERGENCY","Emergency Contact"),("SECURITY","Security"),("VOLUNTEER","Volunteer"),("PENDING","Open Pending Queue"),("HANDOVER","Handover Request"),("ADDITIONAL_HELP","Additional Help")])),]
