/**
 * LLM abstraction for streaming chat responses
 */

import OpenAI from 'openai';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface StreamChatOptions {
  messages: ChatMessage[];
  context?: string;
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Base Croatian system prompt
const BASE_SYSTEM_PROMPT = `Ti si službeni AI asistent grada.

Uvijek odgovaraj ISKLJUČIVO na književnom hrvatskom standardnom jeziku.
Bez iznimki, neovisno o jeziku u kojem je postavljeno pitanje.

Ton odgovora mora biti:
- služben
- jasan
- uljudan
- neutralan
- primjeren javnoj upravi

Primarno koristi informacije iz dostavljenog KONTEKSTA (službeni dokumenti, podaci i izvori grada).

Ako KONTEKST ne sadrži izravnu informaciju potrebnu za odgovor:
- nemoj nagađati
- nemoj izmišljati podatke
- jasno i pristojno objasni da trenutačno nemaš dovoljno informacija
- uputi korisnika da precizira pitanje ili postavi upit vezan uz gradske usluge, projekte, postupke ili kontakte

Ako je pitanje općenito (npr. o ulozi AI asistenta ili načinu pomoći građanima):
- odgovori kratko i informativno
- objasni u kojim područjima možeš pomoći građanima

Nikada ne ostavljaj odgovor prazan.
Nikada ne odgovaraj neformalno.
Nikada ne koristi kolokvijalni jezik, emotikone ili osobna mišljenja.

Tvoj je cilj pružiti točne, pouzdane i službeno formulirane informacije u skladu s ulogom javne uprave.`;

// Grounding instructions for when context is provided
const GROUNDING_INSTRUCTIONS = `

KORIŠTENJE CONTEXT-a (KRITIČNO):
- Odgovaraj ISKLJUČIVO na temelju informacija iz CONTEXT-a koji ti je dostavljen.
- Kada CONTEXT sadrži točne podatke (vremena, datume, brojeve, imena, adrese), IZVAĐAJ I KORISTI IH VERBATIM - točno kako su navedeni u CONTEXT-u.
- NIKADA ne izlazi placeholdere poput "od:00 do:00", "uglavnom", "može varirati" ili slične generičke fraze.
- NIKADA ne izmišljaj podatke koji nisu u CONTEXT-u.
- NIKADA ne pretpostavljaj informacije koje nisu eksplicitno navedene u CONTEXT-u.

RADNO VRIJEME (SPECIFIČNO):
- Ako pitanje traži radno vrijeme i CONTEXT sadrži radno vrijeme, navedi ga TOČNO kako je zapisano u CONTEXT-u (npr. "07:30 – 15:30", "11:00 – 19:00").
- Ako CONTEXT ne sadrži radno vrijeme za traženi odjel/lokaciju, pitaj: "Za koji odjel ili lokaciju trebate radno vrijeme?"

KADA INFORMACIJA NIJE U CONTEXT-u:
- Ako CONTEXT ne sadrži informaciju potrebnu za odgovor, reci to jasno i postavi JEDNO kratko potpitanje za pojašnjenje.
- NIKADA ne koristi generičke fraze poput "Pokušajte preformulirati pitanje" kada CONTEXT postoji - samo kada je retrieval potpuno prazan.
- Preferiraj specifično potpitanje umjesto općenitih odgovora.

DEMO MODE - STROGA PRAVILA (KRITIČNO):
- Ako CONTEXT sadrži odgovor, izvadi i odgovori TOČNO. Ne generaliziraj.
- Ako CONTEXT je prazan, postavi JEDNO kratko potpitanje za pojašnjenje.
- NIKADA ne izlazi placeholdere poput "od do sati" ili slične generičke fraze.

ODGOVORI:
- Drži odgovore kratke (1–4 rečenice).
- Ne spominji izvore, linkove ili "Sources:" u tekstu odgovora.
- Ne dodavaj generičke završne rečenice.`;

/**
 * Stream chat tokens from OpenAI
 */
export async function* streamChat({ messages, context }: StreamChatOptions): AsyncGenerator<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const openai = new OpenAI({ apiKey });

  // Build system prompt with grounding instructions if context is provided
  let systemPrompt = BASE_SYSTEM_PROMPT;
  if (context && context.length > 0) {
    systemPrompt += GROUNDING_INSTRUCTIONS;
    systemPrompt += `\n\nCONTEXT:\n${context}`;
    
    // DEMO_MODE: Log context injection
    if (process.env.DEMO_MODE === 'true') {
      console.log(`[DEMO_MODE] LLM: Context injected into system prompt, context length: ${context.length} chars`);
      console.log(`[DEMO_MODE] LLM: Full system prompt length: ${systemPrompt.length} chars`);
    }
  } else {
    // DEMO_MODE: Log when context is empty
    if (process.env.DEMO_MODE === 'true') {
      console.log(`[DEMO_MODE] LLM: No context provided (context length: 0)`);
    }
  }

  // Build messages array with system prompt + user messages
  const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
  ];

  // Track if any tokens were yielded (safety net to prevent empty responses)
  let hasYieldedTokens = false;

  try {
    const stream = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: llmMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      // Only yield non-empty content
      if (content && content.length > 0) {
        hasYieldedTokens = true;
        yield content;
      }
    }
  } catch (error) {
    // Re-throw errors so chat.ts can handle them (emit [ERROR] ...)
    throw error;
  }

  // Safety net: if no tokens were yielded, yield a fallback message
  // This ensures the frontend NEVER receives an empty assistant message
  if (!hasYieldedTokens) {
    yield 'Žao mi je, trenutno ne mogu generirati odgovor. Molimo pokušajte ponovno.';
  }
}

/**
 * Generate conversation title and summary using OpenAI
 * Returns { title: string, summary: string } or null on error
 */
export async function generateConversationTitleSummary(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{ title: string; summary: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const openai = new OpenAI({ apiKey });

  // Build conversation context from last ~6 messages
  const recentMessages = messages.slice(-6);
  const conversationText = recentMessages
    .map(msg => `${msg.role === 'user' ? 'Korisnik' : 'Asistent'}: ${msg.content}`)
    .join('\n\n');

  const prompt = `Na temelju razgovora izradi:
1) TITLE (3-7 riječi)
2) SUMMARY (1-2 rečenice)
Vrati kao JSON: {"title":"...","summary":"..."}
Bez dodatnog teksta.

Razgovor:
${conversationText}`;

  const systemMessage = 'Odgovaraj isključivo na hrvatskom jeziku. Vrati samo JSON objekt bez dodatnog teksta.';

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: systemMessage,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      return null;
    }

    // Try to parse JSON response
    // Handle cases where response might have markdown code blocks
    let jsonStr = response;
    if (jsonStr.startsWith('```')) {
      const match = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (match) {
        jsonStr = match[1];
      }
    }

    const parsed = JSON.parse(jsonStr);
    if (parsed.title && parsed.summary) {
      return {
        title: parsed.title.trim(),
        summary: parsed.summary.trim(),
      };
    }

    return null;
  } catch (error) {
    console.warn('Failed to generate conversation title/summary:', error);
    return null;
  }
}
