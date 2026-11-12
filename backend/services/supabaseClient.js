const { createClient } = require("@supabase/supabase-js");
const config = require("../config/config");
const HttpError = require("../utils/httpError");

let client;

function isConfigured() {
  const { url, serviceRoleKey, storageBucket } = config.supabase;
  return Boolean(url && serviceRoleKey && storageBucket);
}

function getSupabaseClient() {
  if (!isConfigured()) {
    throw new HttpError(503, "Private image storage is not configured", "IMAGE_STORAGE_UNAVAILABLE");
  }
  if (!client) {
    let url;
    try {
      url = new URL(config.supabase.url);
    } catch {
      throw new HttpError(503, "Private image storage configuration is invalid", "IMAGE_STORAGE_UNAVAILABLE");
    }
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
      throw new HttpError(503, "Private image storage requires HTTPS", "IMAGE_STORAGE_UNAVAILABLE");
    }
    client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

module.exports = { getSupabaseClient, isConfigured };
