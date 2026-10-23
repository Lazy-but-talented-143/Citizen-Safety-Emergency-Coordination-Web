"""
Platform Authorization & Admin Service
=======================================
Helper functions for platform-level and society-level authorization.
"""

def is_platform_admin(user):
    """
    Returns True if user is authenticated, has superuser status, and role is ADMIN.
    """
    u = getattr(user, "user", user)
    return bool(
        u and
        getattr(u, "is_authenticated", False) and
        getattr(u, "is_superuser", False) and
        getattr(u, "role", None) == "ADMIN"
    )


def scoped_society_id(user):
    """
    Returns None if user is platform admin, otherwise returns user.society_id.
    """
    u = getattr(user, "user", user)
    return None if is_platform_admin(u) else getattr(u, "society_id", None)


def ensure_admin_scope(user, society_id):
    """
    Returns True if user is platform admin OR a society admin for the given society_id.
    """
    u = getattr(user, "user", user)
    if is_platform_admin(u):
        return True
    if not u or not getattr(u, "is_authenticated", False) or getattr(u, "role", None) != "ADMIN":
        return False
    user_soc_id = getattr(u, "society_id", None)
    return bool(user_soc_id and society_id is not None and int(society_id) == int(user_soc_id))
