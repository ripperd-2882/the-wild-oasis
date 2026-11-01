import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { aiSupabase } from "./ai-supabase";

export const AI_SESSION_COOKIE = "ai_session";

const SESSION_DURATION_DAYS = 7;

function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function isValidSessionToken(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
}

export async function getOrCreateAISession(sessionToken) {
  // 1. Check whether the visitor already has a valid session.
  if (isValidSessionToken(sessionToken)) {
    const tokenHash = hashSessionToken(sessionToken);

    const { data, error } = await aiSupabase
      .from("ai_anonymous_sessions")
      .select("id, gemini_interaction_id, expires_at")
      .eq("session_token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw new Error("Could not retrieve AI session.");
    }

    // 2. Existing session found: update its last activity.
    if (data) {
      const { error: updateError } = await aiSupabase
        .from("ai_anonymous_sessions")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);

      if (updateError) {
        throw new Error("Could not update AI session.");
      }

      return {
        sessionId: data.id,
        sessionToken,
        geminiInteractionId: data.gemini_interaction_id,
        isNew: false,
      };
    }
  }

  // 3. No valid session: generate a new visitor token.
  const newSessionToken = generateSessionToken();
  const newTokenHash = hashSessionToken(newSessionToken);

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 4. Store only the hash, never the original token.
  const { data, error } = await aiSupabase
    .from("ai_anonymous_sessions")
    .insert({
      session_token_hash: newTokenHash,
      expires_at: expiresAt,
    })
    .select("id, gemini_interaction_id, expires_at")
    .single();

  if (error) {
    throw new Error("Could not create AI session.");
  }

  return {
    sessionId: data.id,
    sessionToken: newSessionToken,
    geminiInteractionId: data.gemini_interaction_id,
    isNew: true,
  };
}

export async function updateGeminiInteractionId(sessionId, interactionId) {
  if (typeof interactionId !== "string" || !interactionId.trim()) {
    throw new Error("Invalid Gemini interaction ID.");
  }

  const { error } = await aiSupabase
    .from("ai_anonymous_sessions")
    .update({
      gemini_interaction_id: interactionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) {
    throw new Error("Could not update Gemini interaction ID.");
  }
}
