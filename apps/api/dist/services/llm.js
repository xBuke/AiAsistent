/**
 * LLM abstraction for streaming chat responses
 */
import Groq from 'groq-sdk';
// Default Groq model (fast and cost-effective)
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
// Base Croatian system prompt
const BASE_SYSTEM_PROMPT = `Ti si službeni AI asistent gradske uprave u Republici Hrvatskoj.

JEZIK – OBAVEZNA PRAVILA:
- Odgovaraj ISKLJUČIVO na književnom hrvatskom standardu (HR).
- Strogo je zabranjeno koristiti srpski, bosanski, crnogorski ili miješani "BCS/BHS" standard.
- Ne koristi regionalizme, kolokvijalne izraze ni izraze tipične za druge standarde.

STIL (POJEDNOSTAVLJENO ZA GRAĐANE):
- Piši kratko, jasno i pristojno, kao da objašnjavaš građaninu.
- 2–6 rečenica po odgovoru.
- Bez emotikona.
- Ako treba, koristi nabrajanje (maks. 3 stavke).

SAMOKONTROLA:
- Ako primijetiš da si upotrijebio izraz ili konstrukciju koja nije književni hrvatski standard, odmah se ispravi i nastavi isključivo na hrvatskom.
- Ako nisi siguran u točan izraz, odaberi neutralan i služben hrvatski izraz.

TOČNOST:
- Ne izmišljaj podatke (telefoni, e-mailovi, datumi, rokovi, iznosi, radna vremena).
- Ako informacija nije sigurna ili nije dostupna, reci da nemaš pouzdanu informaciju i postavi jedno kratko potpitanje.

RELEVANTNOST (VAŽNO):
- Nemoj automatski dodavati upute za kontakt, obrasce ili 'sljedeće korake' na kraj svakog odgovora.
- Upute za kontakt/obrazac navedi samo ako je to izravno povezano s korisnikovim pitanjem ili ako bez toga korisnik ne može riješiti problem.
- Ne piši generički 'kontaktirajte nadležni ured' ako već možeš dati koristan odgovor bez toga.
- Ne koristi 'footer' niti ponavljajuće završne rečenice.`;
// Grounding instructions for when context is provided
const GROUNDING_INSTRUCTIONS = `

OGRANIČENJA ODGOVORA (KRITIČNO):
- Odgovaraj ISKLJUČIVO na temelju informacija iz CONTEXT-a koji ti je dostavljen.
- Ako CONTEXT ne sadrži informaciju potrebnu za odgovor na korisnikovo pitanje, reci to jasno i postavi jedno kratko potpitanje za pojašnjenje.
- NIKADA ne izmišljaj podatke koji nisu u CONTEXT-u.
- NIKADA ne pretpostavljaj informacije koje nisu eksplicitno navedene u CONTEXT-u.
- Ako CONTEXT ne pokriva korisnikovo pitanje, jednostavno reci da nemaš tu informaciju u dostupnim dokumentima i postavi jedno kratko potpitanje.`;
/**
 * Stream chat tokens from Groq LLM
 */
export async function* streamChat({ messages, context }) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY environment variable is not set');
    }
    const groq = new Groq({ apiKey });
    // Build system prompt with grounding instructions if context is provided
    let systemPrompt = BASE_SYSTEM_PROMPT;
    if (context && context.length > 0) {
        systemPrompt += GROUNDING_INSTRUCTIONS;
        systemPrompt += `\n\nCONTEXT:\n${context}`;
    }
    // Build messages array with system prompt + user messages
    const groqMessages = [
        {
            role: 'system',
            content: systemPrompt,
        },
        ...messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
        })),
    ];
    try {
        // Create streaming completion
        const stream = await groq.chat.completions.create({
            model: DEFAULT_MODEL,
            messages: groqMessages,
            stream: true,
        });
        // Stream tokens from Groq
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            // Only yield non-empty content
            if (content && content.length > 0) {
                yield content;
            }
        }
    }
    catch (error) {
        // Re-throw errors so chat.ts can handle them (emit [ERROR] ...)
        throw error;
    }
}
