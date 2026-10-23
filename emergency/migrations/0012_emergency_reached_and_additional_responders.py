from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [("emergency", "0011_emergency_closure_statuses")]
    operations = [
        migrations.AddField(model_name="emergency", name="reached_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="emergency", name="additional_responders", field=models.ManyToManyField(blank=True, related_name="additional_emergency_cases", to=settings.AUTH_USER_MODEL)),
    ]
