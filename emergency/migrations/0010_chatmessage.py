from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [("emergency", "0009_emergencyscalation_pending_stage")]
    operations = [migrations.CreateModel(name="ChatMessage", fields=[
        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
        ("message", models.TextField()),
        ("created_at", models.DateTimeField(auto_now_add=True)),
        ("emergency", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="chat_messages", to="emergency.emergency")),
        ("sender", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="emergency_chat_messages", to=settings.AUTH_USER_MODEL)),
    ], options={"ordering": ["created_at"]}),]
