/**
 * Validate a branch prefix for git compatibility.
 * Allowed characters: a-z, A-Z, 0-9, -, _, /
 * Empty string is valid (will use default 'fleet').
 */
export function isValidBranchPrefix(prefix: string): boolean {
  if (!prefix) return true;
  return /^[a-zA-Z0-9/_-]+$/.test(prefix);
}
