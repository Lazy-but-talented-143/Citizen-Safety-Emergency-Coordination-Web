from django.contrib import admin
from .models import Emergency, Notification

admin.site.register(Emergency)
admin.site.register(Notification)