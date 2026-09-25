import type { Profile } from "./schema";
import { FREESURF } from "./freesurf.config";

/** Social platform → SVG icon path (24x24 viewBox) */
const SOCIAL_ICONS: Record<string, string> = {
  twitter: `<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>`,
  x: `<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>`,
  instagram: `<rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.5"/>`,
  youtube: `<path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.4 19.6C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 001.94-2A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12z"/>`,
  tiktok: `<path d="M9 12a4 4 0 104 4V4a5 5 0 005 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  github: `<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>`,
  linkedin: `<path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/>`,
};

function socialIcon(platform: string): string {
  const path = SOCIAL_ICONS[platform.toLowerCase()];
  if (!path) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">${path}</svg>`;
}

const THEMES: Record<string, { bg: string; card: string; text: string; accent: string; link: string }> = {
  "minimal-light": { bg: "#ffffff", card: "#f5f5f5", text: "#111111", accent: "#6366f1", link: "#ffffff" },
  "minimal-dark":  { bg: "#0f0f0f", card: "#1a1a1a", text: "#f5f5f5", accent: "#818cf8", link: "#1a1a1a" },
  "bold":          { bg: "#1e1b4b", card: "#312e81", text: "#e0e7ff", accent: "#f59e0b", link: "#312e81" },
  "forest":        { bg: "#0d1f0d", card: "#1a3320", text: "#d4e8d4", accent: "#4ade80", link: "#1a3320" },
  "ocean":         { bg: "#0a1628", card: "#0f2744", text: "#d0e4f7", accent: "#38bdf8", link: "#0f2744" },
  "sunset":        { bg: "#1a0f0a", card: "#2d1a12", text: "#fce8d5", accent: "#fb923c", link: "#2d1a12" },
  "mono":          { bg: "#000000", card: "#1a1a1a", text: "#e5e5e5", accent: "#a3a3a3", link: "#1a1a1a" },
  "neon":          { bg: "#0a0a0f", card: "#12121a", text: "#e2e2f0", accent: "#06b6d4", link: "#12121a" },
};

export function renderProfilePage(profile: Profile): string {
  const t = THEMES[profile.theme] ?? THEMES["minimal-light"];

  // Migrate legacy socialLinks into links array if present
  const allLinks = [...(profile.links || [])];
  if ((profile as any).socialLinks?.length) {
    for (const s of (profile as any).socialLinks) {
      allLinks.push({ title: s.platform, url: s.url, platform: s.platform, enabled: true });
    }
  }

  const regularLinks = allLinks.filter((l) => l.enabled !== false && !l.platform);
  const socialLinks = allLinks.filter((l) => l.enabled !== false && l.platform);

  const linksHtml = regularLinks
    .map((l) => {
      const idx = allLinks.indexOf(l);
      const hasDesc = l.description && l.description.trim();
      return `<div class="link-wrapper">
        <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" class="link" data-idx="${idx}">${escapeHtml(l.title)}${hasDesc ? `<button class="link-desc-toggle" data-desc="${idx}" aria-label="More info"><span class="chevron"></span></button>` : ""}</a>
        ${hasDesc ? `<div class="link-desc" id="desc-${idx}">${escapeHtml(l.description!)}</div>` : ""}
      </div>`;
    })
    .join("\n      ");

  const socialsHtml = socialLinks
    .map(
      (s) =>
        `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="social-icon" title="${escapeHtml(s.platform!)}">${socialIcon(s.platform!) || escapeHtml(s.title)}</a>`
    )
    .join("\n        ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(profile.username)} | FreeSurf</title>
  <meta name="description" content="${escapeHtml(profile.bio || profile.displayName + " on FreeSurf Links")}">
  <meta property="og:title" content="${escapeHtml(profile.username)} | FreeSurf">
  <meta property="og:description" content="${escapeHtml(profile.bio || profile.displayName)}">
  ${profile.avatarUrl ? `<meta property="og:image" content="${FREESURF.URLS.home}/avatar/${escapeHtml(profile.username)}">` : ""}
  <meta property="og:type" content="website">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: ${t.bg};
      color: ${t.text};
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 0;
    }
    .page { max-width: 480px; width: 100%; padding: 0 1rem 3rem; }
    .topbar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1rem 0; margin-bottom: 1.5rem;
    }
    .topbar-logo {
      display: flex; align-items: center; gap: 0.4rem;
      text-decoration: none; color: ${t.text}; opacity: 0.85; font-weight: 600; font-size: 0.95rem;
      transition: opacity 0.15s;
    }
    .topbar-logo:hover { opacity: 1; }
    .topbar-logo svg { width: 22px; height: 22px; }
    .share-btn {
      background: none; border: 1px solid ${t.card};
      border-radius: 50%; width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: ${t.text}; opacity: 0.7;
      transition: opacity 0.15s, background 0.15s;
      padding: 0;
    }
    .share-btn:hover { opacity: 1; background: ${t.card}; }
    .share-btn svg { width: 16px; height: 16px; }
    .container { text-align: center; }
    .avatar {
      width: 96px; height: 96px; border-radius: 50%;
      object-fit: cover; margin-bottom: 1rem;
      box-shadow: 0 2px 16px rgba(0,0,0,0.15);
    }
    h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.15rem; }
    .at-username { font-size: 0.9rem; opacity: 0.5; margin-bottom: 0.75rem; font-weight: 400; }
    .bio { opacity: 0.78; margin-bottom: 1.25rem; font-size: 0.9rem; line-height: 1.5; }
    .socials-hdr { display: flex; justify-content: center; gap: 0.75rem; margin-bottom: 1.5rem; }
    .social-icon {
      display: flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 50%;
      background: ${t.card}; color: ${t.text};
      transition: opacity 0.15s, transform 0.15s;
      opacity: 0.75;
    }
    .social-icon:hover { opacity: 1; transform: scale(1.08); }
    .social-icon svg { width: 20px; height: 20px; }
    .link-wrapper { position: relative; margin-bottom: 0.75rem; }
    .link {
      display: block; padding: 0.875rem 1.25rem; position: relative;
      background: ${t.accent}; color: ${t.link}; text-decoration: none;
      border-radius: 8px; font-weight: 500; font-size: 1rem;
      transition: opacity 0.15s, transform 0.1s;
    }
    .link:hover { opacity: 0.85; transform: translateY(-1px); }
    .link-desc-toggle {
      position: absolute; right: 0.75rem; top: 50%;
      transform: translateY(-50%);
      background: none; border: none; color: ${t.link}; cursor: pointer;
      padding: 0.5rem; display: flex; align-items: center; justify-content: center;
      opacity: 0.5; transition: opacity 0.15s;
      z-index: 1;
    }
    .link-desc-toggle:hover { opacity: 1; }
    .link-desc-toggle.expanded .chevron { transform: rotate(225deg); margin-top: 4px; }
    .chevron {
      display: inline-block; width: 10px; height: 10px;
      border-right: 2.5px solid currentColor;
      border-bottom: 2.5px solid currentColor;
      transform: rotate(45deg); margin-top: -2px;
      transition: transform 0.2s;
    }
    .link-desc {
      display: none; padding: 0.625rem 1rem; margin-top: 0.25rem;
      background: ${t.card}; border-radius: 6px;
      font-size: 0.85rem; text-align: left; line-height: 1.5;
      opacity: 0.9;
    }
    .link-desc.open { display: block; }
    .join-btn {
      display: block; width: 100%; margin-top: 5rem; padding: 0.8rem;
      background: ${t.card}; color: ${t.text}; border: 1px solid ${t.card};
      border-radius: 8px; text-decoration: none; font-size: 0.95rem; font-weight: 500;
      text-align: center; transition: background 0.15s, border-color 0.15s;
    }
    .join-btn:hover { background: ${t.accent}; color: ${t.link}; border-color: ${t.accent}; }
    .footer { margin-top: 2rem; text-align: center; }
    .footer a { color: inherit; text-decoration: none; font-size: 0.78rem; opacity: 0.45; transition: opacity 0.15s; }
    .footer a:hover { opacity: 0.7; }
  </style>
</head>
<body>
  <div class="page">
    <div class="topbar">
      <a href="${FREESURF.URLS.links}" class="topbar-logo" title="FreeSurf Links">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </a>
      <button class="share-btn" onclick="share()" title="Share">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      </button>
    </div>
    <div class="container">
      ${profile.avatarUrl ? `<img src="/avatar/${escapeHtml(profile.username)}" alt="${escapeHtml(profile.displayName)}" class="avatar">` : ""}
      <h1>${escapeHtml(profile.displayName)}</h1>
      <p class="at-username">@${escapeHtml(profile.username)}</p>
      ${socialsHtml ? `<div class="socials-hdr">${socialsHtml}</div>` : ""}
      ${profile.bio ? `<p class="bio">${escapeHtml(profile.bio)}</p>` : ""}
      <div class="links">
        ${linksHtml}
      </div>
      <a href="${FREESURF.URLS.links}" class="join-btn">Join @${escapeHtml(profile.username)} on FreeSurf</a>
      <p class="footer">
        <a href="${FREESURF.URLS.home}/privacy">Privacy</a>
        <span style="opacity:0.25;margin:0 0.4rem;">&middot;</span>
        <a href="https://feedfree.tech" target="_blank" rel="noopener">Feedfree Digest</a>
        <span style="opacity:0.25;margin:0 0.4rem;">&middot;</span>
        <a href="${FREESURF.URLS.home}">More from FreeSurf</a>
      </p>
    </div>
  </div>
  <script>
    function share() {
      var url = '${FREESURF.URLS.home}/@${profile.username}';
      if (navigator.share) {
        navigator.share({ title: '${profile.username} | FreeSurf', url: url });
      } else {
        navigator.clipboard.writeText(url).then(function() {
          var btn = document.querySelector('.share-btn');
          btn.innerHTML = '<span style="font-size:0.7rem;font-weight:600;">Copied</span>';
          setTimeout(function() {
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
          }, 1500);
        });
      }
    }
    document.querySelectorAll('.link').forEach(function(a) {
      a.addEventListener('click', function() {
        var idx = a.getAttribute('data-idx');
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/event', JSON.stringify({
            username: '${profile.username}',
            linkIndex: parseInt(idx, 10),
            timestamp: new Date().toISOString()
          }));
        }
      });
    });
    document.querySelectorAll('.link-desc-toggle').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var idx = btn.getAttribute('data-desc');
        var desc = document.getElementById('desc-' + idx);
        var isOpen = desc.classList.contains('open');
        desc.classList.toggle('open', !isOpen);
        btn.classList.toggle('expanded', !isOpen);
      });
    });
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
