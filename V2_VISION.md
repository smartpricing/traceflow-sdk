# TraceFlow SDK v2 - Vision & Roadmap

**Current Version:** v1.x (Kafka-only)  
**Proposed Version:** v2.x (Hybrid: Kafka + API)  
**Status:** 💡 Idea / Planning Phase  
**Estimated Effort:** 3-4 weeks development

---

## 🎯 Executive Summary

**Current Architecture:** SDK writes directly to Kafka  
**Proposed Architecture:** SDK supports both Kafka (direct) and HTTP API modes

**Why?**
- Expand addressable market (SMBs without Kafka infrastructure)
- Easier onboarding and adoption
- SaaS-friendly offering
- Maintain enterprise performance with Kafka mode

---

## 📊 Market Analysis

### Current Architecture (Kafka-only)

**✅ Strengths:**
- **Performance**: Zero latency, direct writes to Kafka
- **Scalability**: Horizontal scaling native with Kafka partitioning
- **Decoupling**: Services can trace even if traceflow-service is down
- **Kafka semantics**: At-least-once delivery, replay, retention policies
- **No bottleneck**: No single point of failure
- **Cost-effective**: No double hop (client → API → Kafka)

**❌ Limitations:**
- **Barrier to entry**: Requires Kafka infrastructure and expertise
- **Security complexity**: SASL/SSL credential management per client
- **Network requirements**: Direct Kafka access needed
- **Onboarding friction**: Longer setup time for new customers

**Target Market:**
- ✅ Enterprise customers with existing Kafka
- ✅ High-volume use cases (millions of events/day)
- ✅ Performance-critical applications (< 5ms latency)
- ✅ Self-hosted / on-premise deployments

### Proposed API Mode

**✅ Strengths:**
- **Zero infrastructure**: Only HTTP endpoint needed
- **Simple onboarding**: API key + URL, done in 5 minutes
- **Centralized control**: Rate limiting, auth, validation in one place
- **Schema flexibility**: Change backend without SDK updates
- **Multi-tenancy**: Easier isolation and resource management
- **SaaS-ready**: Perfect for managed/cloud offerings

**❌ Trade-offs:**
- **Latency**: Additional hop (client → API → Kafka)
- **Potential bottleneck**: API service needs horizontal scaling
- **Operational complexity**: API fleet management, load balancing
- **Cost**: Additional infrastructure (API servers)
- **Throughput limits**: May need careful capacity planning

**Target Market:**
- ✅ SMB customers without Kafka
- ✅ Rapid prototyping and MVPs
- ✅ SaaS/managed service customers
- ✅ Developer teams with limited infrastructure budget

---

## 🏗️ Proposed Architecture v2

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                    CUSTOMER SERVICES                         │
│                                                              │
│  ┌──────────────────┐              ┌──────────────────┐    │
│  │   Small/Medium   │              │    Enterprise    │    │
│  │   (API mode)     │              │   (Kafka mode)   │    │
│  └────────┬─────────┘              └─────────┬────────┘    │
│           │                                   │              │
└───────────┼───────────────────────────────────┼──────────────┘
            │                                   │
            ↓                                   ↓
    ┌───────────────┐                  ┌────────────────┐
    │  TraceFlow    │                  │  Kafka Cluster │
    │  API Gateway  │                  │  (Customer or  │
    │  + Load Bal.  │                  │   Managed)     │
    └───────┬───────┘                  └────────┬───────┘
            │                                   │
            └──────────────┬────────────────────┘
                           ↓
                  ┌─────────────────┐
                  │  Kafka (Backend)│
                  │  Unified Stream │
                  └────────┬────────┘
                           ↓
                  ┌─────────────────┐
                  │  TraceFlow      │
                  │  Consumer       │
                  │  Service        │
                  └────────┬────────┘
                           ↓
                    ┌─────────────┐
                    │  ScyllaDB   │
                    └─────────────┘
```

### SDK Usage Examples

#### Current (v1): Kafka Only

```typescript
import { initializeTraceFlow } from 'traceflow-sdk';

const client = initializeTraceFlow({
  brokers: ['kafka-1:9092', 'kafka-2:9092'],
  clientId: 'my-service',
  sasl: {
    mechanism: 'scram-sha-256',
    username: 'user',
    password: 'pass',
  },
}, 'my-service');

await client.connect();
const trace = await client.trace({ ... });
```

#### Proposed (v2): Kafka Mode

```typescript
import { initializeTraceFlow } from 'traceflow-sdk';

// Explicit Kafka mode
const client = initializeTraceFlow({
  mode: 'kafka', // ← New
  brokers: ['kafka-1:9092', 'kafka-2:9092'],
  clientId: 'my-service',
  sasl: { ... },
}, 'my-service');

// Same API as v1
await client.connect();
const trace = await client.trace({ ... });
```

#### Proposed (v2): API Mode (NEW)

```typescript
import { initializeTraceFlow } from 'traceflow-sdk';

// HTTP API mode
const client = initializeTraceFlow({
  mode: 'api', // ← New
  apiUrl: 'https://traceflow.mycompany.com',
  apiKey: process.env.TRACEFLOW_API_KEY,
  // Optional batching config
  batching: {
    maxBatchSize: 100,
    maxWaitMs: 1000,
  },
}, 'my-service');

// Same API, different transport!
await client.connect();
const trace = await client.trace({ ... });
```

---

## 🛠️ Technical Implementation

### 1. Transport Layer Abstraction

```typescript
// src/transport/transport.interface.ts
export interface ITransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: TraceFlowMessage): Promise<void>;
  sendBatch(messages: TraceFlowMessage[]): Promise<void>;
}

// src/transport/kafka-transport.ts
export class KafkaTransport implements ITransport {
  // Current implementation
}

// src/transport/http-transport.ts (NEW)
export class HttpTransport implements ITransport {
  private apiUrl: string;
  private apiKey: string;
  private batch: TraceFlowMessage[] = [];
  private batchTimer?: NodeJS.Timeout;
  
  async send(message: TraceFlowMessage): Promise<void> {
    // Add to batch
    this.batch.push(message);
    
    // Send if batch full or timer expires
    if (this.batch.length >= this.maxBatchSize) {
      await this.flush();
    }
  }
  
  private async flush(): Promise<void> {
    const response = await fetch(`${this.apiUrl}/v1/events/batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events: this.batch }),
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    
    this.batch = [];
  }
}
```

### 2. Client Configuration

```typescript
// src/types.ts

export type TraceFlowTransportMode = 'kafka' | 'api';

export interface TraceFlowKafkaConfig {
  mode?: 'kafka'; // Default
  brokers: string[];
  clientId?: string;
  sasl?: { ... };
  ssl?: boolean;
  topic?: string;
  serviceUrl?: string;
  cleanerConfig?: TraceFlowCleanerConfig;
}

export interface TraceFlowApiConfig {
  mode: 'api';
  apiUrl: string;
  apiKey: string;
  batching?: {
    maxBatchSize?: number;
    maxWaitMs?: number;
  };
  serviceUrl?: string; // For state recovery
  cleanerConfig?: TraceFlowCleanerConfig;
}

export type TraceFlowConfig = 
  | TraceFlowKafkaConfig 
  | TraceFlowApiConfig 
  | TraceFlowKafkaInstanceConfig;
```

### 3. Client Implementation

```typescript
// src/client.ts

export class TraceFlowClient {
  private transport: ITransport;
  
  constructor(config: TraceFlowConfig, defaultSource?: string) {
    // Determine transport based on mode
    if ('mode' in config && config.mode === 'api') {
      this.transport = new HttpTransport(config);
    } else if (isKafkaConfig(config)) {
      this.transport = new KafkaTransport(config);
    } else {
      this.transport = new KafkaInstanceTransport(config);
    }
    
    // Rest of initialization...
  }
  
  private async sendMessage(
    type: 'job' | 'step' | 'log',
    data: TraceFlowKafkaJobMessage | ...
  ): Promise<void> {
    const message = { type, data };
    await this.transport.send(message); // Transport-agnostic!
  }
}
```

### 4. API Gateway (NEW Service)

```typescript
// traceflow-api-gateway/src/index.ts

import express from 'express';
import { KafkaJS } from '@confluentinc/kafka-javascript';

const app = express();
const kafka = new KafkaJS.Kafka({ ... });
const producer = kafka.producer();

// Batch endpoint
app.post('/v1/events/batch', authenticate, async (req, res) => {
  const { events } = req.body;
  
  // Validate
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'Invalid batch' });
  }
  
  // Rate limiting check
  const allowed = await rateLimiter.check(req.apiKey, events.length);
  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  
  // Send to Kafka
  await producer.send({
    topic: 'traceflow',
    messages: events.map(event => ({
      key: event.data.job_id,
      value: JSON.stringify(event),
    })),
  });
  
  res.json({ success: true, accepted: events.length });
});

app.listen(3001, () => {
  console.log('TraceFlow API Gateway running on :3001');
});
```

---

## 💰 Business Model & Pricing Strategy

### Tiered Offering

```
┌─────────────────────────────────────────────────────────────┐
│                    TRACEFLOW PRICING                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🆓 DEVELOPER (Free)                                        │
│     - Mode: API only                                         │
│     - 10,000 events/month                                    │
│     - 7 days retention                                       │
│     - Community support                                      │
│     Use case: Learning, prototyping, small projects         │
│                                                              │
│  💼 PROFESSIONAL ($99/month)                                │
│     - Mode: API or Kafka                                     │
│     - 1M events/month                                        │
│     - 30 days retention                                      │
│     - Email support (24h response)                           │
│     - Basic analytics dashboard                              │
│     Use case: Production apps, medium scale                  │
│                                                              │
│  🏢 BUSINESS ($499/month)                                   │
│     - Mode: API or Kafka                                     │
│     - 10M events/month                                       │
│     - 90 days retention                                      │
│     - Priority support (4h response)                         │
│     - Advanced analytics + alerts                            │
│     - Multi-region support                                   │
│     Use case: High-scale production, multiple services       │
│                                                              │
│  🚀 ENTERPRISE (Custom)                                     │
│     - Mode: Kafka (managed or self-hosted)                   │
│     - Unlimited events                                       │
│     - Custom retention (1+ years)                            │
│     - Dedicated support + SLA                                │
│     - On-premise deployment option                           │
│     - Custom integrations                                    │
│     - SOC 2 / HIPAA compliance                               │
│     Use case: Enterprise deployments, compliance needs       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Upgrade Path

```
Developer → Professional → Business → Enterprise
   ↓              ↓            ↓            ↓
API only     API/Kafka    API/Kafka   Kafka (dedicated)
```

**Key Insight:** Start customers on API mode (easy), upsell to Kafka mode as they scale (performance + cost-effective at high volume).

---

## 📈 Market Expansion Opportunity

### Addressable Market Comparison

**Current (Kafka-only):**
- Enterprise with Kafka: ~20% of market
- Typical deal size: $10K-100K/year
- Long sales cycle: 3-6 months
- High technical barrier

**With API Mode:**
- Enterprise + SMB + Startups: ~80% of market
- Typical deal size: $1K-100K/year (wider range)
- Short sales cycle: Days to weeks
- Low technical barrier

**Estimated Impact:**
- **4x increase** in addressable market
- **10x faster** onboarding
- **Lower CAC** (customer acquisition cost)
- **Land-and-expand** strategy enabled

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (2-3 weeks)

**Week 1-2: Transport Abstraction**
- [ ] Create `ITransport` interface
- [ ] Refactor `KafkaTransport` from existing code
- [ ] Implement `HttpTransport` with batching
- [ ] Unit tests for both transports

**Week 3: API Gateway**
- [ ] Basic Express.js API
- [ ] Authentication middleware (API keys)
- [ ] Batch endpoint `/v1/events/batch`
- [ ] Forward to Kafka

### Phase 2: Production Features (2-3 weeks)

**Week 4: API Gateway Hardening**
- [ ] Rate limiting (by API key)
- [ ] Request validation
- [ ] Error handling & retries
- [ ] Monitoring & metrics

**Week 5: SDK Updates**
- [ ] Update types for `mode` config
- [ ] Implement mode detection
- [ ] Batching configuration
- [ ] Retry logic for HTTP failures

**Week 6: Testing & Docs**
- [ ] Integration tests (both modes)
- [ ] Performance benchmarks
- [ ] Update documentation
- [ ] Migration guide (v1 → v2)

### Phase 3: Scale & Polish (1-2 weeks)

**Week 7: Scaling**
- [ ] API Gateway horizontal scaling
- [ ] Load balancing setup
- [ ] Multi-region support
- [ ] Kubernetes deployment configs

**Week 8: Launch**
- [ ] Beta program with select customers
- [ ] Monitor performance & feedback
- [ ] Fix issues
- [ ] General availability

---

## ⚠️ Risks & Mitigations

### Risk 1: API Gateway becomes bottleneck
**Mitigation:**
- Implement efficient batching (reduce requests)
- Horizontal scaling from day 1
- Monitor latency & throughput continuously
- Circuit breaker if Kafka is slow

### Risk 2: Increased operational complexity
**Mitigation:**
- Use managed Kubernetes (EKS, GKE)
- Implement comprehensive monitoring (Prometheus, Grafana)
- Auto-scaling policies
- Runbooks for common issues

### Risk 3: Cost of running API fleet
**Mitigation:**
- Price API mode higher than self-hosted Kafka
- Optimize batching to reduce Kafka writes
- Use spot instances where possible
- Encourage high-volume customers to use Kafka mode

### Risk 4: Breaking changes for v1 users
**Mitigation:**
- Maintain backward compatibility
- Default to Kafka mode if no `mode` specified
- Provide clear migration path
- Support v1 for at least 12 months

---

## 🎯 Success Metrics

### Technical KPIs
- **API Latency**: p95 < 100ms, p99 < 200ms
- **API Availability**: 99.9% uptime
- **Throughput**: 10K requests/sec per API instance
- **Error Rate**: < 0.1%

### Business KPIs
- **Adoption**: 40% of new customers choose API mode
- **Conversion**: 20% upgrade from Developer to Professional
- **Retention**: 90% annual retention
- **NPS**: Net Promoter Score > 50

### Market KPIs
- **Customer Growth**: 3x increase in 12 months
- **Revenue Growth**: 2x increase in 12 months
- **Time to First Value**: < 30 minutes (vs 2+ hours for Kafka)
- **Sales Cycle**: Reduce from 3 months to 2 weeks (for SMB)

---

## 🔍 Competitive Analysis

### Similar Products

| Product | Architecture | Target Market |
|---------|-------------|---------------|
| **Datadog APM** | SDK → Agent → API | Enterprise + SMB |
| **New Relic** | SDK → API | All segments |
| **Sentry** | SDK → API | Developers + SMB |
| **Elastic APM** | SDK → API | Self-hosted + Cloud |
| **Honeycomb** | SDK → API | Modern engineering teams |

**Our Differentiation:**
- ✅ Hybrid: Kafka + API (unique!)
- ✅ Choose performance OR simplicity
- ✅ No vendor lock-in (can switch modes)
- ✅ Cheaper for high-volume (Kafka mode)

---

## 💡 Future Enhancements (v3+)

### Beyond v2

1. **WebSocket Mode**: Real-time streaming for dashboards
2. **gRPC Mode**: Lower latency than HTTP for high-performance needs
3. **Browser SDK**: JavaScript tracing for frontend apps
4. **Mobile SDKs**: iOS/Android native support
5. **OpenTelemetry Integration**: Standard protocol support
6. **AI-Powered Insights**: Anomaly detection, root cause analysis

---

## 📝 Decision Log

**Date:** 2025-10-25  
**Decision:** Document v2 vision, defer implementation  
**Rationale:** Current v1 (Kafka-only) works well for initial target market (enterprise). v2 (hybrid) would expand market but requires significant investment. Document now, decide later.

**Next Steps:**
1. Validate market demand (customer interviews)
2. Estimate development cost
3. Project revenue impact
4. Make go/no-go decision

---

## 📚 References

- Current SDK: v1.0.4 (Kafka-only)
- Architecture: `README.md`, `SERVICE_INTEGRATION.md`
- Similar products: Datadog, New Relic, Sentry
- Kafka best practices: Confluent documentation

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-25  
**Author:** TraceFlow Team  
**Status:** 📋 Planning Phase


