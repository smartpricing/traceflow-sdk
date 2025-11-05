/**
 * Example: Using TraceFlow in Service A
 * 
 * This file shows how to reuse the TraceFlow client that was
 * initialized in another part of the application.
 * 
 * No need to pass the client instance around - just call getInstance()!
 */

import { TraceFlowClient } from '@dev.smartpricing/traceflow-sdk';

/**
 * Example service that processes user registrations
 */
export class UserService {
  async registerUser(email: string, password: string) {
    console.log(`📝 UserService: Registering user ${email}`);

    // Get the singleton instance - no initialization needed!
    const client = TraceFlowClient.getInstance();

    // Create a trace for this operation
    const trace = client.trace({
      trace_type: 'user_registration',
      title: `Register user: ${email}`,
      metadata: { email },
    });

    try {
      // Step 1: Validate input
      const step1 = await trace.step({
        name: 'Validate Input',
        input: { email, password: '***' },
      });
      
      await this.validateInput(email, password);
      await step1.complete({ output: { valid: true } });

      // Step 2: Check if user exists
      const step2 = await trace.step({
        name: 'Check User Exists',
      });
      
      const exists = await this.checkUserExists(email);
      if (exists) {
        await step2.fail({ error: 'User already exists' });
        await trace.fail({ error: 'User already exists' });
        throw new Error('User already exists');
      }
      await step2.complete({ output: { exists: false } });

      // Step 3: Hash password
      const step3 = await trace.step({
        name: 'Hash Password',
      });
      
      const hashedPassword = await this.hashPassword(password);
      await step3.complete({ output: { hashed: true } });

      // Step 4: Save to database
      const step4 = await trace.step({
        name: 'Save to Database',
      });
      
      const userId = await this.saveToDatabase(email, hashedPassword);
      await step4.complete({ output: { userId } });

      // Step 5: Send welcome email
      const step5 = await trace.step({
        name: 'Send Welcome Email',
      });
      
      await this.sendWelcomeEmail(email);
      await step5.complete();

      // Complete the trace
      await trace.complete({ result: { userId, email } });

      console.log(`✅ User registered successfully: ${userId}`);
      return userId;

    } catch (error: any) {
      await trace.fail({ error: error.message });
      throw error;
    }
  }

  private async validateInput(email: string, password: string): Promise<void> {
    // Simulate validation
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!email.includes('@')) {
      throw new Error('Invalid email');
    }
  }

  private async checkUserExists(email: string): Promise<boolean> {
    // Simulate database check
    await new Promise(resolve => setTimeout(resolve, 100));
    return false;
  }

  private async hashPassword(password: string): Promise<string> {
    // Simulate password hashing
    await new Promise(resolve => setTimeout(resolve, 100));
    return 'hashed_' + password;
  }

  private async saveToDatabase(email: string, hashedPassword: string): Promise<string> {
    // Simulate database save
    await new Promise(resolve => setTimeout(resolve, 100));
    return 'user_' + Date.now();
  }

  private async sendWelcomeEmail(email: string): Promise<void> {
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

