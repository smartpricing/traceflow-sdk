/**
 * Example: Initialize TraceFlow Client (Singleton Pattern)
 * 
 * This file shows how to initialize the TraceFlow client once
 * at application startup. The client can then be reused anywhere
 * in your application using TraceFlowClient.getInstance()
 */

import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

/**
 * Initialize the TraceFlow client at application startup
 * This is typically done in your main application file (app.ts, index.ts, etc.)
 */
export async function initializeTraceFlow() {
  console.log('🚀 Initializing TraceFlow client...');

  // Create and configure the client
  const client = new TraceFlowClient({
    brokers: ['localhost:9092'],
    topic: 'traceflow', // Optional, defaults to 'traceflow'
    
    // Redis for state persistence (handles pod restarts)
    redisUrl: 'redis://localhost:6379',
    
    // Optional: Enable automatic cleanup of inactive traces
    cleanerConfig: {
      enabled: true,
      inactivityTimeoutSeconds: 3600, // 1 hour
      cleanupIntervalSeconds: 300, // Check every 5 minutes
    },
  });

  // Connect to Kafka and Redis
  await client.connect();

  console.log('✅ TraceFlow client initialized and connected');

  return client;
}

/**
 * Cleanup function to gracefully shutdown
 * Call this when your application is shutting down
 */
export async function shutdownTraceFlow() {
  console.log('🛑 Shutting down TraceFlow client...');
  
  const client = TraceFlowClient.getInstance();
  if (client) {
    await client.disconnect();
    console.log('✅ TraceFlow client disconnected');
  }
}

