import { describe, it, expect } from '@playwright/test';
import { parseSSEChunk, flushSSEBuffer, createSSEParserState, type SSEParserState } from './sseParser';

describe('SSE Parser', () => {
  it('should parse single-line message event', () => {
    const state = createSSEParserState();
    const events = Array.from(parseSSEChunk('data: hello\n\n', state));
    
    expect(events).toEqual([
      { eventName: 'message', data: 'hello' },
    ]);
  });

  it('should parse meta event with retrieved_docs_top3', () => {
    const state = createSSEParserState();
    const stream = `event: meta
data: {"retrieved_docs_top3":[{"title":"Test","source":"test.txt","score":0.8}]}

`;
    const events = Array.from(parseSSEChunk(stream, state));
    
    expect(events).toEqual([
      {
        eventName: 'meta',
        data: '{"retrieved_docs_top3":[{"title":"Test","source":"test.txt","score":0.8}]}',
      },
    ]);
  });

  it('should parse multiline data correctly', () => {
    const state = createSSEParserState();
    const stream = `event: meta
data: {"retrieved_docs_top3":[
data: {"title":"Test","source":"test.txt"}
data: ]}

`;
    const events = Array.from(parseSSEChunk(stream, state));
    
    expect(events).toEqual([
      {
        eventName: 'meta',
        data: '{"retrieved_docs_top3":[\n{"title":"Test","source":"test.txt"}\n]}',
      },
    ]);
  });

  it('should handle CRLF line endings', () => {
    const state = createSSEParserState();
    const stream = `event: meta\r\ndata: {"test":1}\r\n\r\n`;
    const events = Array.from(parseSSEChunk(stream, state));
    
    expect(events).toEqual([
      { eventName: 'meta', data: '{"test":1}' },
    ]);
  });

  it('should handle message then meta event sequence', () => {
    const state = createSSEParserState();
    const stream = `event: message
data: Hello
data: world

event: meta
data: {"retrieved_docs_top3":[{"title":"Test"}]}

`;
    const events = Array.from(parseSSEChunk(stream, state));
    
    expect(events).toEqual([
      { eventName: 'message', data: 'Hello\nworld' },
      { eventName: 'meta', data: '{"retrieved_docs_top3":[{"title":"Test"}]}' },
    ]);
  });

  it('should ignore [DONE] payload', () => {
    const state = createSSEParserState();
    const stream = `data: [DONE]\n\n`;
    const events = Array.from(parseSSEChunk(stream, state));
    
    expect(events).toEqual([]);
  });

  it('should ignore [ERROR]* payloads', () => {
    const state = createSSEParserState();
    const stream = `data: [ERROR] Something went wrong\n\n`;
    const events = Array.from(parseSSEChunk(stream, state));
    
    expect(events).toEqual([]);
  });

  it('should handle real-world stream format', () => {
    const state = createSSEParserState();
    const stream = `event: message
data: Kako
data:  mi
data:  možeš

event: meta
data: {"retrieved_docs_top3":[{"title":"12_ai_system_capabilities","source":"12_ai_system_capabilities.txt","score":0.85}],"model":"llama-3.1-8b-instant","latency_ms":1234}
data: [DONE]

`;
    const events = Array.from(parseSSEChunk(stream, state));
    
    expect(events).toEqual([
      { eventName: 'message', data: 'Kako\n mi\n možeš' },
      {
        eventName: 'meta',
        data: '{"retrieved_docs_top3":[{"title":"12_ai_system_capabilities","source":"12_ai_system_capabilities.txt","score":0.85}],"model":"llama-3.1-8b-instant","latency_ms":1234}',
      },
    ]);
  });

  it('should handle chunked input', () => {
    const state = createSSEParserState();
    const chunk1 = `event: meta
data: {"retrieved_docs_top3":[`;
    const chunk2 = `{"title":"Test"}]
}

`;
    
    const events1 = Array.from(parseSSEChunk(chunk1, state));
    const events2 = Array.from(parseSSEChunk(chunk2, state));
    
    expect(events1).toEqual([]);
    expect(events2).toEqual([
      { eventName: 'meta', data: '{"retrieved_docs_top3":[\n{"title":"Test"}]\n}' },
    ]);
  });

  it('should flush remaining buffer correctly', () => {
    const state = createSSEParserState();
    parseSSEChunk('event: meta\ndata: {"test":1}', state);
    
    const events = Array.from(flushSSEBuffer(state));
    
    expect(events).toEqual([
      { eventName: 'meta', data: '{"test":1}' },
    ]);
  });

  it('should handle empty data lines', () => {
    const state = createSSEParserState();
    const stream = `event: meta
data: 
data: {"test":1}

`;
    const events = Array.from(parseSSEChunk(stream, state));
    
    expect(events).toEqual([
      { eventName: 'meta', data: '\n{"test":1}' },
    ]);
  });
});
