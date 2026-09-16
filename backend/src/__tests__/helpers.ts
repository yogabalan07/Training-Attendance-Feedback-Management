import type { Express } from 'express';
import supertest from 'supertest';
import { isDbAvailable, dbReason } from './setup';

interface LoginResult {
  token: string;
  user: { id: string; name: string; role: string; loginId: string };
}

export async function loginUser(
  app: Express,
  loginId: string,
  password: string
): Promise<LoginResult> {
  const res = await supertest(app).post('/api/auth/login').send({ loginId, password });
  if (res.status !== 200) {
    throw new Error(
      `loginUser failed for ${loginId}: status=${res.status} body=${JSON.stringify(res.body)}`
    );
  }
  return res.body.data as LoginResult;
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function requireDb(): void {
  if (!isDbAvailable()) {
    throw new Error(`Integration tests skipped: ${dbReason()}`);
  }
}

export function skipIfNoDb(): boolean {
  return !isDbAvailable();
}