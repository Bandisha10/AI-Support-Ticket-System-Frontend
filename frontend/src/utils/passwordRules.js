export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 16;

export const PASSWORD_REQUIREMENTS = [
  {
    id: "length",
    label: "8 to 16 characters",
    test: (p) => p.length >= MIN_PASSWORD_LENGTH && p.length <= MAX_PASSWORD_LENGTH,
  },
  { id: "lower", label: "One lowercase (a-z)", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "One uppercase (A-Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "One number (0-9)", test: (p) => /[0-9]/.test(p) },
];
