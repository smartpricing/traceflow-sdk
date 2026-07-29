package traceflow

import (
	"encoding/json"
	"testing"
)

// The HTTP payload structs are only ever marshalled through sanitize(), so
// sanitize is what decides the bytes on the wire. These tests pin it to
// json.Marshal: any field the struct tags omit must stay off the wire.
//
// Regression: sanitize used to flatten structs into maps field by field,
// silently dropping omitempty. Every request then carried its zero fields —
// most damagingly `"trace_id": ""` on PATCH /traces/{id}, which the service
// rejects with 400 (trace_id must be a valid UUID). The SDK does not retry
// 4xx and silences transport errors by default, so trace finishes vanished
// and traces sat open until the server's TraceCleaner failed them with
// "Trace timeout - no activity detected".

// marshalThroughTransport reproduces httpTransport.execute's encoding.
func marshalThroughTransport(t *testing.T, body any) map[string]any {
	t.Helper()
	data, err := json.Marshal(sanitize(body))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return got
}

func assertSameAsJSONMarshal(t *testing.T, body any) {
	t.Helper()
	want, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal reference: %v", err)
	}
	got, err := json.Marshal(sanitize(body))
	if err != nil {
		t.Fatalf("marshal sanitized: %v", err)
	}
	// Compare as maps: key order differs, content must not.
	var wantMap, gotMap map[string]any
	if err := json.Unmarshal(want, &wantMap); err != nil {
		t.Fatalf("unmarshal reference: %v", err)
	}
	if err := json.Unmarshal(got, &gotMap); err != nil {
		t.Fatalf("unmarshal sanitized: %v", err)
	}
	for k := range gotMap {
		if _, ok := wantMap[k]; !ok {
			t.Errorf("sanitize emitted %q, which json.Marshal omits (value %#v)", k, gotMap[k])
		}
	}
	for k := range wantMap {
		if _, ok := gotMap[k]; !ok {
			t.Errorf("sanitize dropped %q, which json.Marshal emits", k)
		}
	}
}

func TestSanitizeHonorsOmitEmpty(t *testing.T) {
	type payload struct {
		Kept       string         `json:"kept,omitempty"`
		EmptyStr   string         `json:"empty_str,omitempty"`
		NilMap     map[string]any `json:"nil_map,omitempty"`
		NilSlice   []string       `json:"nil_slice,omitempty"`
		ZeroInt    int            `json:"zero_int,omitempty"`
		NilAny     any            `json:"nil_any,omitempty"`
		AlwaysSent string         `json:"always_sent"`
	}
	got := marshalThroughTransport(t, payload{Kept: "yes"})

	if _, ok := got["kept"]; !ok {
		t.Error("non-empty omitempty field must be sent")
	}
	if _, ok := got["always_sent"]; !ok {
		t.Error("field without omitempty must be sent even when empty")
	}
	for _, k := range []string{"empty_str", "nil_map", "nil_slice", "zero_int", "nil_any"} {
		if v, ok := got[k]; ok {
			t.Errorf("empty omitempty field %q must not be sent, got %#v", k, v)
		}
	}
}

// TestTraceUpdatePayloadOmitsTraceID is the direct regression for the bug:
// the PATCH body that closes a trace must carry only the closing fields.
func TestTraceUpdatePayloadOmitsTraceID(t *testing.T) {
	ts := isoTimestamp()
	body := httpTracePayload{
		Status:         TraceStatusSuccess,
		UpdatedAt:      ts,
		FinishedAt:     ts,
		LastActivityAt: ts,
	}
	got := marshalThroughTransport(t, body)

	if _, ok := got["trace_id"]; ok {
		t.Errorf(`PATCH body must not carry "trace_id" (empty string fails the service's uuid validation), got %#v`, got["trace_id"])
	}
	for _, k := range []string{"tags", "metadata", "source", "trace_type", "title", "created_at", "trace_timeout_ms"} {
		if _, ok := got[k]; ok {
			t.Errorf("PATCH body must not carry unset field %q, got %#v", k, got[k])
		}
	}
	for _, k := range []string{"status", "updated_at", "finished_at", "last_activity_at"} {
		if _, ok := got[k]; !ok {
			t.Errorf("PATCH body must carry %q", k)
		}
	}
	assertSameAsJSONMarshal(t, body)
}

// TestTraceCreatePayloadOmitsNilMetadata covers the trace types that pass no
// Metadata (pull_content, *_poll_bookings, connection_action, rate_check):
// a null metadata is rejected by the service's z.record().optional() schema.
func TestTraceCreatePayloadOmitsNilMetadata(t *testing.T) {
	ts := isoTimestamp()
	body := httpTracePayload{
		TraceID:        "e1f1b9ba-0000-4000-8000-000000000001",
		TraceType:      "pull_content",
		Status:         TraceStatusPending,
		Source:         "cb-channel-dts-worker",
		CreatedAt:      ts,
		UpdatedAt:      ts,
		Title:          "Pull Content",
		Owner:          "data-sync",
		Tags:           []string{"pull-content", "airbnb"},
		Params:         map[string]any{"transactionId": "tx-1"},
		LastActivityAt: ts,
		IdempotencyKey: "tx-1",
		TraceTimeoutMs: 120000,
	}
	got := marshalThroughTransport(t, body)

	for _, k := range []string{"metadata", "result", "error", "started_at", "finished_at", "step_timeout_ms"} {
		if v, ok := got[k]; ok {
			t.Errorf("POST body must not carry unset field %q, got %#v", k, v)
		}
	}
	if got["trace_id"] != "e1f1b9ba-0000-4000-8000-000000000001" {
		t.Errorf("trace_id must survive, got %#v", got["trace_id"])
	}
	assertSameAsJSONMarshal(t, body)
}

// TestStepPayloadsOmitNilMetadata: steps are created without Metadata by every
// caller, and a null metadata is rejected the same way as on traces.
func TestStepPayloadsOmitNilMetadata(t *testing.T) {
	ts := isoTimestamp()

	create := marshalThroughTransport(t, httpStepPayload{
		TraceID:   "e1f1b9ba-0000-4000-8000-000000000001",
		StepID:    "e1f1b9ba-0000-4000-8000-000000000002",
		StepType:  "external_api",
		Name:      "pull_rates",
		Status:    StepStatusStarted,
		StartedAt: ts,
		UpdatedAt: ts,
		Input:     map[string]any{"portal": "airbnb"},
	})
	for _, k := range []string{"metadata", "output", "error", "finished_at", "step_number"} {
		if v, ok := create[k]; ok {
			t.Errorf("POST /steps must not carry unset field %q, got %#v", k, v)
		}
	}

	update := marshalThroughTransport(t, httpStepPayload{
		Status:     StepStatusCompleted,
		UpdatedAt:  ts,
		FinishedAt: ts,
		Output:     map[string]any{"completed": true},
	})
	if _, ok := update["trace_id"]; ok {
		t.Errorf(`PATCH /steps must not carry "trace_id", got %#v`, update["trace_id"])
	}
	for _, k := range []string{"metadata", "error", "name", "step_type", "started_at"} {
		if v, ok := update[k]; ok {
			t.Errorf("PATCH /steps must not carry unset field %q, got %#v", k, v)
		}
	}
}
