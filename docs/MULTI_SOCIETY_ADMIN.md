# Multi-Society Administration

## Tenant model

Each society is treated as a tenant.

A normal `ADMIN` account has one `society` foreign key and can only access records belonging to that society.

## Backend enforcement

The API scopes:

- Users
- Societies
- Blocks
- Flats
- Guardians
- Emergencies
- Notifications
- Responder locations
- Dashboard statistics
- Analytics

to the logged-in administrator's society.

Frontend visibility is not the security boundary.

## Platform administration

A Django superuser whose application role is `ADMIN` is treated as an optional platform administrator. This is intentionally separate from normal society operation.

## Admin provisioning

Public registration accepts `ADMIN`, with the new administrator required to select a society. The login page does not ask the user to choose a role; the backend profile determines the role after authentication.

Use:

```powershell
python manage.py provision_admin --username <name> --phone <phone> --society <society_id> --password "<password>"
```

This creates a non-superuser, society-scoped `ADMIN`.

## Demo

`python manage.py seed_demo` creates:

- Green Valley Residency → `admin / admin123`
- Sunrise Residency → `admin2 / admin2123`

This makes tenant isolation directly demonstrable during a project presentation or viva.
