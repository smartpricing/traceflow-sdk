package traceflow

import (
	"fmt"
	"reflect"
	"strings"
	"time"
)

const maxSanitizeDepth = 64

// sanitize recursively converts a value into something safe for encoding/json,
// guarding against cycles, excessive depth, and unsupported kinds. It mirrors
// the JS SDK's sanitizePayload so payloads behave consistently across SDKs.
func sanitize(value any) any {
	return sanitizeValue(reflect.ValueOf(value), 0, map[uintptr]bool{})
}

func sanitizeValue(v reflect.Value, depth int, seen map[uintptr]bool) any {
	if depth > maxSanitizeDepth {
		return "[max depth reached]"
	}
	if !v.IsValid() {
		return nil
	}

	// time.Time -> ISO string (parallels the JS Date handling).
	if t, ok := v.Interface().(time.Time); ok {
		return t.UTC().Format("2006-01-02T15:04:05.000Z07:00")
	}
	// error -> message.
	if err, ok := v.Interface().(error); ok {
		return map[string]any{"message": err.Error()}
	}

	switch v.Kind() {
	case reflect.Ptr, reflect.Interface:
		if v.IsNil() {
			return nil
		}
		return sanitizeValue(v.Elem(), depth, seen)

	case reflect.Bool:
		return v.Bool()
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return v.Int()
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return v.Uint()
	case reflect.Float32, reflect.Float64:
		return v.Float()
	case reflect.String:
		return v.String()

	case reflect.Func, reflect.Chan, reflect.UnsafePointer:
		return fmt.Sprintf("[unsupported type: %s]", v.Kind())

	case reflect.Slice, reflect.Array:
		// []byte -> placeholder, matching the JS Buffer handling.
		if v.Kind() == reflect.Slice && v.Type().Elem().Kind() == reflect.Uint8 {
			return fmt.Sprintf("[Buffer: %d bytes]", v.Len())
		}
		if v.Kind() == reflect.Slice {
			if v.IsNil() {
				return nil
			}
			if markSeen(v, seen) {
				return "[Circular]"
			}
			defer unmark(v, seen)
		}
		out := make([]any, v.Len())
		for i := 0; i < v.Len(); i++ {
			out[i] = sanitizeValue(v.Index(i), depth+1, seen)
		}
		return out

	case reflect.Map:
		if v.IsNil() {
			return nil
		}
		if markSeen(v, seen) {
			return "[Circular]"
		}
		defer unmark(v, seen)
		out := make(map[string]any, v.Len())
		for _, key := range v.MapKeys() {
			out[fmt.Sprint(sanitizeValue(key, depth+1, seen))] = sanitizeValue(v.MapIndex(key), depth+1, seen)
		}
		return out

	case reflect.Struct:
		out := make(map[string]any)
		t := v.Type()
		for i := 0; i < t.NumField(); i++ {
			field := t.Field(i)
			if field.PkgPath != "" { // unexported
				continue
			}
			name, omitEmpty := jsonFieldName(field)
			if name == "-" {
				continue
			}
			// omitempty must be honored here, not left to json.Marshal: sanitize
			// returns a map, and maps have no omitempty. Dropping the option would
			// put every zero field on the wire ("trace_id":"", "tags":null, …),
			// which the other SDKs never send — JS because JSON.stringify drops
			// undefined, PHP because it array_filters nulls — and which the
			// service rejects with 400 on PATCH (trace_id must be a valid UUID).
			if omitEmpty && isEmptyValue(v.Field(i)) {
				continue
			}
			out[name] = sanitizeValue(v.Field(i), depth+1, seen)
		}
		return out

	default:
		return fmt.Sprintf("[unknown type: %s]", v.Kind())
	}
}

// jsonFieldName reports the wire name of a struct field and whether its json
// tag carries the omitempty option, so sanitize can reproduce what
// json.Marshal would have emitted for the same struct.
func jsonFieldName(field reflect.StructField) (name string, omitEmpty bool) {
	tag := field.Tag.Get("json")
	if tag == "" {
		return field.Name, false
	}
	name = tag
	if i := strings.IndexByte(tag, ','); i >= 0 {
		name = tag[:i]
		for _, opt := range strings.Split(tag[i+1:], ",") {
			if opt == "omitempty" {
				omitEmpty = true
				break
			}
		}
	}
	if name == "" {
		name = field.Name
	}
	return name, omitEmpty
}

// isEmptyValue mirrors encoding/json's notion of empty for the omitempty
// option: false, 0, a nil pointer or interface, and any empty array, map,
// slice or string.
func isEmptyValue(v reflect.Value) bool {
	switch v.Kind() {
	case reflect.Array, reflect.Map, reflect.Slice, reflect.String:
		return v.Len() == 0
	case reflect.Bool:
		return !v.Bool()
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return v.Int() == 0
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return v.Uint() == 0
	case reflect.Float32, reflect.Float64:
		return v.Float() == 0
	case reflect.Interface, reflect.Ptr:
		return v.IsNil()
	}
	return false
}

func markSeen(v reflect.Value, seen map[uintptr]bool) bool {
	ptr := v.Pointer()
	if ptr == 0 {
		return false
	}
	if seen[ptr] {
		return true
	}
	seen[ptr] = true
	return false
}

func unmark(v reflect.Value, seen map[uintptr]bool) {
	if ptr := v.Pointer(); ptr != 0 {
		delete(seen, ptr)
	}
}
