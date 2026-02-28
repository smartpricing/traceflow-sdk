/**
 * Example: Microservice with Express and TraceFlow
 * 
 * This example shows how to integrate TraceFlow SDK in a real-world
 * microservice environment with HTTP API and automatic context propagation.
 */

import { TraceFlowSDK } from '../src';

// Simulate Express types
interface Request {
  headers: Record<string, string | undefined>;
  method: string;
  path: string;
  body?: any;
}

interface Response {
  status(code: number): Response;
  json(data: any): Response;
  headers: Record<string, string>;
}

// ============================================================================
// Initialize SDK (singleton pattern)
// ============================================================================

const traceflow = new TraceFlowSDK({
  transport: process.env.TRACE_TRANSPORT === 'kafka' ? 'kafka' : 'http',
  source: process.env.SERVICE_NAME || 'api-service',
  
  // HTTP config
  endpoint: process.env.TRACEFLOW_ENDPOINT || 'http://localhost:3009',
  apiKey: process.env.TRACEFLOW_API_KEY,
  
  // Kafka config
  kafka: process.env.TRACE_TRANSPORT === 'kafka' ? {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.SERVICE_NAME || 'api-service',
    sasl: process.env.KAFKA_USERNAME ? {
      mechanism: 'plain',
      username: process.env.KAFKA_USERNAME,
      password: process.env.KAFKA_PASSWORD!,
    } : undefined,
  } : undefined,
  
  // Production settings
  autoFlushOnExit: true,
  silentErrors: true, // Never fail requests due to tracing
  enableCircuitBreaker: true,
});

console.log('✅ TraceFlow SDK initialized');

// ============================================================================
// Middleware: Trace incoming requests
// ============================================================================

async function traceMiddleware(
  req: Request,
  res: Response,
  next: () => void
) {
  // Extract parent trace from headers (distributed tracing)
  const parentTraceId = req.headers['x-trace-id'] as string | undefined;

  // Start trace for this request
  const trace = await traceflow.startTrace({
    trace_type: 'http_request',
    title: `${req.method} ${req.path}`,
    parent_trace_id: parentTraceId,
    metadata: {
      method: req.method,
      path: req.path,
      headers: req.headers,
    },
  });

  // Add trace ID to response headers (for distributed tracing)
  res.headers['x-trace-id'] = trace.trace_id;

  // Store trace in request for later use
  (req as any).trace = trace;

  console.log(`📌 Request traced: ${trace.trace_id}`);

  // Continue with request
  next();

  // Note: In real Express, you'd finish the trace in a response handler
}

// ============================================================================
// Service Layer: Business logic with tracing
// ============================================================================

class UserService {
  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<any> {
    // Context is automatically available from middleware
    const step = await traceflow.startStep({
      name: 'Get User',
      step_type: 'service_call',
      input: { userId },
    });

    try {
      // Simulate database query
      await traceflow.log(`Querying database for user ${userId}`);
      await new Promise(resolve => setTimeout(resolve, 50));

      const user = {
        id: userId,
        name: 'John Doe',
        email: 'john@example.com',
      };

      await step.finish({ output: user });
      return user;
    } catch (error: any) {
      await step.fail(error);
      throw error;
    }
  }

  /**
   * Create user
   */
  async createUser(userData: any): Promise<any> {
    const step = await traceflow.startStep({
      name: 'Create User',
      step_type: 'service_call',
      input: userData,
    });

    try {
      // Validation step
      await traceflow.log('Validating user data');
      if (!userData.email) {
        throw new Error('Email is required');
      }

      // Database insert
      await traceflow.log('Inserting user into database');
      await new Promise(resolve => setTimeout(resolve, 100));

      const user = {
        id: `user_${Date.now()}`,
        ...userData,
      };

      // Send notification (nested operation)
      await this.sendWelcomeEmail(user.email);

      await step.finish({ output: user });
      return user;
    } catch (error: any) {
      await step.fail(error);
      throw error;
    }
  }

  /**
   * Send welcome email (private method, also traced)
   */
  private async sendWelcomeEmail(email: string): Promise<void> {
    const step = await traceflow.startStep({
      name: 'Send Welcome Email',
      step_type: 'notification',
      input: { email },
    });

    try {
      await traceflow.log(`Sending email to ${email}`);
      await new Promise(resolve => setTimeout(resolve, 200));
      await step.finish({ output: { sent: true } });
    } catch (error: any) {
      await step.fail(error);
      // Don't throw - email failure shouldn't fail user creation
    }
  }
}

// ============================================================================
// External API Client: Propagate trace context
// ============================================================================

class ExternalAPIClient {
  /**
   * Call external service with trace context
   */
  async callExternalService(data: any): Promise<any> {
    const step = await traceflow.startStep({
      name: 'Call External API',
      step_type: 'external_api',
      input: data,
    });

    try {
      // Get current trace ID for propagation
      const context = traceflow.getCurrentContext();

      await traceflow.log('Sending request to external API');

      // Simulate HTTP request with trace propagation
      const response = await this.httpRequest({
        url: 'https://api.example.com/endpoint',
        headers: {
          'X-Trace-Id': context?.trace_id,
          'Content-Type': 'application/json',
        },
        body: data,
      });

      await step.finish({ output: response });
      return response;
    } catch (error: any) {
      await step.fail(error);
      throw error;
    }
  }

  private async httpRequest(config: any): Promise<any> {
    // Simulate HTTP request
    await new Promise(resolve => setTimeout(resolve, 150));
    return { status: 'success', data: {} };
  }
}

// ============================================================================
// Controller: API Endpoints
// ============================================================================

class UserController {
  private userService = new UserService();
  private externalAPI = new ExternalAPIClient();

  /**
   * GET /users/:id
   */
  async getUser(req: Request, res: Response): Promise<void> {
    const trace = (req as any).trace;

    try {
      const userId = 'user_123'; // From req.params.id

      // Service call (automatically uses trace context)
      const user = await this.userService.getUser(userId);

      // Finish trace successfully
      await trace.finish({ result: user });

      res.status(200).json(user);
    } catch (error: any) {
      // Fail trace on error
      await trace.fail(error);

      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /users
   */
  async createUser(req: Request, res: Response): Promise<void> {
    const trace = (req as any).trace;

    try {
      const userData = req.body;

      // Multiple service calls with automatic context
      const user = await this.userService.createUser(userData);

      // Enrich user data from external API
      await this.externalAPI.callExternalService({ userId: user.id });

      // Finish trace successfully
      await trace.finish({ result: user });

      res.status(201).json(user);
    } catch (error: any) {
      // Fail trace on error
      await trace.fail(error);

      res.status(500).json({ error: error.message });
    }
  }
}

// ============================================================================
// Simulate API requests
// ============================================================================

async function simulateAPIRequests() {
  const controller = new UserController();

  console.log('\n📝 Simulating API requests...\n');

  // ========================================================================
  // Request 1: GET /users/:id
  // ========================================================================
  console.log('🌐 Request 1: GET /users/123');

  const req1: Request = {
    method: 'GET',
    path: '/users/123',
    headers: {},
  };

  const res1: Response = {
    status: (code: number) => res1,
    json: (data: any) => {
      console.log(`📤 Response: ${JSON.stringify(data)}\n`);
      return res1;
    },
    headers: {},
  };

  await traceMiddleware(req1, res1, () => {});
  await controller.getUser(req1, res1);

  // ========================================================================
  // Request 2: POST /users (with error)
  // ========================================================================
  console.log('🌐 Request 2: POST /users');

  const req2: Request = {
    method: 'POST',
    path: '/users',
    headers: {},
    body: { name: 'Jane Doe', email: 'jane@example.com' },
  };

  const res2: Response = {
    status: (code: number) => res2,
    json: (data: any) => {
      console.log(`📤 Response: ${JSON.stringify(data)}\n`);
      return res2;
    },
    headers: {},
  };

  await traceMiddleware(req2, res2, () => {});
  await controller.createUser(req2, res2);

  // ========================================================================
  // Request 3: Distributed trace (with parent)
  // ========================================================================
  console.log('🌐 Request 3: Distributed trace');

  const req3: Request = {
    method: 'GET',
    path: '/users/456',
    headers: {
      'x-trace-id': 'parent-trace-123', // From upstream service
    },
  };

  const res3: Response = {
    status: (code: number) => res3,
    json: (data: any) => {
      console.log(`📤 Response: ${JSON.stringify(data)}\n`);
      return res3;
    },
    headers: {},
  };

  await traceMiddleware(req3, res3, () => {});
  await controller.getUser(req3, res3);
}

// ============================================================================
// Run Example
// ============================================================================

async function main() {
  console.log('🚀 Microservice Example with TraceFlow SDK');
  console.log(`   Transport: ${process.env.TRACE_TRANSPORT || 'http'}`);
  console.log(`   Source: ${process.env.SERVICE_NAME || 'api-service'}`);

  await simulateAPIRequests();

  console.log('🧹 Shutting down...');
  await traceflow.shutdown();
  console.log('✅ Example complete');
}

main().catch(console.error);

