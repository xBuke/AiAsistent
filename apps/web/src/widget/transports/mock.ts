import type { ChatTransport, ChatSendInput } from './types';

export class MockTransport implements ChatTransport {
  async *sendMessage(input: ChatSendInput): AsyncGenerator<string, void, unknown> {
    const { message, signal } = input;
    
    // Simulate a response with token-by-token streaming
    const mockResponse = `OK, received: ${message}. This is a mock response that streams token by token.`;
    const tokens = mockResponse.split(' ');
    
    for (const token of tokens) {
      // Check if aborted
      if (signal?.aborted) {
        return;
      }
      
      // Yield token with space (except last)
      yield token + (token !== tokens[tokens.length - 1] ? ' ' : '');
      
      // Small delay to simulate streaming
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
