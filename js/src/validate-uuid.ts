/**
 * UUID validation utility
 * Validates that a string is a valid UUID (v1-v5 format)
 */

import { v4 as uuidv4 } from 'uuid';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true if the string is a valid UUID in 8-4-4-4-12 format.
 */
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Returns the value if it's a valid UUID, otherwise generates a new one.
 */
export function ensureValidUuid(value: string | undefined, logger?: { warn: (...args: any[]) => void }, fieldName?: string): string {
  if (!value) {
    return uuidv4();
  }
  if (isValidUuid(value)) {
    return value;
  }
  const replacement = uuidv4();
  logger?.warn(`Invalid UUID for "${fieldName}": "${value}" — replaced with "${replacement}"`);
  return replacement;
}
