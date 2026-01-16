import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';
import { embed } from './embedding.js';

const app = express();
app.use(express.json());

// CORS configuration
const WEB_ORIGIN = process.env.WEB_ORIGIN;
const corsOptions = {
  origin: WEB_ORIGIN || true, // Allow all origins if WEB_ORIGIN not set
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-password'],
  credentials: false,
};

// Apply CORS middleware before routes
app.use(cors(corsOptions));

// Global OPTIONS handler to ensure preflight requests never 404
app.options('*', cors(corsOptions));

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_STREAMING = process.env.GROQ_STREAMING !== 'false'; // Defaults to true
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const MAX_DOC_CHARS = 2000;
const MAX_TOTAL_CONTEXT_CHARS = 6000;
const TOP_K = 3;

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

// Detect personal identifiers in user message
function hasPersonalIdentifiers(text: string): boolean {
  // OIB (11 digits)
  if (/\b\d{11}\b/.test(text)) return true;
  
  // Phone numbers (Croatian formats: +385, 00385, or local)
  if (/(\+385|00385|\b0\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}\b)/.test(text)) return true;
  
  // Email addresses
  if (/\b[\w.-]+@[\w.-]+\.\w+\b/.test(text)) return true;
  
  // Full addresses (contains street name + number pattern, or postal code)
  if (/(ulica|ul\.|street|st\.|adresa|address).*?\d+.*?(\d{5}|\b\d{4,5}\b)/i.test(text)) return true;
  if (/\b\d{5}\b/.test(text) && /(ulica|ul\.|street|st\.|adresa|address)/i.test(text)) return true;
  
  return false;
}

// Initialize Supabase client (server-side only, using service role key)
let supabase: ReturnType<typeof createClient> | null = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
} else {
  console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Message logging disabled.');
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/admin/messages', async (req, res) => {
  try {
    // Check admin password
    const providedPassword = req.headers['x-admin-password'];
    
    if (!ADMIN_PASSWORD) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    if (!providedPassword || providedPassword !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get limit from query params (default 50, max 100 for safety)
    const limitParam = req.query.limit as string;
    const limit = Math.min(Math.max(parseInt(limitParam) || 50, 1), 100);
    
    // Fetch messages from database
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    
    const { data: messages, error } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching messages:', error.message || 'Unknown error');
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }
    
    // Return empty array if no messages (no crashes)
    return res.json(messages || []);
  } catch (error: any) {
    // Never log passwords - only log error message
    console.error('Error in /admin/messages:', error?.message || 'Unknown error');
    // Ensure safe JSON response
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }
});

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid message' });
  }

  if (!groq) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Log user message to database (best effort, non-blocking)
  if (supabase) {
    try {
      const { error } = await supabase.from('messages').insert([{ role: 'user', content: message }]);
      if (error) console.warn('Supabase insert user message failed:', error.message);
    } catch (e) {
      console.warn('Supabase insert user message threw:', e);
    }
  }

  let fullReply = '';
  let firstTokenSent = false;

  try {
    // Embed user question and retrieve relevant documents
    let context = '';
    let retrievedCount = 0;
    
    if (supabase) {
      try {
        const questionEmbedding = await embed(message);
        
        // Log and verify embedding length
        const embeddingLength = questionEmbedding.length;
        console.log(`Embedding length: ${embeddingLength}`);
        if (embeddingLength !== 384) {
          throw new Error(`Expected embedding length 384, got ${embeddingLength}`);
        }
        
        // Retrieve top K documents by vector similarity (threshold disabled for debugging)
        const { data: documents, error: retrievalError } = await supabase.rpc('match_documents', {
          query_embedding: questionEmbedding,
          match_threshold: 0.0,
          match_count: TOP_K,
        });
        
        if (retrievalError) {
          console.error('Error retrieving documents:', retrievalError);
        } else if (documents) {
          retrievedCount = documents.length;
          console.log(`Retrieved ${retrievedCount} document(s)`);
          
          // Log each document title and similarity
          for (const doc of documents) {
            const similarity = doc.similarity ? doc.similarity.toFixed(2) : 'N/A';
            console.log(`  - ${doc.title || 'Untitled'}: similarity ${similarity}`);
          }
          
          // Build context from returned docs (always use if docs are returned)
          context = '';
          
          for (const doc of documents) {
            if (!doc.content) continue;
            
            const truncated = doc.content.length > MAX_DOC_CHARS
              ? doc.content.substring(0, MAX_DOC_CHARS)
              : doc.content;
            
            const title = doc.title || 'Untitled';
            const docSection = `SOURCE: ${title}\n${truncated}\n`;
            
            // Stop if adding this doc would exceed limit
            if (context.length + docSection.length > MAX_TOTAL_CONTEXT_CHARS) {
              break;
            }
            
            context += docSection;
          }
          
          console.log(`Final context length: ${context.length} characters`);
        }
      } catch (error) {
        console.error('Error retrieving documents:', error);
      }
    }
    
    // Check for personal identifiers
    const hasPersonalData = hasPersonalIdentifiers(message);
    const privacyWarning = hasPersonalData 
      ? '\nNAPOMENA O PRIVATNOSTI:\nMolimo vas da ne dijelite osobne podatke (OIB, puna adresa, telefon, email) u ovom sustavu. Nastavljamo s odgovorom bez ponavljanja osjetljivih podataka.\n'
      : '';

    // Build prompt with strict instructions
    // Only return controlled-ignorance message if no documents were retrieved
    const systemPrompt = retrievedCount === 0
      ? `Ti si asistent koji odgovara na pitanja o službenim dokumentima Grada Ploča.

PRAVILA:
- Odgovaraj UVJEK i SAMO na hrvatskom jeziku
- Odgovori TOČNO sljedećim tekstom (bez dodataka):
"Prema dostupnim službenim dokumentima Grada Ploča, nemam informaciju o tome."${privacyWarning}`
      : `Ti si asistent koji odgovara na pitanja o službenim dokumentima Grada Ploča.

PRAVILA:
- Odgovaraj UVJEK i SAMO na hrvatskom jeziku
- Odgovaraj SAMO koristeći informacije iz priloženog KONTEKSTA
- NIKADA ne izmišljaj informacije koje nisu u KONTEKSTU
- NIKADA ne izmišljaj kontakte, telefonske brojeve, email adrese, adrese ili iznose
- Ako informacija nije u KONTEKSTU, odgovori TOČNO sljedećim tekstom (bez dodataka):
"Prema dostupnim službenim dokumentima Grada Ploča, nemam informaciju o tome."${privacyWarning}

KONTEKT:
${context}`;

    const modelName = 'llama-3.1-8b-instant';
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ];
    const contextLength = context.length;
    
    console.log('Groq request start');
    console.log(`Model: ${modelName}`);
    console.log(`Messages: ${messages.length}`);
    console.log(`Context length: ${contextLength} characters`);
    
    // Set up timeout (15 seconds)
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 15000);
    
    try {
      // Non-streaming mode for debugging
      if (!GROQ_STREAMING) {
        const completion = await groq.chat.completions.create(
          {
            messages,
            model: modelName,
            stream: false,
          },
          {
            signal: abortController.signal,
          }
        );
        
        clearTimeout(timeoutId);
        
        fullReply = completion.choices[0]?.message?.content || '';
        console.log('Groq request success');
        console.log(`Reply length: ${fullReply.length}`);
        
        // Log assistant message to database (best effort)
        if (supabase && fullReply) {
          try {
            const { error } = await supabase.from('messages').insert([{ role: 'assistant', content: fullReply }]);
            if (error) console.warn('Supabase insert assistant message failed:', error.message);
          } catch (e) {
            console.warn('Supabase insert assistant message threw:', e);
          }
        }
        
        return res.json({ reply: fullReply });
      }
      
      // Streaming mode (default)
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const stream = await groq.chat.completions.create(
        {
          messages,
          model: modelName,
          stream: true,
        },
        {
          signal: abortController.signal,
        }
      );

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) {
          fullReply += token;
          
          if (!firstTokenSent) {
            console.log('First token sent');
            firstTokenSent = true;
          }
          
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
      }

      clearTimeout(timeoutId);
      
      // Send final event to close the stream
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      console.log('Groq request success');
      console.log(`Reply length: ${fullReply.length}`);
      console.log('Stream done');
      res.end();

      // Log assistant message to database (best effort, after stream ends)
      if (supabase && fullReply) {
        try {
          const { error } = await supabase.from('messages').insert([{ role: 'assistant', content: fullReply }]);
          if (error) console.warn('Supabase insert assistant message failed:', error.message);
        } catch (e) {
          console.warn('Supabase insert assistant message threw:', e);
        }
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Log detailed error
      console.error('Groq request error:', {
        name: error?.name,
        message: error?.message,
        status: error?.status,
        statusText: error?.statusText,
        stack: error?.stack,
      });
      
      // Handle timeout
      if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('timeout')) {
        if (GROQ_STREAMING) {
          res.write(`data: ${JSON.stringify({ error: 'LLM timeout' })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
        } else {
          return res.status(504).json({ error: 'LLM timeout' });
        }
        return;
      }
      
      // Handle other errors
      if (GROQ_STREAMING) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
        }
        res.write(`data: ${JSON.stringify({ error: 'LLM error' })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } else {
        if (!res.headersSent) {
          return res.status(500).json({ error: 'LLM error' });
        }
      }
    }
  } catch (error) {
    // Handle errors outside Groq call (e.g., embedding errors)
    const isStreaming = res.getHeader('Content-Type') === 'text/event-stream';
    if (isStreaming) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      }
      res.write(`data: ${JSON.stringify({ error: 'Failed to process chat request' })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } else {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process chat request' });
      }
    }
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
