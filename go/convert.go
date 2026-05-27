package traceflow

// Helpers for reading loosely-typed payload values back into concrete types
// when building HTTP request bodies. Missing or mistyped values degrade to
// zero values rather than panicking.

func asString(v any) string {
	switch s := v.(type) {
	case string:
		return s
	case LogLevel:
		return string(s)
	default:
		return ""
	}
}

func asInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
}

func asStringSlice(v any) []string {
	if s, ok := v.([]string); ok {
		return s
	}
	return nil
}

func asMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return nil
}
