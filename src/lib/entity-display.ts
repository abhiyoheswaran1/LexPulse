const PROCEDURAL_PATTERNS = [
  /\binformation associated with\b/i,
  /\bfacebook username:/i,
  /\buser id number:/i,
  /\bstored at premises controlled by\b/i,
  /\bsealed search warrant\b/i,
  /\bapplication for order commanding\b/i,
  /\bnot to notify any person\b/i,
  /\bdepartment of the\b/i,
];

export function isDisplayableEntityName(name: string | null | undefined) {
  const value = name?.trim();
  if (!value) return false;
  return !PROCEDURAL_PATTERNS.some((pattern) => pattern.test(value));
}
