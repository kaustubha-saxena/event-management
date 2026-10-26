import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readConfig } from "../../server/config.js";

const enabled = process.env.SUPABASE_INTEGRATION_TEST === "1"
  && Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

test("Supabase integration project has the CampusFlow RPC schema", { skip: !enabled }, async () => {
  const config = readConfig();
  const client = createClient(config.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("search_events", {
    p_query: "", p_category: "", p_sort: "date", p_user_id: null,
  });
  assert.ifError(error);
  assert.ok(Array.isArray(data), "search_events should return rows");
});
