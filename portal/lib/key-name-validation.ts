const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9 _\-]*$/;
export const KEY_NAME_MAX_LENGTH = 64;

export function validateKeyName(
  name: string,
  existingNames: string[],
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Key name is required.";
  if (trimmed.length > KEY_NAME_MAX_LENGTH)
    return `Max ${KEY_NAME_MAX_LENGTH} characters.`;
  if (!NAME_PATTERN.test(trimmed))
    return "Only letters, numbers, spaces, hyphens, and underscores. Must start with a letter or number.";
  if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase()))
    return "A key with this name already exists.";
  return null;
}
