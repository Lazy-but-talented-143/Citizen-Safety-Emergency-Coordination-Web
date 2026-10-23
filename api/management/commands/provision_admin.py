from django.core.management.base import BaseCommand, CommandError
from accounts.models import User
from society.models import Society


class Command(BaseCommand):
    help = "Provision a society-scoped ADMIN account through a controlled server-side process."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)
        parser.add_argument("--phone", required=True)
        parser.add_argument("--society", type=int, required=True, dest="society_id")
        parser.add_argument("--password", required=True)
        parser.add_argument("--email", default="")
        parser.add_argument("--first-name", default="")
        parser.add_argument("--last-name", default="")

    def handle(self, *args, **options):
        username = options["username"].strip()
        if User.objects.filter(username=username).exists():
            raise CommandError("Username already exists.")
        society = Society.objects.filter(pk=options["society_id"]).first()
        if not society:
            raise CommandError("Society not found.")

        user = User.objects.create_user(
            username=username,
            password=options["password"],
            first_name=options["first_name"],
            last_name=options["last_name"],
            email=options["email"],
            phone=options["phone"],
            role="ADMIN",
            society=society,
            is_verified=True,
            is_staff=False,
            is_superuser=False,
            volunteer_status="OFFLINE",
        )
        self.stdout.write(self.style.SUCCESS(
            f"Society admin '{user.username}' provisioned for '{society.name}' (id={society.id})."
        ))
