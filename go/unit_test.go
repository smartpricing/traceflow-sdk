package traceflow

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestIsValidUUID(t *testing.T) {
	cases := map[string]bool{
		newUUID():                              true,
		"123e4567-e89b-12d3-a456-426614174000": true,
		"not-a-uuid":                           false,
		"":                                     false,
		"123e4567e89b12d3a456426614174000":     false,
	}
	for in, want := range cases {
		if got := IsValidUUID(in); got != want {
			t.Errorf("IsValidUUID(%q)=%v want %v", in, got, want)
		}
	}
}

func TestEnsureValidUUIDGeneratesOnInvalid(t *testing.T) {
	got := ensureValidUUID("bad", noopLogger{}, "trace_id")
	if !IsValidUUID(got) {
		t.Fatalf("expected generated uuid, got %q", got)
	}
	keep := newUUID()
	if ensureValidUUID(keep, noopLogger{}, "x") != keep {
		t.Fatal("valid uuid should be preserved")
	}
}

func TestNewUUIDUniqueAndVersioned(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		u := newUUID()
		if seen[u] {
			t.Fatalf("duplicate uuid: %s", u)
		}
		seen[u] = true
		if u[14] != '4' {
			t.Fatalf("expected version 4 nibble, got %s", u)
		}
	}
}

func TestSanitizeBasicTypes(t *testing.T) {
	in := map[string]any{
		"s": "str",
		"n": 42,
		"b": true,
		"nested": map[string]any{
			"arr": []int{1, 2, 3},
		},
	}
	out := sanitize(in)
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(data), `"str"`) {
		t.Fatalf("unexpected: %s", data)
	}
}

func TestSanitizeHandlesCycles(t *testing.T) {
	type node struct {
		Name string
		Next *node `json:"next"`
	}
	a := &node{Name: "a"}
	b := &node{Name: "b"}
	a.Next = b
	b.Next = a // cycle

	out := sanitize(a)
	if _, err := json.Marshal(out); err != nil {
		t.Fatalf("cycle should be safe to marshal, got %v", err)
	}
}

func TestSanitizeTime(t *testing.T) {
	ts := time.Date(2024, 1, 2, 3, 4, 5, 678000000, time.UTC)
	out := sanitize(ts)
	if out != "2024-01-02T03:04:05.678Z" {
		t.Fatalf("expected ISO ms timestamp, got %v", out)
	}
}

func TestSanitizeFuncBecomesPlaceholder(t *testing.T) {
	out := sanitize(map[string]any{"fn": func() {}})
	m, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", out)
	}
	if s, _ := m["fn"].(string); !strings.HasPrefix(s, "[unsupported type") {
		t.Fatalf("expected unsupported placeholder, got %v", m["fn"])
	}
}

func TestIsoTimestampFormat(t *testing.T) {
	ts := isoTimestamp()
	if _, err := time.Parse("2006-01-02T15:04:05.000Z07:00", ts); err != nil {
		t.Fatalf("isoTimestamp produced unparseable value %q: %v", ts, err)
	}
}

func TestCompactDropsNil(t *testing.T) {
	out := compact(map[string]any{"a": 1, "b": nil, "c": "x"})
	if _, ok := out["b"]; ok {
		t.Fatal("nil value should be dropped")
	}
	if len(out) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(out))
	}
}
