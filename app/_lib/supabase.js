import { createClient } from "@supabase/supabase-js/dist/index.cjs";

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
);
