from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_guardian_user_user_profile_photo"),
    ]

    operations = [
        migrations.AlterField(
            model_name="guardian",
            name="user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="guardian_links",
                to="accounts.user",
            ),
        ),
        migrations.AddField(
            model_name="guardian",
            name="relationship_status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending Acceptance"),
                    ("ACCEPTED", "Accepted"),
                    ("DECLINED", "Declined"),
                    ("CANCELLED", "Cancelled"),
                ],
                default="PENDING",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="guardian",
            name="requested_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="guardian_requests_created",
                to="accounts.user",
            ),
        ),
    ]
