from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):
    dependencies = [("accounts", "0008_responder_membership")]
    operations = [
        migrations.AlterField(
            model_name="guardian",
            name="user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="guardian_links",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
