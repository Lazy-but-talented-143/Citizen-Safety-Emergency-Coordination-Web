from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Guardian


admin.site.register(User, UserAdmin)
admin.site.register(Guardian)