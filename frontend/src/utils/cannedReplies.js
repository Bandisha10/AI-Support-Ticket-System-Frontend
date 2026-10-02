export const CANNED_REPLIES = [
  {
    id: "greeting",
    title: "Standard Greeting",
    category: "General",
    body: "Hello,\n\nThank you for reaching out to Deskwise Support. I would be happy to help you with your inquiry.\n\nCould you please provide a few more details regarding what you are experiencing?",
  },
  {
    id: "request_logs",
    title: "Request More Details & Screenshots",
    category: "Troubleshooting",
    body: "Hello,\n\nTo help us investigate this issue further, could you please provide:\n1. A screenshot or screen recording of the error\n2. The exact steps to reproduce\n3. Your current browser and operating system version\n\nOnce we have this information, we will proceed with troubleshooting.",
  },
  {
    id: "password_reset",
    title: "Password Reset Instructions",
    category: "Account",
    body: "Hello,\n\nYou can reset your password by clicking 'Forgot Password' on the login page or by visiting:\nhttp://localhost:5173/forgot-password\n\nPlease enter your registered email address and follow the instructions sent to your inbox.",
  },
  {
    id: "bug_investigating",
    title: "Bug Reported to Engineering",
    category: "Technical",
    body: "Hello,\n\nThank you for reporting this issue. We have logged this with our engineering team for investigation.\n\nWe will update you here as soon as we have a fix or workaround available. Thank you for your patience!",
  },
  {
    id: "resolved_closing",
    title: "Issue Resolved & Ticket Closure",
    category: "Resolution",
    body: "Hello,\n\nWe are following up to confirm that the reported issue has been resolved. We are now marking this ticket as closed.\n\nIf you have any further questions or if the issue persists, please feel free to reopen this ticket or submit a new one.",
  },
];
