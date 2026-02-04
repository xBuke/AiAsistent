import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { registerRateLimit } from './middleware/rateLimit.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerEventsRoutes } from './routes/events.js';
import { registerAdminReadRoutes } from './routes/adminRead.js';
import { registerAdminDashboardRoutes } from './routes/adminDashboard.js';

export async function buildServer() {
  const server = Fastify({
    logger: true,
    trustProxy: true, // Trust proxy for Vercel deployment (handles X-Forwarded-For)
  });

  // Register plugins
  await server.register(cors, {
    origin: (origin, callback) => {
      // Always allow http://localhost:5173 for admin frontend (required when credentials: true)
      if (origin === 'http://localhost:5173') {
        callback(null, true);
        return;
      }
      // DEMO_MODE: Explicitly allow production admin frontend origin
      if (process.env.DEMO_MODE === 'true' && origin === 'https://gradai.mangai.hr') {
        callback(null, true);
        return;
      }
      // Allow all other origins for widget endpoints (maintains existing behavior)
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await server.register(cookie);

  await registerRateLimit(server);

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

  return server;
}
