/**
 * Example: Hybrid Pattern - Context + Manual Access
 * 
 * This example shows how to use both context-based and manual trace access
 * in a real HTTP API scenario.
 */

import { TraceFlowSDK } from '../src';

// ============================================================================
// Initialize SDK (singleton)
// ============================================================================

const sdk = new TraceFlowSDK({
  transport: 'http',
  source: 'api-service',
  endpoint: 'http://localhost:3009',
  silentErrors: true, // Production-safe
});

console.log('🚀 TraceFlow SDK initialized\n');

// ============================================================================
// Pattern 1: Context-Based (Automatic)
// ============================================================================

async function patternContextBased() {
  console.log('📝 Pattern 1: Context-Based (Automatic)\n');

  await sdk.runWithTrace(
    {
      trace_id: 'api-request-123', // Custom ID
      trace_type: 'http_request',
      title: 'GET /users/123',
    },
    async () => {
      console.log('✅ Inside trace context');

      // Access trace from context (no need to pass around)
      const trace = sdk.getCurrentTrace();
      if (trace) {
        await trace.log('Processing request...');
      }

      // Deep in your code, still has access
      await processUserRequest();

      // Nested function also has access
      async function processUserRequest() {
        const step = await sdk.startStep({
          name: 'Validate User',
          input: { userId: 123 },
        });

        await step.log('Checking permissions');
        await step.finish({ output: { valid: true } });

        // Call another service
        await callExternalService();
      }

      async function callExternalService() {
        const step = await sdk.startStep({
          name: 'Call External API',
        });

        await step.log('Sending request');
        await step.finish({ output: { status: 'ok' } });
      }

      return { success: true };
    }
  );

  console.log('✅ Pattern 1 complete\n');
}

// ============================================================================
// Pattern 2: Manual Access (Explicit)
// ============================================================================

async function patternManualAccess() {
  console.log('📝 Pattern 2: Manual Access (Explicit)\n');

  // 1. Start trace with custom ID
  const traceId = 'manual-trace-456';
  await sdk.startTrace({
    trace_id: traceId,
    trace_type: 'background_job',
    title: 'Data Processing Job',
  });

  console.log(`✅ Trace started: ${traceId}`);

  // 2. Later, in a different part of your code...
  //    Retrieve the trace by ID (makes HTTP call to get state)
  const trace = await sdk.getTrace(traceId);

  await trace.log('Job running...');

  // 3. Start steps
  const step1 = await trace.startStep({
    name: 'Load Data',
  });

  await step1.finish({ output: { records: 1000 } });

  // 4. Another part of code, get trace again
  const sameTrace = await sdk.getTrace(traceId);
  
  const step2 = await sameTrace.startStep({
    name: 'Transform Data',
  });

  await step2.finish({ output: { transformed: 1000 } });

  // 5. Finish trace
  await trace.finish({ result: { processed: 1000 } });

  console.log('✅ Pattern 2 complete\n');
}

// ============================================================================
// Pattern 3: Hybrid - HTTP Middleware + Service Layer
// ============================================================================

// Simulate Express types
interface Request {
  headers: Record<string, string | undefined>;
  method: string;
  path: string;
  traceId?: string;
}

interface Response {
  status(code: number): Response;
  json(data: any): Response;
  setHeader(name: string, value: string): void;
}

// Middleware: Create or continue trace
async function traceMiddleware(
  req: Request,
  res: Response,
  next: () => void
) {
  // Get trace ID from header or generate new
  const traceId = req.headers['x-trace-id'] || `request-${Date.now()}`;

  // Check if trace already exists (distributed tracing)
  if (req.headers['x-trace-id']) {
    console.log(`📌 Continuing existing trace: ${traceId}`);
    
    // Retrieve existing trace (HTTP call to service)
    const trace = await sdk.getTrace(traceId);
    
    // Update context
    sdk['contextManager'].updateContext({ trace_id: traceId });
  } else {
    console.log(`📌 Starting new trace: ${traceId}`);
    
    // Start new trace
    await sdk.startTrace({
      trace_id: traceId,
      trace_type: 'http_request',
      title: `${req.method} ${req.path}`,
    });
  }

  // Propagate trace ID
  res.setHeader('x-trace-id', traceId);
  req.traceId = traceId;

  next();
}

// Controller: Use context OR manual access
class UserController {
  async getUser(req: Request, res: Response) {
    console.log('\n🌐 Request: GET /users/123');

    try {
      // Option A: Use context (if runWithTrace was used)
      const traceFromContext = sdk.getCurrentTrace();
      
      // Option B: Use saved trace ID
      const trace = await sdk.getTrace(req.traceId!);

      // Start step
      const step = await trace.startStep({
        name: 'Fetch User from DB',
        input: { userId: 123 },
      });

      await step.log('Querying database...');

      // Simulate DB query
      await new Promise(resolve => setTimeout(resolve, 50));
      const user = { id: 123, name: 'John Doe' };

      await step.finish({ output: user });

      // Finish trace
      await trace.finish({ result: user });

      res.status(200).json(user);
      console.log('✅ Request completed successfully');
    } catch (error: any) {
      // Fail trace on error
      const trace = await sdk.getTrace(req.traceId!);
      await trace.fail(error);

      res.status(500).json({ error: error.message });
      console.log('❌ Request failed:', error.message);
    }
  }

  async createUser(req: Request, res: Response) {
    console.log('\n🌐 Request: POST /users');

    try {
      const trace = await sdk.getTrace(req.traceId!);

      // Multiple steps
      const validateStep = await trace.startStep({ name: 'Validate Input' });
      await validateStep.finish();

      const saveStep = await trace.startStep({ name: 'Save to DB' });
      await saveStep.finish();

      const notifyStep = await trace.startStep({ name: 'Send Notification' });
      await notifyStep.finish();

      await trace.finish({ result: { created: true } });

      res.status(201).json({ success: true });
      console.log('✅ User created successfully');
    } catch (error: any) {
      const trace = await sdk.getTrace(req.traceId!);
      await trace.fail(error);

      res.status(500).json({ error: error.message });
    }
  }
}

// Service Layer: Deep nesting, still has access
class DataService {
  async processData(traceId: string) {
    // Retrieve trace in service layer
    const trace = await sdk.getTrace(traceId);
    
    await trace.log('Service layer processing...');

    const step = await trace.startStep({
      name: 'Complex Processing',
    });

    // More nesting...
    await this.helperFunction(traceId);

    await step.finish();
  }

  private async helperFunction(traceId: string) {
    const trace = await sdk.getTrace(traceId);
    await trace.log('Helper function called');
  }
}

// ============================================================================
// Pattern 4: Long-Running Process with Heartbeat
// ============================================================================

async function patternLongRunning() {
  console.log('📝 Pattern 4: Long-Running Process with Heartbeat\n');

  const traceId = 'long-job-789';
  
  await sdk.startTrace({
    trace_id: traceId,
    trace_type: 'batch_job',
    title: 'Long-Running Batch Job',
  });

  console.log(`✅ Long-running job started: ${traceId}`);

  // Simulate long-running job
  for (let i = 0; i < 5; i++) {
    console.log(`⏳ Processing batch ${i + 1}/5...`);
    
    // Send heartbeat to prevent timeout (updates last_activity_at)
    await sdk.heartbeat(traceId);
    
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const trace = await sdk.getTrace(traceId);
  await trace.finish({ result: { batches: 5 } });

  console.log('✅ Long-running job complete\n');
}

// ============================================================================
// Simulate HTTP Requests
// ============================================================================

async function simulateHTTPRequests() {
  console.log('📝 Pattern 3: HTTP Middleware + Service\n');

  const controller = new UserController();

  // Request 1: GET /users/123
  const req1: Request = {
    method: 'GET',
    path: '/users/123',
    headers: {},
  };

  const res1: Response = {
    status: (code: number) => res1,
    json: (data: any) => res1,
    setHeader: (name: string, value: string) => {},
  };

  await traceMiddleware(req1, res1, () => {});
  await controller.getUser(req1, res1);

  // Request 2: POST /users (continue from upstream)
  const req2: Request = {
    method: 'POST',
    path: '/users',
    headers: {
      'x-trace-id': 'upstream-trace-999', // From another service
    },
  };

  const res2: Response = {
    status: (code: number) => res2,
    json: (data: any) => res2,
    setHeader: (name: string, value: string) => {},
  };

  await traceMiddleware(req2, res2, () => {});
  await controller.createUser(req2, res2);

  console.log('\n✅ Pattern 3 complete\n');
}

// ============================================================================
// Run All Examples
// ============================================================================

async function main() {
  console.log('🚀 Hybrid Pattern Examples\n');
  console.log('=' .repeat(60));

  await patternContextBased();
  await patternManualAccess();
  await simulateHTTPRequests();
  await patternLongRunning();

  console.log('=' .repeat(60));
  console.log('\n🧹 Shutting down...');
  await sdk.shutdown();
  console.log('✅ All examples complete!');
}

main().catch(console.error);

