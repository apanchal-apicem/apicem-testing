// Ports backend/app/rate_limit.py exactly: in-memory only, per-process (needs a shared store
// like Redis if this is ever horizontally scaled -- same documented gap as the Python version).
import type { FastifyReply, FastifyRequest } from "fastify";

const hits = new Map<string, number[]>();

export function reset(): void {
  hits.clear();
}

function check(key: string, maxAttempts: number, windowSeconds: number): boolean {
  const now = Date.now() / 1000;
  const cutoff = now - windowSeconds;
  const attempts = hits.get(key) ?? [];
  while (attempts.length > 0 && attempts[0] < cutoff) attempts.shift();
  if (attempts.length >= maxAttempts) {
    hits.set(key, attempts);
    return false;
  }
  attempts.push(now);
  hits.set(key, attempts);
  return true;
}

/** Fastify preHandler factory: 429s if this (client IP, route) pair exceeds the limit. */
export function rateLimit(maxAttempts = 5, windowSeconds = 60) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const clientHost = request.ip || "unknown";
    const key = `${clientHost}:${request.url}`;
    if (!check(key, maxAttempts, windowSeconds)) {
      reply.code(429).send({ detail: "Too many attempts. Please wait a moment and try again." });
      return reply as never;
    }
  };
}

/** Callable directly mid-handler (not as a preHandler) -- for a check whose key isn't known
 * until partway through handling the request (the Groq fallback in assistantIntents.ts). */
export function allow(key: string, maxAttempts: number, windowSeconds: number): boolean {
  return check(key, maxAttempts, windowSeconds);
}
