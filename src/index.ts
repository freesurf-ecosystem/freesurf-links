import { getProfile, putProfile, profileExists, getUsernameByUserId, type Env } from "./storage";
import { ProfileSchema, RESERVED_SLUGS } from "./schema";
import { renderProfilePage } from "./render";
import { validateSupabaseJWT } from "./auth";
import { HUB_HTML } from "./hub";
import { FREESURF } from "./freesurf.config";
import { DASHBOARD } from "./dashboard";

const STATIC_MIME: Record<string, string> = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".xml": "application/xml",
};

// Sitemap for the apex freesurf.tools hub site (served by this worker).
const HUB_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://freesurf.tools/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://freesurf.tools/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://freesurf.tools/terms</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://freesurf.tools/support</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
</urlset>`;

function serveDashboardAsset(request: Request): Response {
  const url = new URL(request.url);
  let assetPath = url.pathname.replace(/^\//, "");

  // SPA fallback: non-file routes get index.html on links subdomain
  if (!assetPath || !assetPath.includes(".")) {
    assetPath = "index.html";
  }

  const asset = DASHBOARD[assetPath];
  if (!asset) {
    return new Response(DASHBOARD["index.html"]?.content || "Not found", {
      status: 200,
      headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  const ext = "." + (assetPath.split(".").pop() || "html");
  // Never cache the SPA entry (index.html) so deploys show up immediately; other
  // assets get a short TTL. The app is served inline from the Worker, so caching
  // it long just hides updates behind stale edge copies.
  const isHtml = assetPath === "index.html" || (asset.type || "").includes("html");
  return new Response(asset.content, {
    status: 200,
    headers: {
      "Content-Type": asset.type || STATIC_MIME[ext] || "application/octet-stream",
      "Cache-Control": isHtml ? "no-cache" : "public, max-age=300",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const isLinks = url.hostname.startsWith("links.");

    // --- API routes (both subdomains) ---
    if (path.startsWith("/api/")) {
      return handleApi(request, env, path);
    }

    // --- links.freesurf.tools: Dashboard SPA ---
    if (isLinks) {
      return serveDashboardAsset(request);
    }

    // --- Apex freesurf.tools: sitemap ---
    if (path === "/sitemap.xml") {
      return new Response(HUB_SITEMAP, {
        status: 200,
        headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
      });
    }

    // --- Health check ---
    if (path === "/health") {
      return new Response("ok", { status: 200 });
    }

    // --- app-ads.txt ---
    if (path === "/app-ads.txt") {
      return new Response("google.com, pub-5237160801083269, DIRECT, f08c47fec0942fa0", {
        status: 200,
        headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" },
      });
    }

    // --- Static legal pages ---
    if (path === "/privacy" || path === "/privacy.html") {
      const asset = DASHBOARD["pages/privacy.html"];
      if (asset) {
        return new Response(asset.content, {
          status: 200,
          headers: { "Content-Type": "text/html;charset=utf-8" },
        });
      }
    }
    if (path === "/terms" || path === "/terms.html") {
      const asset = DASHBOARD["pages/terms.html"];
      if (asset) {
        return new Response(asset.content, {
          status: 200,
          headers: { "Content-Type": "text/html;charset=utf-8" },
        });
      }
    }
    if (path === "/support" || path === "/support.html") {
      const asset = DASHBOARD["pages/support.html"];
      if (asset) {
        return new Response(asset.content, {
          status: 200,
          headers: { "Content-Type": "text/html;charset=utf-8" },
        });
      }
    }
    if (path === "/eula" || path === "/eula.html") {
      const asset = DASHBOARD["pages/eula.html"];
      if (asset) {
        return new Response(asset.content, {
          status: 200,
          headers: { "Content-Type": "text/html;charset=utf-8" },
        });
      }
    }

    // --- Avatar image ---
    const avatarMatch = path.match(/^\/avatar\/([a-z0-9._-]{3,30})$/);
    if (avatarMatch) {
      const key = `avatars/${avatarMatch[1]}`;
      const obj = await env.AVATARS.get(key);
      if (!obj) return notFound();
      const headers = new Headers();
      headers.set("Content-Type", obj.httpMetadata?.contentType || "image/jpeg");
      headers.set("Cache-Control", "public, max-age=3600");
      return new Response(obj.body, { headers });
    }

    // --- Public profile page ---
    // /:username or /:username/links
    const linksMatch = path.match(/^\/([a-z0-9._-]{3,30})\/links$/);
    const usernameMatch = linksMatch || path.match(/^\/([a-z0-9._-]{3,30})$/);
    if (usernameMatch && request.method === "GET") {
      const username = usernameMatch[1];

      if (RESERVED_SLUGS.has(username)) {
        return notFound();
      }

      const profile = await getProfile(env, username);
      if (!profile) return notFound();

      // Track page view
      trackView(env.ANALYTICS, username).catch(() => {});

      const html = renderProfilePage(profile);
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html;charset=UTF-8",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      });
    }

    // --- Root / landing — FreeSurf hub page ---
    if (path === "/") {
      return new Response(HUB_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    return notFound();
  },
};

// ---- API handler ----

async function handleApi(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const allowedOrigins = FREESURF.CORS_ORIGINS.links;
  const origin = request.headers.get("Origin") ?? "";
  const corsOrigin = (allowedOrigins as readonly string[]).includes(origin) ? origin : allowedOrigins[0];
  const corsHeaders = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // POST /api/event — analytics click tracking (public)
  if (path === "/api/event" && request.method === "POST") {
    try {
      const body = (await request.json()) as {
        username?: string;
        linkIndex?: number;
        timestamp?: string;
      };
      if (body.username && typeof body.linkIndex === "number") {
        await trackClick(env.ANALYTICS, body.username, body.linkIndex);
      }
      return new Response("ok", { status: 200, headers: corsHeaders });
    } catch {
      return new Response("bad request", { status: 400, headers: corsHeaders });
    }
  }

  // ---- Auth routes ----
  // Authentication is handled by the central auth service at auth.freesurf.tools.
  // The dashboard uses cross-domain cookie-based session sharing.
  // The Worker validates the resulting JWT on authenticated API calls.

  // GET /api/username/check/:username — public availability check
  const usernameCheckMatch = path.match(/^\/api\/username\/check\/([a-z0-9._-]{3,30})$/);
  if (usernameCheckMatch && request.method === "GET") {
    const slug = usernameCheckMatch[1];
    if (RESERVED_SLUGS.has(slug)) {
      return jsonResponse({ available: false, reason: "reserved" }, 200, corsHeaders);
    }
    const taken = await profileExists(env, slug);
    return jsonResponse({ available: !taken, reason: taken ? "taken" : null }, 200, corsHeaders);
  }

  // GET /api/auth/me — return current user's profile (JWT-authenticated)
  if (path === "/api/auth/me" && request.method === "GET") {
    const jwt = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"), FREESURF.AUTH.SUPABASE_URL);
    if (!jwt) return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
    const username = await getUsernameByUserId(env, jwt.sub);
    if (!username) return jsonResponse({ needsSetup: true, email: jwt.email }, 200, corsHeaders);
    const profile = await getProfile(env, username);
    if (!profile) return jsonResponse({ needsSetup: true, email: jwt.email }, 200, corsHeaders);
    const { email: _email, ...publicProfile } = profile;
    return jsonResponse(publicProfile, 200, corsHeaders);
  }

  // GET /api/profile/:username (public — strip email)
  const profileMatch = path.match(/^\/api\/profile\/([a-z0-9._-]{3,30})$/);
  if (profileMatch && request.method === "GET") {
    const profile = await getProfile(env, profileMatch[1]);
    if (!profile)
      return jsonResponse({ error: "not found" }, 404, corsHeaders);
    const { email: _email, ...publicProfile } = profile;
    return jsonResponse(publicProfile, 200, corsHeaders);
  }

  // POST /api/profile — create new profile (requires Supabase JWT)
  if (path === "/api/profile" && request.method === "POST") {
    const jwt = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"), FREESURF.AUTH.SUPABASE_URL);
    if (!jwt) return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);

    try {
      const body = await request.json();
      const parsed = ProfileSchema.parse({ ...(body as Record<string, unknown>), email: jwt.email });

      if (RESERVED_SLUGS.has(parsed.username)) {
        return jsonResponse({ error: "username reserved" }, 400, corsHeaders);
      }

      if (await profileExists(env, parsed.username)) {
        return jsonResponse({ error: "username taken" }, 409, corsHeaders);
      }

      // Check if this user already has a profile
      const existingUsername = await getUsernameByUserId(env, jwt.sub);
      if (existingUsername) {
        return jsonResponse({ error: "account already has a profile" }, 409, corsHeaders);
      }

      const now = new Date().toISOString();
      const profile = { ...parsed, createdAt: now, updatedAt: now };

      const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
      await putProfile(env, profile, token, jwt.sub);

      const { email: _email, ...publicProfile } = profile;
      return jsonResponse(publicProfile, 201, corsHeaders);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "invalid request";
      return jsonResponse({ error: message }, 400, corsHeaders);
    }
  }

  // PUT /api/profile/:username — update existing profile (requires Supabase JWT)
  if (profileMatch && request.method === "PUT") {
    const urlUsername = profileMatch[1];

    const jwt = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"), FREESURF.AUTH.SUPABASE_URL);
    const ownedUsername = jwt ? await getUsernameByUserId(env, jwt.sub) : null;
    if (!jwt || ownedUsername !== urlUsername) {
      return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
    }

    const existing = await getProfile(env, urlUsername);
    if (!existing)
      return jsonResponse({ error: "not found" }, 404, corsHeaders);

    try {
      const body = (await request.json()) as Record<string, unknown>;
      const newUsername = (body.username as string) || urlUsername;

      // If username is changing, validate availability
      if (newUsername !== urlUsername) {
        if (RESERVED_SLUGS.has(newUsername)) {
          return jsonResponse({ error: "username reserved" }, 400, corsHeaders);
        }
        if (await profileExists(env, newUsername)) {
          return jsonResponse({ error: "username taken" }, 409, corsHeaders);
        }
      }

      const parsed = ProfileSchema.parse({ ...body, username: newUsername, email: existing.email });
      const updated = {
        ...parsed,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
      await putProfile(env, updated, token, jwt.sub, newUsername !== urlUsername ? urlUsername : undefined);
      const { email: _email, ...publicProfile } = updated;
      return jsonResponse(publicProfile, 200, corsHeaders);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "invalid request";
      return jsonResponse({ error: message }, 400, corsHeaders);
    }
  }

  // POST /api/avatar — upload avatar image (requires Supabase JWT)
  if (path === "/api/avatar" && request.method === "POST") {
    const jwt = await validateSupabaseJWT(env.SUPABASE_JWT_SECRET, request.headers.get("Authorization"), FREESURF.AUTH.SUPABASE_URL);
    const username = jwt ? await getUsernameByUserId(env, jwt.sub) : null;
    if (!jwt || !username) {
      return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
    }

    const contentType = request.headers.get("Content-Type") || "";
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED_TYPES.includes(contentType)) {
      return jsonResponse({ error: "Only JPEG, PNG, WebP, and GIF images are allowed" }, 400, corsHeaders);
    }

    const body = await request.arrayBuffer();
    const MAX_SIZE = 2 * 1024 * 1024;
    if (body.byteLength > MAX_SIZE) {
      return jsonResponse({ error: "Image must be under 2 MB" }, 400, corsHeaders);
    }

    // Store image in R2
    const key = `avatars/${username}`;
    await env.AVATARS.put(key, body, { httpMetadata: { contentType } });

    // Update profile avatar URL in Supabase
    const profile = await getProfile(env, username);
    if (profile) {
      profile.avatarUrl = `/avatar/${username}`;
      profile.updatedAt = new Date().toISOString();
      const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
      await putProfile(env, profile, token, jwt.sub);
    }

    return jsonResponse({ avatarUrl: `/avatar/${username}` }, 200, corsHeaders);
  }

  return jsonResponse({ error: "not found" }, 404, corsHeaders);
}

// ---- Analytics helpers ----

async function trackView(kv: KVNamespace, username: string): Promise<void> {
  const date = new Date().toISOString().split("T")[0];
  const key = `views:${username}:${date}`;
  const current = parseInt((await kv.get(key)) ?? "0", 10);
  await kv.put(key, String(current + 1), { expirationTtl: 60 * 60 * 24 * 90 });
}

async function trackClick(
  kv: KVNamespace,
  username: string,
  linkIndex: number
): Promise<void> {
  const date = new Date().toISOString().split("T")[0];
  const key = `clicks:${username}:${linkIndex}:${date}`;
  const current = parseInt((await kv.get(key)) ?? "0", 10);
  await kv.put(key, String(current + 1), { expirationTtl: 60 * 60 * 24 * 90 });
}

// ---- Helpers ----

function jsonResponse(
  data: unknown,
  status: number,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function notFound(): Response {
  return new Response("not found", { status: 404 });
}
