import { describe, expect, it, vi } from 'vitest';
import { AuditClient, AuditDeliveryError, auditDiff } from '../audit';

describe('audit', () => {
  const input = { action: 'updated', subject: { type: 'custom', id: '12345' }, changes: auditDiff({ status: 'draft', note: null }, { status: 'sent', total: '420.00' }) };
  it('preserves null, absent values, arrays, false and zero, ignoring object key order', () => {
    expect(auditDiff({ absent: null, value: 0, config: { b: false, a: [1] } }, { added: null, value: false, config: { a: [1], b: false } })).toEqual({ mode: 'delta', before: { absent: null, value: 0 }, after: { added: null, value: false } });
    expect(() => auditDiff({ a: undefined as never }, {})).toThrow(/lossless/);
    expect(() => auditDiff({ a: Number.MAX_SAFE_INTEGER + 1 }, {})).toThrow(/lossless/);
  });
  it('retries the same immutable envelope and waits for persisted receipts', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new AuditClient({ source: 'test', endpoint: 'http://localhost', apiKey: 'test', fetch: fetcher, retryDelay: 0 });
    const event = client.createEvent(input);
    fetcher.mockImplementationOnce(async () => { event.metadata = { changed: true }; return new Response('', { status: 503 }); });
    fetcher.mockResolvedValueOnce(Response.json({ status: 'persisted', event_id: event.event_id, duplicate: true }));
    const receipt = await client.record(event);
    expect(receipt.status).toBe('persisted');
    expect(fetcher.mock.calls[0]?.[1]?.body).toEqual(fetcher.mock.calls[1]?.[1]?.body);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string).metadata).toBeUndefined();
  });
  it('does not retry conflicts or silently acknowledge disabled audit', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 409 }));
    const client = new AuditClient({ source: 'test', endpoint: 'http://localhost', apiKey: 'key', fetch: fetcher });
    await expect(client.recordAudit(input)).rejects.toMatchObject({ statusCode: 409, retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(new AuditClient({ source: 'test', enabled: false }).recordAudit(input)).rejects.toBeInstanceOf(AuditDeliveryError);
  });
  it('reports the stable event ID when the delivery outcome is unknown', async () => {
    const client = new AuditClient({ source: 'test', endpoint: 'http://localhost', apiKey: 'key', maxRetries: 0, fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout')) });
    const event = client.createEvent(input);
    await expect(client.record(event)).rejects.toMatchObject({ eventId: event.event_id, retryable: true });
  });
});
