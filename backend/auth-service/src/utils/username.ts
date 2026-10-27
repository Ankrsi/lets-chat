// 3-20 chars: lowercase letters, digits, "." and "_"; must start and end with a letter or digit,
// and may not contain two separators in a row.
export const USERNAME_PATTERN = /^(?=.{3,20}$)[a-z0-9](?:[a-z0-9]|[._](?![._]))*[a-z0-9]$/;

const RESERVED = new Set([
  "admin", "administrator", "root", "support", "help", "system", "official",
  "moderator", "security", "api", "null", "undefined", "me", "settings",
]);

export const normalizeUsername = (input: string) => input.trim().toLowerCase();

export const usernameProblem = (username: string): string | null => {
  if (!USERNAME_PATTERN.test(username))
    return "Username must be 3-20 characters: letters, numbers, '.' or '_', starting and ending with a letter or number";
  if (RESERVED.has(username)) return "This username is reserved";
  return null;
};
