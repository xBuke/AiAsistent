import 'dotenv/config'; // Load environment variables from .env file
import { buildServer } from './server.js';
import './db/supabase.js'; // Import once to fail fast if env vars are missing
const PORT = 3000;
async function start() {
    const server = await buildServer();
    try {
        await server.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`Server running at http://localhost:${PORT}`);
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}
start();
