import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { registerRateLimit } from './middleware/rateLimit.js';
import { registerOriginValidation } from './middleware/originValidation.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerEventsRoutes } from './routes/events.js';
import { registerAdminReadRoutes } from './routes/adminRead.js';
import { registerAdminDashboardRoutes } from './routes/adminDashboard.js';
import { registerAdminDocumentRoutes } from './routes/adminDocuments.js';
import { registerAdminUsersRoutes } from './routes/adminUsers.js';
import { registerSuperadminRoutes } from './routes/superadmin.js';
import { registerFormsRoutes } from './routes/forms.js';
import { registerSentimentRoutes } from './sentimentRouter.js';
export async function buildServer() {
    const server = Fastify({
        logger: true,
        trustProxy: true, // Trust proxy for Vercel deployment (handles X-Forwarded-For)
    });
    // Register plugins
    await server.register(cors, {
        origin: (origin, callback) => {
            // Always allow admin dev frontend
            if (origin === 'http://localhost:5173') {
                callback(null, true);
                return;
            }
            // Always allow admin prod frontend
            if (origin === 'https://gradai.mangai.hr') {
                callback(null, true);
                return;
            }
            // Allow all other origins; route middleware handles protected-origin blocking
            callback(null, true);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });
    await server.register(cookie);
    // Required for POST /forms/:reference_number/attachments (multipart file upload).
    await server.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB per file
    await registerRateLimit(server);
    await registerOriginValidation(server);
    // Health check endpoint
    server.get('/health', async (request, reply) => {
        return { status: 'ok' };
    });
    // Register auth routes
    await registerAuthRoutes(server);
    // Register chat routes
    await registerChatRoutes(server);
    // Register events routes
    await registerEventsRoutes(server);
    // Register admin read routes
    await registerAdminReadRoutes(server);
    // Register admin dashboard routes
    await registerAdminDashboardRoutes(server);
    // Register admin document routes
    await registerAdminDocumentRoutes(server);
    // Register admin users routes
    await registerAdminUsersRoutes(server);
    // Register superadmin routes
    await registerSuperadminRoutes(server);
    await registerFormsRoutes(server);
    await registerSentimentRoutes(server);
    // Dev-only debug route for PDF testing
    if (process.env.NODE_ENV !== 'production') {
        const { htmlToPdfBuffer } = await import('./pdf/htmlToPdf.js');
        server.get('/__debug/pdf-test', async (_request, reply) => {
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>Šime Ćorić – Žnjidarić, Đakovo — čćšđž ČĆŠĐŽ</p></body></html>`;
            const pdf = await htmlToPdfBuffer(html);
            return reply
                .header('Content-Type', 'application/pdf')
                .send(pdf);
        });
        server.get('/__debug/pdf-novorodeno', async (_request, reply) => {
            const { generateFormPdf } = await import('./forms/generateFormPdf.js');
            const sample = {
                podnositelj: {
                    ime_prezime: 'Šime Ćorić – Žnjidarić',
                    adresa: 'Ulica ž/đ/č/ć/š 15, 20340 Ploče',
                    kontakt: '+385 99 123 4567',
                    oib: '12345678901',
                    iban: 'HR1234567890123456789',
                },
                dijete: {
                    godina_rodjenja: '2026',
                    mjesto_rodjenja: 'Ploče',
                    datum_rodjenja: '15.02.2026.',
                },
                flags: {
                    roditelj_izvan_ploca: true,
                    za_trece_ili_sljedece: true,
                },
                meta: {
                    mjesto_podnosenja: 'Ploče',
                    datum_podnosenja: '15. veljače 2026.',
                    ref_broj: 'REF-2026-001',
                },
            };
            const pdf = await generateFormPdf('novorodeno_dijete', sample);
            return reply
                .header('Content-Type', 'application/pdf')
                .send(pdf);
        });
        server.get('/__debug/pdf-jednokratna', async (_request, reply) => {
            const { generateFormPdf } = await import('./forms/generateFormPdf.js');
            const sample = {
                podnositelj: {
                    ime_prezime: 'Ana Šimić – Horvat',
                    adresa: 'Ulica ž/đ/č/ć/š 7, 20340 Ploče',
                    kontakt: '+385 98 765 4321',
                    oib: '98765432109',
                    iban: 'HR9876543210987654321',
                },
                razlog_zamolbe: `Obiteljski prihodi su se znatno smanjili zbog dugotrajne bolesti člana kućanstva.
Trenutno sam zaposlena, ali troškovi liječenja i redoviti životni troškovi premašuju mogućnosti obitelji.
Molim za jednokratnu novčanu pomoć kako bismo prebrodili teško razdoblje.
Hvala unaprijed na razmatranju zamolbe.`,
                status_podnositelja: 'zaposlen',
                flags: {
                    je_podstanar: true,
                    zdravstveni_razlog: true,
                },
                meta: {
                    mjesto_podnosenja: 'Ploče',
                    datum_podnosenja: '15. veljače 2026.',
                    ref_broj: 'REF-2026-001',
                },
                attachments: {
                    oi_ili_rodni_listovi: true,
                    izjava_kucanstvo: true,
                    dokaz_primanja: true,
                    potvrda_poslodavca: true,
                    odresci_mirovine: false,
                    uvjerenje_hzz: false,
                    potvrda_porezna: true,
                    potvrda_hzss: false,
                    ugovor_podstanarstvo: true,
                    lijecnicka_dokumentacija: true,
                    iban_potvrda: false,
                },
            };
            const pdf = await generateFormPdf('jednokratna_novcana_pomoc', sample);
            return reply
                .header('Content-Type', 'application/pdf')
                .send(pdf);
        });
        server.get('/__debug/forms/latest', async (_request, reply) => {
            const { supabase } = await import('./db/supabase.js');
            const { data: rows, error } = await supabase
                .from('form_requests')
                .select('reference_number, type, status, created_at')
                .order('created_at', { ascending: false })
                .limit(5);
            if (error) {
                return reply.status(500).send({ error: error.message });
            }
            return reply.send(rows ?? []);
        });
    }
    return server;
}
