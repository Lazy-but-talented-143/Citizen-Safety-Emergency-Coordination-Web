from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("emergency", "0010_chatmessage")]
    operations = [
        migrations.AlterField(
            model_name="emergency", name="status",
            field=models.CharField(max_length=20, choices=[
                ("PENDING", "Pending"), ("ASSIGNED", "Assigned"), ("IN_PROGRESS", "In Progress"),
                ("RESOLVED", "Resolved"), ("CANCELLED", "Cancelled by Resident"), ("AUTO_CLOSED", "Auto-Closed")
            ], default="PENDING"),
        ),
    ]
