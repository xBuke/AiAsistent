// Import the compiled Fastify server builder from dist
// This file is compiled by Vercel during deployment
import { buildServer } from '../dist/server.js';
import '../dist/db/supabase.js'; // Import once to fail fast if env vars are missing

// Cache the server instance (built once per serverless function instance)
let serverInstance = null;

// Build server on first request (cached for subsequent requests)
async function getServer() {
  if (!serverInstance) {
    serverInstance = await buildServer();
    await serverInstance.ready();
  }
  return serverInstance;
}

// Vercel serverless function handler
export default async function handler(req, res) {
  try {
    const server = await getServer();
    // Use Fastify's underlying HTTP server to handle the request (Vercel pattern)
    server.server.emit('request', req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
