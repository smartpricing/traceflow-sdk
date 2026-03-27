package com.smartness.traceflow;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * UUID validation utility.
 */
public final class UuidValidator {

    private static final Logger log = LoggerFactory.getLogger(UuidValidator.class);

    private static final Pattern UUID_PATTERN =
            Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                    Pattern.CASE_INSENSITIVE);

    private UuidValidator() {}

    public static boolean isValid(String value) {
        return value != null && UUID_PATTERN.matcher(value).matches();
    }

    /**
     * Returns the value if it's a valid UUID, otherwise generates a new one.
     */
    public static String ensureValid(String value, String fieldName) {
        if (value == null) {
            return UUID.randomUUID().toString();
        }
        if (isValid(value)) {
            return value;
        }
        String replacement = UUID.randomUUID().toString();
        log.warn("[TraceFlow] Invalid UUID for \"{}\": \"{}\" — replaced with \"{}\"", fieldName, value, replacement);
        return replacement;
    }
}
