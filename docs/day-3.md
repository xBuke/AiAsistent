# Day 3: Safety Rails & UI Polish

## What Changed Today

### Prompting (apps/api)
- **Croatian output enforcement**: System prompt forces Croatian responses always
- **Strict context rules**: Answer ONLY from provided CONTEXT, no invention of contacts/phone/email/addresses/amounts
- **Controlled ignorance**: Exact response when info not in context: "Prema dostupnim službenim dokumentima Grada Ploča, nemam informaciju o tome."
- **Privacy detection**: Warns users not to share personal data (OIB, full address, phone, email) if detected

### UI (apps/web)
- **Header**: Added "AI asistent — Grad Ploče" with subtitle
- **Status indicator**: Shows "Odgovaram..." while waiting for response
- **Suggested questions**: 3 clickable buttons above input (only when no messages)
- **Error handling**: User-friendly Croatian error messages, loading state always clears
- **Mobile-friendly**: Responsive design with proper spacing

## Demo Flow

1. User opens app → sees header, subtitle, and 3 suggested questions
2. User clicks suggested question OR types custom question → message sent, "Odgovaram..." appears
3. Response streams in (or arrives as JSON if non-streaming) → answer displayed in Croatian

## 3 Demo Questions

1. "Koje su ključne stavke proračuna Grada Ploča za 2024.?"
2. "Što je navedeno u obrazloženju proračuna za 2024.?"
3. "Kome se građani mogu obratiti vezano uz proračun i izvršenje?"

## Known Issues / TODO

- Privacy detection regex may have false positives (e.g., postal codes in addresses)
- Suggested questions only show when `messages.length === 0` (could show after clearing chat)
- No chat history persistence (messages lost on refresh)

## Plan for Day 4: Admin-Lite

- Simple admin view to see message logs from Supabase
- Basic stats: message count, common questions
- No auth needed (local/dev only)
- View recent conversations
