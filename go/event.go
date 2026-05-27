package traceflow

import "time"

// isoTimestamp formats the current time as a UTC ISO-8601 string with
// millisecond precision (e.g. 2024-01-02T03:04:05.678Z), matching the other
// TraceFlow SDKs.
func isoTimestamp() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z07:00")
}

// newTraceEvent constructs a TraceEvent. nil payload entries are dropped so the
// emitted payload only contains explicitly-set fields, matching the JS factory.
func newTraceEvent(eventType TraceEventType, traceID, source string, payload map[string]any, stepID string) TraceEvent {
	return TraceEvent{
		EventID:   newUUID(),
		EventType: eventType,
		TraceID:   traceID,
		StepID:    stepID,
		Timestamp: isoTimestamp(),
		Source:    source,
		Payload:   compact(payload),
	}
}

// compact removes nil values from a payload map, returning a non-nil map.
func compact(m map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		if v == nil {
			continue
		}
		out[k] = v
	}
	return out
}
