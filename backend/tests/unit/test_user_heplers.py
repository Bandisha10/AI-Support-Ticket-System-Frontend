import string
from backend.app.routers.users import generate_temp_password, is_super_admin, SUPER_ADMIN_EMAIL
from backend.app.models.user import User


def test_generate_temp_password():
    pw = generate_temp_password(16)
    assert len(pw) == 16
    assert any(c in string.ascii_uppercase for c in pw)
    assert any(c in string.ascii_lowercase for c in pw)
    assert any(c in string.digits for c in pw)
    assert any(c in "!@#$%^&*-_=+?" for c in pw)


def test_is_super_admin():
    super_admin = User(email=SUPER_ADMIN_EMAIL)
    regular_user = User(email="regular@test.com")
    assert is_super_admin(super_admin) is True
    assert is_super_admin(regular_user) is False
