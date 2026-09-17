import pytest
from backend.app.core.roles import is_company_domain, COMPANY_DOMAINS


@pytest.mark.parametrize(
    "email,expected",
    [
        ("agent@ritgoa.ac.in", True),
        ("support@aiemgoa.ac.in", True),
        ("staff@pccegoa.edu.in", True),
        ("UPPER@RITGOA.AC.IN", True),
        ("user@gmail.com", False),
        ("hacker@fake-ritgoa.ac.in", False),
        ("notanemail", False),
        ("", False),
    ],
)
def test_is_company_domain(email: str, expected: bool):
    assert is_company_domain(email) is expected


def test_company_domains_set_integrity():
    assert "ritgoa.ac.in" in COMPANY_DOMAINS
    assert "aiemgoa.ac.in" in COMPANY_DOMAINS
    assert "pccegoa.edu.in" in COMPANY_DOMAINS
