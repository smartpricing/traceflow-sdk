/**
 * Recursively sanitize a value so it is safe for JSON.stringify.
 * Functions, Symbols, BigInts, circular references, and other
 * non-serializable types are replaced with descriptive placeholders.
 */
export function sanitizePayload(value: unknown, depth: number = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (depth > 64) {
    return '[max depth reached]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  const type = typeof value;

  if (type === 'string' || type === 'number' || type === 'boolean') {
    return value;
  }

  if (type === 'bigint') {
    return value.toString();
  }

  if (type === 'symbol') {
    return value.toString();
  }

  if (type === 'function') {
    return `[Function: ${(value as Function).name || 'anonymous'}]`;
  }

  if (type === 'object') {
    const obj = value as object;

    // Circular reference detection
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);

    // Date — keep as ISO string
    if (obj instanceof Date) {
      return obj.toISOString();
    }

    // RegExp
    if (obj instanceof RegExp) {
      return obj.toString();
    }

    // Error
    if (obj instanceof Error) {
      return { message: obj.message, name: obj.name, stack: obj.stack };
    }

    // Map
    if (obj instanceof Map) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of obj) {
        result[String(k)] = sanitizePayload(v, depth + 1, seen);
      }
      return result;
    }

    // Set
    if (obj instanceof Set) {
      return [...obj].map(v => sanitizePayload(v, depth + 1, seen));
    }

    // Buffer / Uint8Array
    if (obj instanceof Uint8Array) {
      return `[Buffer: ${obj.byteLength} bytes]`;
    }

    // toJSON support (e.g. Moment, Decimal, custom objects)
    if (typeof (obj as any).toJSON === 'function') {
      try {
        return sanitizePayload((obj as any).toJSON(), depth + 1, seen);
      } catch {
        return `[${obj.constructor?.name || 'Object'}: toJSON failed]`;
      }
    }

    // Array
    if (Array.isArray(obj)) {
      return obj.map(v => sanitizePayload(v, depth + 1, seen));
    }

    // Plain object
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = sanitizePayload(v, depth + 1, seen);
    }
    return result;
  }

  return `[unknown type: ${type}]`;
}
