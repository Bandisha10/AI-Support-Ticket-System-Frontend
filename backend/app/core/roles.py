COMPANY_DOMAINS = {
    "ritgoa.ac.in",
    "aiemgoa.ac.in",
    "pccegoa.edu.in",
}

def is_company_domain(email: str) -> bool:
    """Check if the email belongs to an allowed company domain."""
    domain = email.rsplit("@", 1)[-1].strip().lower() if "@" in email else ""
    return domain in COMPANY_DOMAINS
