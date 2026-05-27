package traceflow

import (
	"crypto/rand"
	"encoding/hex"
	"regexp"
)

var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// newUUID generates a random RFC 4122 version 4 UUID.
func newUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand failure is catastrophic and effectively never happens;
		// fall back to a zeroed-but-versioned value rather than panicking in a
		// fire-and-forget tracing path.
		b = [16]byte{}
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10

	buf := make([]byte, 36)
	hex.Encode(buf[0:8], b[0:4])
	buf[8] = '-'
	hex.Encode(buf[9:13], b[4:6])
	buf[13] = '-'
	hex.Encode(buf[14:18], b[6:8])
	buf[18] = '-'
	hex.Encode(buf[19:23], b[8:10])
	buf[23] = '-'
	hex.Encode(buf[24:36], b[10:16])
	return string(buf)
}

// IsValidUUID reports whether value is a UUID in 8-4-4-4-12 hex format.
func IsValidUUID(value string) bool {
	return uuidRegex.MatchString(value)
}

// ensureValidUUID returns value if it is a valid UUID, otherwise it generates a
// new one and logs a warning naming the offending field.
func ensureValidUUID(value string, logger Logger, fieldName string) string {
	if value == "" {
		return newUUID()
	}
	if IsValidUUID(value) {
		return value
	}
	replacement := newUUID()
	if logger != nil {
		logger.Warn("Invalid UUID for %q: %q — replaced with %q", fieldName, value, replacement)
	}
	return replacement
}
