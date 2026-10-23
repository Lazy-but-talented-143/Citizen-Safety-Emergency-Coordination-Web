from django.db import migrations

def drop_obsolete_tables(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        tables = connection.introspection.table_names(cursor)
        if "emergency_emergencyscalation" in tables:
            cursor.execute("DROP TABLE emergency_emergencyscalation;")

class Migration(migrations.Migration):

    dependencies = [
        ('emergency', '0013_emergency_escalation_extra_stages'),
    ]

    operations = [
        migrations.RunPython(drop_obsolete_tables, reverse_code=migrations.RunPython.noop),
    ]
