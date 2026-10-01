"""
Role & Domain Authorization Helper.
Maintains whitelist of internal/institutional domains.
Prevents internal domain users from self-registering via the public signup portal.
"""

# Authorized company domains for agents
COMPANY_DOMAINS = {
    "ritgoa.ac.in",
    "aiemgoa.ac.in",
    "pccegoa.edu.in",
}


def is_company_domain(email: str) -> bool:
    """
    Checks if an email address belongs to a company domain.
    Staff accounts with these domains must be formally invited by an administrator
    rather than registering via public self-service signup.
    """
    domain = email.rsplit("@", 1)[-1].strip().lower() if "@" in email else ""
    return domain in COMPANY_DOMAINS
