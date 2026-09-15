import prisma from './lib/prisma';
import app from './app';

const PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);

async function start() {
  const url = process.env.DATABASE_URL || '';

  if (!url) {
    console.error(
      '\n[DATABASE] DATABASE_URL environment variable is not set.\n' +
      'Set it to your Neon PostgreSQL connection string in backend/.env\n' +
      '(see .env.example). Example:\n' +
      '  DATABASE_URL=postgresql://user:password@ep-<id>.pooler.<region>.neon.tech/<db>?sslmode=require\n'
    );
    process.exit(1);
  }

  if (/file:.*\.db/.test(url)) {
    console.error(
      '\n[DATABASE] DATABASE_URL points to a local SQLite file, but this\n' +
      'project requires Neon PostgreSQL. Update DATABASE_URL in backend/.env\n' +
      'to a Neon PostgreSQL connection string (see .env.example).\n'
    );
    process.exit(1);
  }

  try {
    // Validate the Neon PostgreSQL connection before serving traffic.
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('[DATABASE] Connected to Neon PostgreSQL');
  } catch (error) {
    let host = '(unknown)';
    try {
      host = new URL(url.replace('postgresql://', 'postgres://')).host || '(unknown)';
    } catch {
      /* malformed URL – host stays unknown */
    }
    console.error(
      '\n[DATABASE] Failed to connect to PostgreSQL.\n' +
      `Requested host: ${host}\n` +
      'Check that:\n' +
      '  - DATABASE_URL is correct (from your Neon dashboard)\n' +
      '  - SSL is allowed (use ?sslmode=require)\n' +
      '  - Your IP is allowed / no firewall blocks the connection\n' +
      '  - The database exists\n'
    );
    console.error('Original error (credentials not shown):', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

start();

export { app };