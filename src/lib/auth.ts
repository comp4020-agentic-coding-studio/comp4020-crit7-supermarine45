import crypto from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { sessions, users } from "./schema";

// Minimal, native to this app: username + password only, no email, no
// password reset, no lockout/rate-limiting on repeated attempts. A
// deliberate judgement call for a one-week prototype with a handful of test
// accounts — see README.md.
const scrypt = promisify(crypto.scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "session";

export interface AuthUser {
  id: number;
  username: string;
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const hash = await scrypt(password, salt, 64);
  const storedHash = Buffer.from(hashHex, "hex");
  return hash.length === storedHash.length && crypto.timingSafeEqual(hash, storedHash);
}

export function findUserByUsername(username: string): (AuthUser & { passwordHash: string }) | undefined {
  return db.select().from(users).where(eq(users.username, username)).get();
}

export async function createUser(username: string, password: string): Promise<AuthUser | null> {
  if (findUserByUsername(username)) return null;
  const passwordHash = await hashPassword(password);
  try {
    const row = db.insert(users).values({ username, passwordHash }).returning().get();
    return { id: row.id, username: row.username };
  } catch {
    // Unique constraint lost a race with another signup for the same name.
    return null;
  }
}

export async function verifyCredentials(username: string, password: string): Promise<AuthUser | null> {
  const row = findUserByUsername(username);
  if (!row) return null;
  const ok = await verifyPassword(password, row.passwordHash);
  return ok ? { id: row.id, username: row.username } : null;
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.insert(sessions).values({ id: token, userId, expiresAt }).run();
  return token;
}

export function getUserByToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const row = db
    .select({ id: users.id, username: users.username, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token))
    .get();
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    deleteSession(token);
    return null;
  }
  return { id: row.id, username: row.username };
}

export function deleteSession(token: string): void {
  db.delete(sessions).where(eq(sessions.id, token)).run();
}
