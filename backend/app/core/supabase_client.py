"""
Supabase Client Factory & Singletons.
Separates standard anonymous client operations from privileged service-role admin calls.
"""
from supabase import create_client, Client
from backend.app.config import settings

# 1. Standard Anon Client: Subject to Row Level Security (RLS) policies
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

# 2. Service Role Admin Client: Bypasses RLS; used strictly for administrative provisioning,
#    invitations, password updates, and storage bucket administrative tasks.
supabase_admin: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def make_anon_client() -> Client:
    """
    Creates a fresh, unauthenticated Supabase Client instance.
    Essential for isolated credential verification (e.g. sign_in_with_password)
    so active session states do not leak across asynchronous requests.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
