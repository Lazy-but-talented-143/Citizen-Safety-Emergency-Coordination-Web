from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
class Migration(migrations.Migration):
    dependencies=[("accounts","0007_guardian_relationship")]
    operations=[migrations.CreateModel(name="ResponderMembershipRequest",fields=[
        ("id",models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name="ID")),
        ("role",models.CharField(choices=[("SECURITY","Security"),("VOLUNTEER","Volunteer")],max_length=20)),
        ("direction",models.CharField(choices=[("REQUEST","Responder Requested Access"),("INVITE","Admin Invited Responder")],max_length=10)),
        ("status",models.CharField(choices=[("PENDING","Pending"),("ACCEPTED","Accepted"),("DECLINED","Declined")],default="PENDING",max_length=10)),
        ("created_at",models.DateTimeField(auto_now_add=True)),("responded_at",models.DateTimeField(blank=True,null=True)),
        ("requested_by",models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="responder_membership_requests_created",to=settings.AUTH_USER_MODEL)),
        ("responder",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="responder_membership_requests",to=settings.AUTH_USER_MODEL)),
        ("society",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="responder_membership_requests",to="society.society")),
    ])]
