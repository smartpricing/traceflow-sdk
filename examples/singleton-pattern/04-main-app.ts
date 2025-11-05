/**
 * Example: Main Application Entry Point
 * 
 * This file demonstrates a complete application flow:
 * 1. Initialize TraceFlow client once at startup
 * 2. Use it in multiple services without passing it around
 * 3. Gracefully shutdown on exit
 */

import { initializeTraceFlow, shutdownTraceFlow } from './01-initialize-client';
import { UserService } from './02-use-in-service-a';
import { OrderService } from './03-use-in-service-b';

/**
 * Main application
 */
async function main() {
  console.log('🚀 Starting application...\n');

  try {
    // Step 1: Initialize TraceFlow client once at startup
    await initializeTraceFlow();
    console.log('');

    // Step 2: Use services that internally use TraceFlow via getInstance()
    
    // Example 1: User Registration
    console.log('--- Example 1: User Registration ---');
    const userService = new UserService();
    const userId = await userService.registerUser('john@example.com', 'password123');
    console.log(`User created with ID: ${userId}\n`);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Example 2: Order Processing
    console.log('--- Example 2: Order Processing ---');
    const orderService = new OrderService();
    const orderResult = await orderService.processOrder('ORDER-001', [
      { id: 'item1', name: 'Product A', price: 29.99 },
      { id: 'item2', name: 'Product B', price: 49.99 },
    ]);
    console.log(`Order processed:`, orderResult);
    console.log('');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Example 3: Simulate pod restart - resume order processing
    console.log('--- Example 3: Resume Order After Pod Restart ---');
    // In real scenario, you would get this traceId from Redis or database
    const traceId = 'trace_' + Date.now();
    
    // First, create a trace that we'll "resume"
    const trace = orderService.processOrder('ORDER-002', [
      { id: 'item3', name: 'Product C', price: 19.99 },
    ]);
    
    // Simulate resuming (in real scenario, this would be after pod restart)
    // await orderService.resumeOrderProcessing(traceId);
    console.log('');

    // Example 4: Get order status
    console.log('--- Example 4: Get Order Status ---');
    // const status = await orderService.getOrderStatus(traceId);
    // console.log(`Order status:`, status);
    console.log('');

    console.log('✅ All operations completed successfully!\n');

  } catch (error: any) {
    console.error('❌ Error in main application:', error.message);
    throw error;

  } finally {
    // Step 3: Gracefully shutdown
    console.log('--- Shutdown ---');
    await shutdownTraceFlow();
    console.log('\n🏁 Application stopped');
  }
}

// Run the application
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };

