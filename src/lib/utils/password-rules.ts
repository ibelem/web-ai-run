// Live password requirement checks. Surface these next to a password input so
// users can see what they're missing as they type, instead of guessing and
// hitting an error after submit.

export interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'At least 1 number',     test: (pw) => /\d/.test(pw) }
];

export function meetsAllRules(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}
