// --- Config ---
const API_BASE = location.hostname === "localhost" || location.hostname === "127.0.0.1"
  ? "http://127.0.0.1:8787"
  : location.origin;

const PUBLIC_BASE = API_BASE.replace("http://127.0.0.1:8787", "http://127.0.0.1:8787");

// --- Cross-domain auth: try to restore Supabase session from shared cookie ---
import { getSharedSession, signIn, signUp, oauthSignIn, clearSharedSession } from "./freesurf-auth.js";
const sharedSession = await getSharedSession();

// --- State ---
let currentUser = null;
let sessionToken = sharedSession?.accessToken || localStorage.getItem("freesurf_session") || null;
let sessionEmail = sharedSession?.user?.email || null;

// If we got a session from the shared cookie, persist it to localStorage
if (sharedSession?.accessToken) {
  localStorage.setItem("freesurf_session", sharedSession.accessToken);
}
let currentView = "landing";
let autoSaveTimer = null;
let isSaving = false;

// --- Router ---
function navigate(view, pushState = true) {
  currentView = view;
  if (pushState) {
    const paths = { landing: "/", editor: "/editor" };
    history.pushState(null, "", paths[view] || "/");
  }
  render();
}

window.addEventListener("popstate", () => {
  const path = location.pathname;
  if (path === "/editor") navigate("editor", false);
  else navigate("landing", false);
});

// --- API helpers ---
async function apiGet(path) {
  const headers = {};
  if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, data) {
  const headers = { "Content-Type": "application/json" };
  if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`);
  return body;
}

async function apiPut(path, data) {
  const headers = { "Content-Type": "application/json" };
  if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`);
  return body;
}

// --- Render ---
function render() {
  const app = document.getElementById("app");
  switch (currentView) {
    case "landing":    app.innerHTML = renderLanding(); bindLanding(); break;
    case "editor":     app.innerHTML = renderEditor(); bindEditor(); break;
    default:           app.innerHTML = renderLanding(); bindLanding();
  }
  const yearEl = document.querySelector(".freesurf-footer-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}



// ========================
//  LANDING PAGE — email-first
// ========================
function renderLanding() {
  return `
    <header class="header">
      <div class="header-logo"><span style="color:var(--accent)">FreeSurf's</span> Link-in-Bio</div>
    </header>
    <div class="container">
      <div class="hero centered">
        <h1>Your links.<br><span>One page. Free for most users.</span></h1>
        <p>Create your link-in-bio page in seconds. No fees, no lock-in, open source.</p>

        <div class="card" style="max-width:380px;margin:0 auto;">
          <div class="auth-tabs" style="display:flex;margin-bottom:1rem;">
            <button class="auth-tab-btn active" data-tab="sign-in" style="flex:1;padding:10px;background:none;border:none;border-bottom:2px solid var(--accent);color:var(--text);font-weight:600;cursor:pointer;font-family:inherit;font-size:0.9rem;">Sign in</button>
            <button class="auth-tab-btn" data-tab="sign-up" style="flex:1;padding:10px;background:none;border:none;border-bottom:2px solid var(--border);color:var(--text-muted);font-weight:600;cursor:pointer;font-family:inherit;font-size:0.9rem;">Create account</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1rem;">
            <button type="button" id="btn-google" class="btn" style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:10px;border-radius:8px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:inherit;">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37.2 44.6 44 39.9 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
              Continue with Google
            </button>
            <button type="button" id="btn-apple" class="btn" style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:10px;border-radius:8px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:inherit;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Continue with Apple
            </button>
            <div style="text-align:center;color:var(--text-muted);font-size:0.85rem;margin:2px 0;">or</div>
          </div>
          <form id="auth-form">
            <div class="form-group">
              <input type="email" id="auth-email" class="form-input" placeholder="Email" autocomplete="email" required>
            </div>
            <div class="form-group" style="position:relative;">
              <input type="password" id="auth-password" class="form-input" placeholder="Password" autocomplete="current-password" required minlength="6" style="padding-right:40px;">
              <button type="button" id="toggle-password" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;">
                <svg id="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
            <div id="auth-feedback" style="font-size:0.85rem;min-height:1.2em;margin-bottom:0.75rem;"></div>
            <button type="submit" id="auth-submit" class="btn btn-primary btn-block" style="padding:10px;">Sign in</button>
          </form>
        </div>
      </div>

      <div class="features">
        <div class="card feature">
          <div class="feature-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
          <h3>Instant Pages</h3>
          <p>Your page loads in milliseconds from the edge. No spinners, no delays.</p>
        </div>
        <div class="card feature">
          <div class="feature-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><path d="M17.5 10.5a5 5 0 0 0-10 0"/><circle cx="8.5" cy="14" r="2.5"/><path d="M12.5 17.5a5 5 0 0 0-8 0"/><circle cx="17" cy="15.5" r="2"/><path d="M20 19a4 4 0 0 0-6 0"/></svg></div>
          <h3>Clean Themes</h3>
          <p>Minimal light, dark, and bold themes. Your content is the focus.</p>
        </div>
        <div class="card feature">
          <div class="feature-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
          <h3>Simple Analytics</h3>
          <p>See who's clicking your links. No cookies, no creepy tracking.</p>
        </div>
        <div class="card feature">
          <div class="feature-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg></div>
          <h3>Open Source</h3>
          <p>GNU licensed. Self-host it. Fork it. Own your data completely.</p>
        </div>
      </div>

      <footer class="freesurf-footer">
        <div class="freesurf-footer-inner">
          <div class="freesurf-footer-brand">
            <a href="https://freesurf.tools" class="freesurf-footer-logo">FreeSurf</a>
            <p class="freesurf-footer-tagline">Free tools for freelancers & small businesses. No commissions, no lock-in, open source.</p>
          </div>
          <div class="freesurf-footer-links">
            <div class="freesurf-footer-col">
              <span class="freesurf-footer-heading">Newsletter</span>
              <a href="https://feedfree.tech" target="_blank" rel="noopener">Feedfree Digest</a>
            </div>
            <div class="freesurf-footer-col">
              <span class="freesurf-footer-heading">Free tools</span>
              <a href="https://invoices.freesurf.tools">Invoices</a>
              <a href="https://links.freesurf.tools">Links</a>
              <a href="https://post.freesurf.tools">Post</a>
              <a href="https://transcribe.freesurf.tools">Meeting Transcriber</a>
              <a href="https://calories.freesurf.tools">Calorie Tracker</a>
            </div>
            <div class="freesurf-footer-col">
              <span class="freesurf-footer-heading">Platform</span>
              <a href="https://freesurf.tools">Home</a>
              <a href="https://github.com/freesurf-ecosystem">GitHub</a>
            </div>
            <div class="freesurf-footer-col">
              <span class="freesurf-footer-heading">Legal</span>
              <a href="https://freesurf.tools/privacy">Privacy</a>
              <a href="https://freesurf.tools/terms">Terms</a>
              <a href="mailto:hello@freesurf.tools">Contact</a>
            </div>
          </div>
        </div>
        <div class="freesurf-footer-bottom">
          <span>&copy; <span class="freesurf-footer-year"></span> FreeSurf. Built for independent workers.</span>
          <span>Part of the FreeSurf ecosystem of free tools.</span>
        </div>
      </footer>
    </div>
  `;
}

let authMode = "sign-in";

function bindLanding() {
  // Reset auth mode on re-render
  authMode = "sign-in";
  const toggleBtn = document.getElementById("toggle-password");
  const pwdInput = document.getElementById("auth-password");
  const eyeIcon = document.getElementById("eye-icon");
  if (toggleBtn && pwdInput && eyeIcon) {
    toggleBtn.addEventListener("click", () => {
      const isHidden = pwdInput.type === "password";
      pwdInput.type = isHidden ? "text" : "password";
      eyeIcon.innerHTML = isHidden
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    });
  }

  document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      authMode = btn.dataset.tab;
      document.querySelectorAll(".auth-tab-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.style.borderBottomColor = b === btn ? "var(--accent)" : "var(--border)";
        b.style.color = b === btn ? "var(--text)" : "var(--text-muted)";
      });
      const submitBtn = document.getElementById("auth-submit");
      if (submitBtn) submitBtn.textContent = authMode === "sign-in" ? "Sign in" : "Create account";
      const feedback = document.getElementById("auth-feedback");
      if (feedback) { feedback.textContent = ""; feedback.style.color = ""; }
    });
  });

  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const submitBtn = document.getElementById("auth-submit");
    const feedback = document.getElementById("auth-feedback");

    if (!email || !password) {
      feedback.textContent = "Email and password are required.";
      feedback.style.color = "var(--danger)";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = authMode === "sign-in" ? "Signing in..." : "Creating account...";
    feedback.textContent = "";

    try {
      if (authMode === "sign-in") {
        const result = await signIn(email, password);
        if (result) {
          sessionToken = result.accessToken;
          if (result.user?.email) sessionEmail = result.user.email;
          localStorage.setItem("freesurf_session", result.accessToken);
          loadProfileOrEditor();
        }
      } else {
        const result = await signUp(email, password);
        if (result) {
          sessionToken = result.accessToken;
          if (result.user?.email) sessionEmail = result.user.email;
          localStorage.setItem("freesurf_session", result.accessToken);
          loadProfileOrEditor();
        } else {
          feedback.textContent = "Check your email to confirm your account.";
          feedback.style.color = "var(--success)";
          submitBtn.disabled = false;
          submitBtn.textContent = "Create account";
        }
      }
    } catch (err) {
      feedback.textContent = err.message || "Authentication failed.";
      feedback.style.color = "var(--danger)";
      submitBtn.disabled = false;
      submitBtn.textContent = authMode === "sign-in" ? "Sign in" : "Create account";
    }
  });

  // OAuth buttons (Google / Apple) — full-page redirect handled by Supabase.
  ["btn-google", "btn-apple"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const provider = id === "btn-google" ? "google" : "apple";
      const fb = document.getElementById("auth-feedback");
      try {
        await oauthSignIn(provider);
      } catch (err) {
        if (fb) { fb.textContent = err.message || `${provider} sign-in failed.`; fb.style.color = "var(--danger)"; }
      }
    });
  });
}

async function loadProfileOrEditor() {
  try {
    const result = await apiGet("/api/auth/me");
    if (result.needsSetup) {
      sessionEmail = result.email;
      currentUser = null;
    } else {
      currentUser = result;
    }
    navigate("editor");
  } catch {
    // Go to editor even if auth/me fails — let user create profile
    navigate("editor");
  }
}



// ========================
//  PROFILE EDITOR (handles both new + existing users)
// ========================
let usernameCheckTimer = null;
let lastCheckedUsername = "";
let usernameAvailable = false;

function renderEditor() {
  const isNewUser = !currentUser;
  const profile = currentUser || { displayName: "", bio: "", avatarUrl: "", theme: "minimal-dark", links: [] };
  const publicUrl = currentUser?.username ? `https://freesurf.tools/@${currentUser.username}` : null;
  const displayUrl = currentUser?.username ? `freesurf.tools/@${currentUser.username}` : null;

  const PLATFORM_LABELS = { twitter: "Twitter / X", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", github: "GitHub", linkedin: "LinkedIn" };

  const linksHtml = (profile.links || []).map((link, i) => {
    const isFirst = i === 0;
    const isLast = i === (profile.links.length - 1);
    const platformLabel = link.platform ? (PLATFORM_LABELS[link.platform] || link.platform) : "";
    return `
    <div class="link-item-wrapper" data-index="${i}">
      <div class="link-item">
        <div class="link-reorder">
          <button class="reorder-btn" data-move-up="${i}" ${isFirst ? "disabled" : ""} title="Move up">&#9650;</button>
          <button class="reorder-btn" data-move-down="${i}" ${isLast ? "disabled" : ""} title="Move down">&#9660;</button>
        </div>
        <div class="link-item-content">
          <div class="link-item-title">${escapeHtml(link.title)}${platformLabel ? ` <span class="link-platform-badge">${escapeHtml(platformLabel)}</span>` : ""}</div>
          <div class="link-item-url">${escapeHtml(link.url)}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" ${link.enabled !== false ? "checked" : ""} data-toggle="${i}">
          <span class="toggle-slider"></span>
        </label>
        <button class="link-edit-btn" data-expand="${i}" title="Edit link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 20 14"/><path d="M15 9h.01"/><path d="M17.8 6.2 20 4"/><path d="m3 21 9-9"/><path d="M12.2 6.2 10 4"/></svg></button>
        <button class="btn btn-danger btn-sm" data-delete="${i}">✕</button>
      </div>
      <div class="link-edit-panel" id="link-edit-${i}" style="display:none;">
        <input type="text" class="form-input" data-edit-title="${i}" value="${escapeAttr(link.title)}" placeholder="Link title" maxlength="100">
        <input type="url" class="form-input" data-edit-url="${i}" value="${escapeAttr(link.url)}" placeholder="https://...">
        <textarea class="form-input" data-edit-desc="${i}" placeholder="Description (optional — shown as expandable on your page)" maxlength="500" rows="2" style="resize:vertical;min-height:50px;">${escapeHtml(link.description || "")}</textarea>
        <select class="form-select" data-edit-platform="${i}">
          <option value="">No platform (regular link)</option>
          <option value="twitter" ${link.platform === "twitter" ? "selected" : ""}>Twitter / X</option>
          <option value="instagram" ${link.platform === "instagram" ? "selected" : ""}>Instagram</option>
          <option value="youtube" ${link.platform === "youtube" ? "selected" : ""}>YouTube</option>
          <option value="tiktok" ${link.platform === "tiktok" ? "selected" : ""}>TikTok</option>
          <option value="github" ${link.platform === "github" ? "selected" : ""}>GitHub</option>
          <option value="linkedin" ${link.platform === "linkedin" ? "selected" : ""}>LinkedIn</option>
        </select>
      </div>
    </div>
  `}).join("");

  return `
    <header class="header">
      <a href="/" class="header-logo" id="nav-home"><span style="color:var(--accent)">FreeSurf's</span> Link-in-Bio</a>
      <nav class="header-nav">
        ${currentUser ? `<a href="${publicUrl.startsWith("http") ? publicUrl : "https://" + publicUrl}" target="_blank" class="btn btn-secondary btn-sm">View Page</a>` : ""}
        <button class="btn btn-secondary btn-sm" id="logout-btn">Log out</button>
      </nav>
    </header>
    <div class="container">
      ${isNewUser ? `
        <h2 style="margin-bottom: 0.25rem;">Set up your page</h2>
        <p style="color:var(--text-muted); margin-bottom: 1.5rem;">Choose a URL and fill in your details below.</p>
      `       : `
        <div class="url-bar">
          <span class="url-bar-link">${escapeHtml(displayUrl)}</span>
          <button class="btn btn-sm btn-secondary" id="copy-url">Copy</button>
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label class="form-label">Your URL / handle</label>
          <div class="claim-form" style="margin-bottom:0;">
            <div class="claim-prefix">freesurf.tools/@</div>
            <input type="text" class="form-input" id="edit-username" value="${escapeAttr(profile.username)}" maxlength="30" style="border-radius:0 var(--radius) var(--radius) 0;">
          </div>
          <p id="username-status" style="font-size:0.8rem; margin-top:0.35rem; min-height:1.2em;">&nbsp;</p>
        </div>
      `}

      <div id="save-status"></div>

      ${isNewUser ? `
        <!-- Username claim (new users only) -->
        <div class="form-group">
          <label class="form-label">Choose your URL</label>
          <div class="claim-form" style="margin-bottom:0;">
            <div class="claim-prefix">freesurf.tools/@</div>
            <input type="text" class="form-input" id="edit-username" placeholder="yourname" maxlength="30" style="border-radius:0 var(--radius) var(--radius) 0;">
          </div>
          <p id="username-status" style="font-size:0.8rem; margin-top:0.35rem; min-height:1.2em;">&nbsp;</p>
        </div>
      ` : ""}

      <!-- Profile Details -->
      <p class="section-title">Profile</p>
      <div class="form-group">
        <label class="form-label">Display Name</label>
        <input type="text" class="form-input" id="edit-name" value="${escapeAttr(profile.displayName)}" maxlength="100" placeholder="Jane Doe">
      </div>
      <div class="form-group">
        <label class="form-label">Bio</label>
        <textarea class="form-textarea" id="edit-bio" maxlength="500" rows="2" placeholder="Designer & content creator">${escapeHtml(profile.bio || "")}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Photo</label>
        <div class="avatar-upload" style="display:flex; align-items:center; gap:1rem;">
          ${profile.avatarUrl
            ? `<img src="${escapeAttr(API_BASE + profile.avatarUrl)}" class="avatar-preview" style="width:56px;height:56px;border-radius:50%;object-fit:cover;">`
            : `<div class="avatar-preview" style="width:56px;height:56px;border-radius:50%;background:var(--card);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.8rem;">No photo</div>`}
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
            Upload
            <input type="file" id="edit-avatar" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none;">
          </label>
          <span id="avatar-status" style="font-size:0.8rem;color:var(--text-muted);"></span>
        </div>
      </div>

      <!-- Theme -->
      <p class="section-title">Theme</p>
      <div class="theme-options" style="margin-bottom:1.5rem;">
        <div class="theme-option theme-light ${profile.theme === "minimal-light" ? "active" : ""}" data-theme="minimal-light">Light</div>
        <div class="theme-option theme-dark ${profile.theme === "minimal-dark" ? "active" : ""}" data-theme="minimal-dark">Dark</div>
        <div class="theme-option theme-bold ${profile.theme === "bold" ? "active" : ""}" data-theme="bold">Bold</div>
        <div class="theme-option theme-forest ${profile.theme === "forest" ? "active" : ""}" data-theme="forest">Forest</div>
        <div class="theme-option theme-ocean ${profile.theme === "ocean" ? "active" : ""}" data-theme="ocean">Ocean</div>
        <div class="theme-option theme-sunset ${profile.theme === "sunset" ? "active" : ""}" data-theme="sunset">Sunset</div>
        <div class="theme-option theme-mono ${profile.theme === "mono" ? "active" : ""}" data-theme="mono">Mono</div>
        <div class="theme-option theme-neon ${profile.theme === "neon" ? "active" : ""}" data-theme="neon">Neon</div>
      </div>

      <!-- Links -->
      <p class="section-title">Links</p>
      <div id="links-list">
        ${linksHtml || '<p style="color:var(--text-muted); font-size:0.9rem;">No links yet. Add one below.</p>'}
      </div>

      <div class="card" style="margin-top:0.75rem; margin-bottom:1.5rem;">
        <div class="form-group" style="margin-bottom:0.5rem;">
          <input type="text" class="form-input" id="new-link-title" placeholder="Link title" maxlength="100">
        </div>
        <div class="form-group" style="margin-bottom:0.5rem;">
          <input type="url" class="form-input" id="new-link-url" placeholder="https://...">
        </div>
        <div class="form-group" style="margin-bottom:0.5rem;">
          <textarea class="form-input" id="new-link-desc" placeholder="Description (optional)" maxlength="500" rows="2" style="resize:vertical;min-height:50px;"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:0.5rem;">
          <select class="form-select" id="new-link-platform">
            <option value="">Regular link</option>
            <option value="twitter">Twitter / X</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="github">GitHub</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </div>
        <button class="btn btn-secondary btn-sm" id="add-link-btn">+ Add Link</button>
      </div>

      <!-- Save -->
      <button class="btn btn-primary btn-block" id="save-btn" style="margin-bottom:2rem;">${isNewUser ? "Create My Page" : "Save Changes"}</button>

      <footer class="freesurf-footer">
        <div class="freesurf-footer-inner">
          <div class="freesurf-footer-brand">
            <a href="https://freesurf.tools" class="freesurf-footer-logo">FreeSurf</a>
            <p class="freesurf-footer-tagline">Free tools for freelancers & small businesses. No commissions, no lock-in, open source.</p>
          </div>
          <div class="freesurf-footer-links">
            <div class="freesurf-footer-col">
              <span class="freesurf-footer-heading">Newsletter</span>
              <a href="https://feedfree.tech" target="_blank" rel="noopener">Feedfree Digest</a>
            </div>
            <div class="freesurf-footer-col">
              <span class="freesurf-footer-heading">Free tools</span>
              <a href="https://invoices.freesurf.tools">Invoices</a>
              <a href="https://links.freesurf.tools">Links</a>
              <a href="https://post.freesurf.tools">Post</a>
              <a href="https://transcribe.freesurf.tools">Meeting Transcriber</a>
              <a href="https://calories.freesurf.tools">Calorie Tracker</a>
            </div>
            <div class="freesurf-footer-col">
              <span class="freesurf-footer-heading">Platform</span>
              <a href="https://freesurf.tools">Home</a>
              <a href="https://github.com/freesurf-ecosystem">GitHub</a>
            </div>
            <div class="freesurf-footer-col">
              <span class="freesurf-footer-heading">Legal</span>
              <a href="https://freesurf.tools/privacy">Privacy</a>
              <a href="https://freesurf.tools/terms">Terms</a>
              <a href="mailto:hello@freesurf.tools">Contact</a>
            </div>
          </div>
        </div>
        <div class="freesurf-footer-bottom">
          <span>&copy; <span class="freesurf-footer-year"></span> FreeSurf. Built for independent workers.</span>
          <span>Part of the FreeSurf ecosystem of free tools.</span>
        </div>
      </footer>
    </div>
  `;
}

function bindEditor() {
  const isNewUser = !currentUser;

  document.getElementById("nav-home").addEventListener("click", (e) => {
    e.preventDefault();
    navigate("landing");
  });

  // Copy URL (existing users only)
  const copyBtn = document.getElementById("copy-url");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const url = `https://freesurf.tools/@${currentUser.username}`;
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000);
      });
    });
  }

  // Avatar file upload
  const avatarInput = document.getElementById("edit-avatar");
  if (avatarInput) {
    avatarInput.addEventListener("change", async () => {
      const file = avatarInput.files[0];
      if (!file) return;
      const statusEl = document.getElementById("avatar-status");
      if (file.size > 2 * 1024 * 1024) {
        statusEl.textContent = "Image must be under 2 MB";
        statusEl.style.color = "#ef4444";
        return;
      }
      statusEl.textContent = "Uploading...";
      statusEl.style.color = "var(--text-muted)";
      try {
        const res = await fetch(`${API_BASE}/api/avatar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": file.type },
          body: file,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        if (currentUser) currentUser.avatarUrl = data.avatarUrl;
        // Update the preview
        const preview = document.querySelector(".avatar-preview");
        if (preview) {
          const img = document.createElement("img");
          img.src = `${API_BASE}${data.avatarUrl}?t=${Date.now()}`;
          img.className = "avatar-preview";
          img.style.cssText = "width:56px;height:56px;border-radius:50%;object-fit:cover;";
          preview.replaceWith(img);
        }
        statusEl.textContent = "Uploaded!";
        statusEl.style.color = "#22c55e";
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.style.color = "#ef4444";
      }
    });
  }

  // Username availability check (new users + handle changes for existing users)
  const usernameInput = document.getElementById("edit-username");
  if (usernameInput) {
    usernameAvailable = false;
    usernameInput.addEventListener("input", () => {
      usernameInput.value = usernameInput.value.toLowerCase().replace(/[^a-z0-9._-]/g, "");
      const val = usernameInput.value;
      const statusEl = document.getElementById("username-status");

      // Existing user keeping their current handle is fine.
      if (currentUser && val === currentUser.username) {
        usernameAvailable = true;
        statusEl.textContent = "\u2713 current handle";
        statusEl.style.color = "var(--success)";
        return;
      }

      if (val.length < 3) {
        statusEl.textContent = val.length > 0 ? "Must be at least 3 characters" : " ";
        statusEl.style.color = "var(--text-muted)";
        usernameAvailable = false;
        return;
      }

      statusEl.textContent = "Checking...";
      statusEl.style.color = "var(--text-muted)";
      usernameAvailable = false;

      clearTimeout(usernameCheckTimer);
      usernameCheckTimer = setTimeout(() => checkUsername(val, statusEl), 350);
    });
  }

  // Theme selection
  document.querySelectorAll("[data-theme]").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll("[data-theme]").forEach((e) => e.classList.remove("active"));
      el.classList.add("active");
      if (currentUser) { currentUser.theme = el.dataset.theme; scheduleAutoSave(); }
    });
  });

  // Auto-save on name/bio change (debounced)
  const nameInput = document.getElementById("edit-name");
  if (nameInput && !isNewUser) nameInput.addEventListener("input", () => scheduleAutoSave());
  const bioInput = document.getElementById("edit-bio");
  if (bioInput && !isNewUser) bioInput.addEventListener("input", () => scheduleAutoSave());

  // Expand/collapse link edit panels
  document.querySelectorAll("[data-expand]").forEach((el) => {
    el.addEventListener("click", () => {
      const i = el.dataset.expand;
      const panel = document.getElementById(`link-edit-${i}`);
      const isOpen = panel.style.display !== "none";
      panel.style.display = isOpen ? "none" : "flex";
      el.classList.toggle("expanded", !isOpen);
    });
  });

  // Inline edit link title/url
  document.querySelectorAll("[data-edit-title]").forEach((el) => {
    el.addEventListener("input", () => {
      if (!currentUser) return;
      const i = parseInt(el.dataset.editTitle);
      currentUser.links[i].title = el.value;
      // Update the displayed title
      const wrapper = el.closest(".link-item-wrapper");
      const titleEl = wrapper.querySelector(".link-item-title");
      if (titleEl) {
        const badge = currentUser.links[i].platform ? ` <span class="link-platform-badge">${escapeHtml({"twitter":"Twitter / X","instagram":"Instagram","youtube":"YouTube","tiktok":"TikTok","github":"GitHub","linkedin":"LinkedIn"}[currentUser.links[i].platform] || currentUser.links[i].platform)}</span>` : "";
        titleEl.innerHTML = escapeHtml(el.value) + badge;
      }
      scheduleAutoSave();
    });
  });
  document.querySelectorAll("[data-edit-url]").forEach((el) => {
    el.addEventListener("input", () => {
      if (!currentUser) return;
      const i = parseInt(el.dataset.editUrl);
      currentUser.links[i].url = el.value;
      // Update the displayed url
      const wrapper = el.closest(".link-item-wrapper");
      const urlEl = wrapper.querySelector(".link-item-url");
      if (urlEl) urlEl.textContent = el.value;
      scheduleAutoSave();
    });
  });

  // Inline edit description
  document.querySelectorAll("[data-edit-desc]").forEach((el) => {
    el.addEventListener("input", () => {
      if (!currentUser) return;
      const i = parseInt(el.dataset.editDesc);
      currentUser.links[i].description = el.value || undefined;
      scheduleAutoSave();
    });
  });

  // Inline edit platform
  document.querySelectorAll("[data-edit-platform]").forEach((el) => {
    el.addEventListener("change", () => {
      if (!currentUser) return;
      const i = parseInt(el.dataset.editPlatform);
      const val = el.value || undefined;
      currentUser.links[i].platform = val;
      // If platform selected and title was empty or was old platform name, auto-fill
      const labels = {"twitter":"Twitter / X","instagram":"Instagram","youtube":"YouTube","tiktok":"TikTok","github":"GitHub","linkedin":"LinkedIn"};
      const titleInput = document.querySelector(`[data-edit-title="${i}"]`);
      const oldTitle = currentUser.links[i].title;
      const oldLabels = Object.values(labels);
      if (val && (!oldTitle || oldLabels.includes(oldTitle))) {
        const newTitle = labels[val] || val;
        currentUser.links[i].title = newTitle;
        if (titleInput) titleInput.value = newTitle;
      }
      autoSaveNow(); // save immediately + re-render
      render();
    });
  });

  // Reorder links
  document.querySelectorAll("[data-move-up]").forEach((el) => {
    el.addEventListener("click", () => {
      if (!currentUser) return;
      const i = parseInt(el.dataset.moveUp);
      if (i < 1) return;
      const links = currentUser.links;
      [links[i - 1], links[i]] = [links[i], links[i - 1]];
      autoSaveNow();
      render();
    });
  });
  document.querySelectorAll("[data-move-down]").forEach((el) => {
    el.addEventListener("click", () => {
      if (!currentUser) return;
      const i = parseInt(el.dataset.moveDown);
      if (i >= currentUser.links.length - 1) return;
      const links = currentUser.links;
      [links[i], links[i + 1]] = [links[i + 1], links[i]];
      autoSaveNow();
      render();
    });
  });

  // Toggle link enabled
  document.querySelectorAll("[data-toggle]").forEach((el) => {
    el.addEventListener("change", () => {
      if (!currentUser) return;
      const i = parseInt(el.dataset.toggle);
      currentUser.links[i].enabled = el.checked;
      autoSaveNow();
    });
  });

  // Delete link
  document.querySelectorAll("[data-delete]").forEach((el) => {
    el.addEventListener("click", () => {
      if (!currentUser) return;
      const i = parseInt(el.dataset.delete);
      currentUser.links.splice(i, 1);
      autoSaveNow();
      render();
    });
  });

  // Add link (works for both new and existing users)
  document.getElementById("add-link-btn").addEventListener("click", () => {
    const title = document.getElementById("new-link-title").value.trim();
    const url = document.getElementById("new-link-url").value.trim();
    const desc = document.getElementById("new-link-desc").value.trim();
    const platform = document.getElementById("new-link-platform").value || undefined;
    if (!url) return;
    const labels = {"twitter":"Twitter / X","instagram":"Instagram","youtube":"YouTube","tiktok":"TikTok","github":"GitHub","linkedin":"LinkedIn"};
    const finalTitle = title || (platform ? (labels[platform] || platform) : "");
    if (!finalTitle) return;
    if (!currentUser) {
      currentUser = { displayName: "", bio: "", avatarUrl: "", theme: "minimal-dark", links: [] };
    }
    currentUser.links = currentUser.links || [];
    const newLink = { title: finalTitle, url, enabled: true };
    if (platform) newLink.platform = platform;
    if (desc) newLink.description = desc;
    currentUser.links.push(newLink);
    autoSaveNow();
    render();
  });

  // Save / Create
  document.getElementById("save-btn").addEventListener("click", isNewUser ? handleCreate : handleSave);

  // Logout
  document.getElementById("logout-btn").addEventListener("click", async () => {
    const { clearSharedSession } = await import("./freesurf-auth.js");
    await clearSharedSession();
    sessionToken = null;
    currentUser = null;
    sessionEmail = null;
    localStorage.removeItem("freesurf_session");
    navigate("landing");
  });
}

async function checkUsername(username, statusEl) {
  if (username === lastCheckedUsername) return;
  lastCheckedUsername = username;

  try {
    const res = await apiGet(`/api/username/check/${username}`);
    const input = document.getElementById("edit-username");
    if (!input || input.value !== username) return;

    if (res.available) {
      statusEl.textContent = "\u2713 freesurf.tools/@" + username + " is available!";
      statusEl.style.color = "var(--success)";
      usernameAvailable = true;
    } else {
      statusEl.textContent = res.reason === "reserved" ? "This name is reserved" : "Already taken";
      statusEl.style.color = "var(--danger)";
      usernameAvailable = false;
    }
  } catch {
    statusEl.textContent = "Could not check availability";
    statusEl.style.color = "var(--danger)";
    usernameAvailable = false;
  }
}

async function handleCreate() {
  const btn = document.getElementById("save-btn");
  const statusEl = document.getElementById("save-status");
  statusEl.innerHTML = "";

  const username = document.getElementById("edit-username")?.value.trim();
  const displayName = document.getElementById("edit-name").value.trim();
  const bio = document.getElementById("edit-bio").value.trim();
  const activeTheme = document.querySelector("[data-theme].active");
  const theme = activeTheme ? activeTheme.dataset.theme : "minimal-dark";

  if (!username || username.length < 3) {
    statusEl.innerHTML = '<div class="alert alert-error">Please choose a username (at least 3 characters)</div>';
    return;
  }

  if (!usernameAvailable) {
    statusEl.innerHTML = '<div class="alert alert-error">Please choose an available username</div>';
    return;
  }

  if (!displayName) {
    statusEl.innerHTML = '<div class="alert alert-error">Display name is required</div>';
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creating...";

  // Gather links that may have been added before creating
  const links = currentUser?.links || [];

  try {
    const now = new Date().toISOString();
    const result = await apiPost("/api/profile", {
      username,
      displayName,
      bio,
      avatarUrl: currentUser?.avatarUrl || undefined,
      theme,
      links,
      createdAt: now,
      updatedAt: now,
    });

    currentUser = result;
    sessionEmail = null;
    statusEl.innerHTML = '<div class="alert alert-success">Your page is live! \ud83c\udf89</div>';
    // Re-render to switch to the existing-user editor view
    render();
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    btn.disabled = false;
    btn.textContent = "Create My Page";
  }
}

function scheduleAutoSave() {
  if (!currentUser || !currentUser.username) return; // only for existing users
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => doAutoSave(), 1000);
}

function autoSaveNow() {
  if (!currentUser || !currentUser.username) return;
  clearTimeout(autoSaveTimer);
  doAutoSave();
}

async function doAutoSave() {
  if (!currentUser || !currentUser.username || isSaving) return;
  isSaving = true;
  const statusEl = document.getElementById("save-status");
  const btn = document.getElementById("save-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">Saving...</span>';

  // Sync name/bio from inputs if they exist
  const nameEl = document.getElementById("edit-name");
  const bioEl = document.getElementById("edit-bio");
  if (nameEl) currentUser.displayName = nameEl.value.trim();
  if (bioEl) currentUser.bio = bioEl.value.trim();

  try {
    const updated = await apiPut(`/api/profile/${currentUser.username}`, currentUser);
    currentUser = updated;
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--success);font-size:0.85rem;">\u2713 Saved</span>';
    if (btn) { btn.disabled = false; btn.textContent = "Save Changes"; }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = "Save Changes"; }
  }
  isSaving = false;
}

async function handleSave() {
  const btn = document.getElementById("save-btn");
  const statusEl = document.getElementById("save-status");
  btn.disabled = true;
  btn.textContent = "Saving...";
  statusEl.innerHTML = "";

  currentUser.displayName = document.getElementById("edit-name").value.trim();
  currentUser.bio = document.getElementById("edit-bio").value.trim();

  // Handle change (the landing page slug). PUT to the OLD username so the backend
  // renames (deletes old row + inserts new), and keep availability validated.
  const oldUsername = currentUser.username;
  const newUsername = (document.getElementById("edit-username")?.value.trim() || oldUsername);
  const renamed = newUsername !== oldUsername;
  if (renamed) {
    if (newUsername.length < 3 || !/^[a-z0-9._-]+$/.test(newUsername)) {
      statusEl.innerHTML = '<div class="alert alert-error">Handle must be 3-30 chars: lowercase letters, numbers, . _ -</div>';
      btn.disabled = false;
      btn.textContent = "Save Changes";
      return;
    }
    if (!usernameAvailable) {
      statusEl.innerHTML = '<div class="alert alert-error">Please choose an available handle</div>';
      btn.disabled = false;
      btn.textContent = "Save Changes";
      return;
    }
    currentUser.username = newUsername;
  }

  try {
    const updated = await apiPut(`/api/profile/${oldUsername}`, currentUser);
    currentUser = updated;
    if (renamed) {
      render();
      return;
    }
    statusEl.innerHTML = '<div class="alert alert-success">Saved!</div>';
    btn.disabled = false;
    btn.textContent = "Save Changes";
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    btn.disabled = false;
    btn.textContent = "Save Changes";
  }
}

// --- Load existing profile ---
async function loadProfile(username) {
  try {
    const profile = await apiGet(`/api/profile/${username}`);
    // Migrate legacy socialLinks into unified links array
    if (profile.socialLinks && profile.socialLinks.length) {
      profile.links = profile.links || [];
      for (const s of profile.socialLinks) {
        profile.links.push({ title: s.platform, url: s.url, platform: s.platform, enabled: true });
      }
      delete profile.socialLinks;
    }
    currentUser = profile;
    navigate("editor");
  } catch (err) {
    alert(`Could not load profile: ${err.message}`);
  }
}

// --- Helpers ---
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Init ---
(async () => {
  const path = location.pathname;

  // Try to restore session from stored token
  if (sessionToken && !currentUser) {
    try {
      const result = await apiGet("/api/auth/me");
      if (result.needsSetup) {
        sessionEmail = result.email;
        currentUser = null;
        navigate("editor", false);
        return;
      }
      currentUser = result;
      navigate("editor", false);
      return;
    } catch {
      sessionToken = null;
      localStorage.removeItem("freesurf_session");
    }
  }

  if (path === "/editor" && !currentUser && !sessionToken) navigate("landing", false);
  else if (path === "/editor") navigate("editor", false);
  else navigate("landing", false);
})();
