/**
 * Example: Using TraceFlow in Service B
 * 
 * Another service showing how to reuse the TraceFlow client.
 * This demonstrates resuming traces and getting existing steps.
 */

import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

/**
 * Example service that processes orders
 */
export class OrderService {
  /**
   * Process a new order
   */
  async processOrder(orderId: string, items: any[]) {
    console.log(`🛒 OrderService: Processing order ${orderId}`);

    // Get the singleton instance
    const client = TraceFlowClient.getInstance();

    // Create a trace
    const trace = client.trace({
      trace_type: 'order_processing',
      title: `Process order: ${orderId}`,
      metadata: { orderId, itemCount: items.length },
    });

    try {
      // Step 1: Validate order
      const step1 = await trace.step({
        name: 'Validate Order',
        input: { orderId, items },
      });
      
      const validationResult = await this.validateOrder(items);
      await step1.complete({ output: validationResult });

      // Step 2: Calculate total
      const step2 = await trace.step({
        name: 'Calculate Total',
      });
      
      const total = await this.calculateTotal(items);
      await step2.complete({ output: { total } });

      // Step 3: Process payment
      const step3 = await trace.step({
        name: 'Process Payment',
      });
      
      const paymentResult = await this.processPayment(orderId, total);
      await step3.complete({ output: paymentResult });

      // Step 4: Update inventory
      const step4 = await trace.step({
        name: 'Update Inventory',
      });
      
      await this.updateInventory(items);
      await step4.complete();

      // Complete
      await trace.complete({ result: { orderId, total, status: 'completed' } });

      console.log(`✅ Order processed successfully: ${orderId}`);
      return { orderId, total, status: 'completed' };

    } catch (error: any) {
      await trace.fail({ error: error.message });
      throw error;
    }
  }

  /**
   * Resume processing an order after pod restart
   * This demonstrates how to resume an existing trace
   */
  async resumeOrderProcessing(traceId: string) {
    console.log(`🔄 OrderService: Resuming order processing for trace ${traceId}`);

    // Get the singleton instance
    const client = TraceFlowClient.getInstance();

    // Get the existing trace
    const trace = client.getTrace(traceId);

    // Check if trace is still active
    const isActive = await trace.isActive();
    if (!isActive) {
      console.log(`⚠️ Trace ${traceId} is not active, cannot resume`);
      return;
    }

    try {
      // Continue with next step
      const step = await trace.step({
        name: 'Resume Processing',
        metadata: { resumed: true },
      });

      // Do some work...
      await new Promise(resolve => setTimeout(resolve, 1000));

      await step.complete({ output: { resumed: true } });
      await trace.complete({ result: { resumed: true } });

      console.log(`✅ Order processing resumed and completed: ${traceId}`);

    } catch (error: any) {
      await trace.fail({ error: error.message });
      throw error;
    }
  }

  /**
   * Get status of an order trace
   */
  async getOrderStatus(traceId: string) {
    console.log(`📊 OrderService: Getting status for trace ${traceId}`);

    // Get the singleton instance
    const client = TraceFlowClient.getInstance();

    // Get the trace
    const trace = client.getTrace(traceId);

    // Check if still active
    const isActive = await trace.isActive();

    return {
      traceId,
      isActive,
      message: isActive ? 'Order is being processed' : 'Order processing completed or failed',
    };
  }

  private async validateOrder(items: any[]): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return { valid: true, itemCount: items.length };
  }

  private async calculateTotal(items: any[]): Promise<number> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return items.reduce((sum, item) => sum + (item.price || 0), 0);
  }

  private async processPayment(orderId: string, total: number): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return { paymentId: 'pay_' + Date.now(), amount: total };
  }

  private async updateInventory(items: any[]): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

