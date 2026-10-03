export const CANNED_REPLIES = [
  // --- General & Triage ---
  {
    id: "greeting",
    title: "Standard Greeting & Acknowledgement",
    category: "General",
    body: "Hello,\n\nThank you for reaching out to Deskwise Support. I am reviewing your request and will be happy to assist you today.\n\nCould you please share any additional details or background regarding what you are experiencing so we can assist you as quickly as possible?",
  },
  {
    id: "manager_escalation",
    title: "Escalated to Tier 2 / Department Manager",
    category: "General",
    body: "Hello,\n\nYour inquiry has been escalated to our senior Tier 2 department team for specialized handling.\n\nA senior team member is actively reviewing your case details and will follow up with you directly here shortly. Thank you for your patience.",
  },

  // --- Technical Operations & Reliability ---
  {
    id: "request_logs",
    title: "Request Logs, Steps & Screenshots",
    category: "Technical",
    body: "Hello,\n\nTo help our technical team diagnose and replicate this issue, could you please provide:\n1. A clear screenshot or screen recording of the error\n2. The exact step-by-step actions that trigger the problem\n3. The browser, version, and operating system you are using\n\nYou can attach files directly using the attachment tool below. Thank you!",
  },
  {
    id: "service_outage",
    title: "Service Disruption / Outage Notice",
    category: "Technical",
    body: "Hello,\n\nOur Service Reliability team has identified an active service disruption that may be affecting your connection and functionality.\n\nOur engineers are actively working on restoring full operational capacity. We will update this ticket as soon as service stability is restored.",
  },
  {
    id: "bug_investigating",
    title: "Bug Confirmed & Logged to Engineering",
    category: "Technical",
    body: "Hello,\n\nThank you for bringing this to our attention. We have reproduced the issue and logged a defect ticket with our engineering team for a permanent patch.\n\nWe will keep this ticket open and post an update here as soon as the fix has been deployed.",
  },

  // --- Billing & Finance ---
  {
    id: "billing_investigation",
    title: "Billing & Charge Investigation",
    category: "Billing",
    body: "Hello,\n\nThank you for contacting Billing & Finance. We are reviewing your transaction history and account invoices regarding the charges you reported.\n\nCould you please confirm the transaction date, amount, and the last 4 digits of the payment method used? This will help us trace the payment in our records.",
  },
  {
    id: "refund_processed",
    title: "Refund Approved & Processed",
    category: "Billing",
    body: "Hello,\n\nWe have reviewed your request and approved a full refund for the reported transaction.\n\nThe credit has been initiated and should reflect on your original payment statement within 3 to 5 business days, depending on your financial institution.\n\nPlease let us know if you need an updated receipt or invoice statement.",
  },

  // --- Account & Access ---
  {
    id: "password_reset",
    title: "Password Reset & Account Recovery",
    category: "Account",
    body: "Hello,\n\nTo reset your password and regain access to your account:\n1. Navigate to the login page and select 'Forgot Password' (or visit /forgot-password).\n2. Enter your registered email address.\n3. Check your inbox for the password reset link and follow the on-screen instructions.\n\nIf you do not see the email within a few minutes, please check your Spam or Junk folders.",
  },
  {
    id: "account_verification",
    title: "Identity & Account Security Verification",
    category: "Account",
    body: "Hello,\n\nFor security and data privacy compliance, we need to verify account ownership before updating sensitive profile or email details.\n\nPlease confirm your registered account email, full account name, and any recent ticket or transaction reference associated with your account.",
  },

  // --- Product & Feedback ---
  {
    id: "feature_request",
    title: "Feature Request Forwarded to Product Ops",
    category: "Product",
    body: "Hello,\n\nThank you for your valuable feedback! We have documented your suggestion and forwarded it to our Product Operations team for roadmap consideration.\n\nWhile we cannot guarantee immediate implementation, suggestions from active users play a major role in shaping our platform improvements.",
  },

  // --- Resolution & CSAT ---
  {
    id: "resolved_csat",
    title: "Issue Resolved & CSAT Feedback Prompt",
    category: "Resolution",
    body: "Hello,\n\nWe have completed our investigation and resolved this issue. Everything should now be operating normally on your account.\n\nWe would appreciate it if you could take a brief moment to rate your support experience using the star rating prompt on this ticket. Your feedback helps us continually improve our service!\n\nIf you still need assistance, simply reply here to keep the discussion open.",
  },
  {
    id: "pending_closure",
    title: "Pending Customer Inactivity Closure",
    category: "Resolution",
    body: "Hello,\n\nWe are following up regarding your ticket as we haven't received a response to our previous message. \n\nWe are temporarily setting this ticket status to resolved. If you still need help or the issue recurs, simply reply to this thread anytime to automatically reopen it.",
  },
];
