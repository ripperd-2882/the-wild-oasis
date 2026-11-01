// Store request counts for each anonymous session.
const rateLimitStore = new Map();

const WINDOW_MS = 60 * 1000; // 60 seconds
const MAX_REQUESTS = 5;

export function checkRateLimit(sessionId) {
  const now = Date.now();

  // Get this session's current rate-limit information.
  const current = rateLimitStore.get(sessionId);

  // No record yet, or the previous 60-second window has expired.
  if (!current || now - current.windowStart >= WINDOW_MS) {
    rateLimitStore.set(sessionId, {
      count: 1,
      windowStart: now,
    });

    return { allowed: true };
  }

  // The visitor has already used all 5 requests.
  if (current.count >= MAX_REQUESTS) {
    const timeLeft = WINDOW_MS - (now - current.windowStart);

    return {
      allowed: false,
      retryAfter: Math.ceil(timeLeft / 1000),
    };
  }

  // Allow the request and increase the count.
  current.count += 1;

  return { allowed: true };
}
