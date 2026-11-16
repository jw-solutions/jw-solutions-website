// Verificador público de certificados HMAC-SHA256, Diploma imprimible, LinkedIn Deep-Link y Portafolio.
// Seguridad: 100% document.createElement / createElementNS + textContent (cero innerHTML).
const API_BASE = 'https://api.jw-solutions.com';

export function buildLinkedInCertUrl(cert) {
  const issued = cert.issued_at ? new Date(cert.issued_at) : new Date();
  const year = String(issued.getUTCFullYear());
  const month = String(issued.getUTCMonth() + 1);
  const title = `JW Solutions Clean Code: ${(cert.target_slug || cert.path_id || 'Academy').toUpperCase()}`;
  const verifyUrl = cert.verify_url || `https://jw-solutions.com/tools/code-formatter/cert/?id=${encodeURIComponent(cert.cert_code || cert.cert_id || '')}`;
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: title,
    organizationName: 'JW Solutions',
    issueYear: year,
    issueMonth: month,
    certUrl: verifyUrl,
    certId: cert.cert_code || cert.cert_id || '',
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

/** Genera un código matriz QR visual determinista en SVG puro (sin innerHTML). */
export function renderQrMatrix(container, textValue) {
  if (!container || typeof document === 'undefined') return;
  container.replaceChildren();
  const size = 21;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', '96');
  svg.setAttribute('height', '96');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', textValue || 'QR');

  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(size));
  bg.setAttribute('height', String(size));
  bg.setAttribute('fill', '#ffffff');
  svg.append(bg);

  let hash = 2166136261;
  for (let i = 0; i < (textValue || '').length; i += 1) {
    hash ^= textValue.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const isFinder = (r, c) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      let dark = false;
      if (isFinder(r, c)) {
        const lr = r >= size - 7 ? r - (size - 7) : r;
        const lc = c >= size - 7 ? c - (size - 7) : c;
        dark = lr === 0 || lr === 6 || lc === 0 || lc === 6 || (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
      } else {
        const bit = ((hash >>> ((r * size + c) % 24)) ^ (r * 31 + c * 17)) & 1;
        dark = bit === 1;
      }
      if (dark) {
        const cell = document.createElementNS(ns, 'rect');
        cell.setAttribute('x', String(c));
        cell.setAttribute('y', String(r));
        cell.setAttribute('width', '1');
        cell.setAttribute('height', '1');
        cell.setAttribute('fill', '#0b0e12');
        svg.append(cell);
      }
    }
  }
  container.append(svg);
}

function renderPreviewDiploma(params) {
  const statusEl = document.getElementById('cf-cert-status');
  const holderEl = document.getElementById('cf-cert-holder');
  const pathEl = document.getElementById('cf-cert-path');
  const dateEl = document.getElementById('cf-cert-date');
  const sigEl = document.getElementById('cf-cert-sig');
  const watermarkEl = document.getElementById('cf-cert-watermark');

  const target = (params.get('tech') || params.get('target') || 'python').toUpperCase();
  const holder = params.get('holder') || 'Preview Developer';

  if (watermarkEl) {
    watermarkEl.textContent = 'VISTA PREVIA — ACTUALIZA A PRO PARA EMITIR TU CERTIFICADO OFICIAL';
    watermarkEl.hidden = false;
  }
  if (statusEl) statusEl.textContent = `Vista Previa de Certificado · ${target}`;
  if (holderEl) holderEl.textContent = `Titular: ${holder}`;
  if (pathEl) pathEl.textContent = `Especialidad: ${target}`;
  if (dateEl) dateEl.textContent = 'Estado: Solo vista previa (sin validez oficial)';
  if (sigEl) sigEl.textContent = 'HMAC-SHA256: PREVIEW-ONLY';
}

async function renderPortfolio(slug) {
  const certCard = document.getElementById('cf-cert-card');
  const section = document.getElementById('cf-portfolio-section');
  const titleEl = document.getElementById('cf-portfolio-title');
  const grid = document.getElementById('cf-portfolio-grid');
  if (!section || !grid) return;

  if (certCard) certCard.hidden = true;
  section.hidden = false;

  try {
    const res = await fetch(`${API_BASE}/api/academy/certificates/portfolio/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!res.ok) {
      if (titleEl) titleEl.textContent = 'Portafolio no encontrado.';
      return;
    }
    const data = await res.json();
    if (titleEl) titleEl.textContent = `Portafolio Verificado · ${data.holder_name}`;
    grid.replaceChildren();
    for (const c of data.certificates || []) {
      const card = document.createElement('article');
      card.className = 'cf-academy-path-card';
      const h = document.createElement('h3');
      h.className = 'cf-academy-path-card__title';
      h.textContent = `${(c.target_slug || c.path_id || '').toUpperCase()} (${c.cert_type})`;
      const meta = document.createElement('p');
      meta.className = 'cf-muted';
      meta.textContent = `${c.cert_code} · ${c.issued_at}`;
      const link = document.createElement('a');
      link.className = 'cf-btn cf-btn--small cf-btn--primary';
      link.href = `?id=${encodeURIComponent(c.cert_code)}`;
      link.textContent = 'Verificar certificado';
      card.append(h, meta, link);
      grid.append(card);
    }
  } catch {
    if (titleEl) titleEl.textContent = 'No se pudo cargar el portafolio.';
  }
}

export async function verify() {
  if (typeof document === 'undefined') return;
  const statusEl = document.getElementById('cf-cert-status');
  const holderEl = document.getElementById('cf-cert-holder');
  const pathEl = document.getElementById('cf-cert-path');
  const dateEl = document.getElementById('cf-cert-date');
  const sigEl = document.getElementById('cf-cert-sig');
  const tierBadge = document.getElementById('cf-cert-tier-badge');
  const revokedBanner = document.getElementById('cf-cert-revoked-banner');
  const qrEl = document.getElementById('cf-cert-qr');
  const printBtn = document.getElementById('cf-cert-print-btn');
  const linkedinBtn = document.getElementById('cf-cert-linkedin-btn');

  const params = new URLSearchParams(window.location.search);
  const portfolioSlug = params.get('portfolio')?.trim();
  if (portfolioSlug) {
    await renderPortfolio(portfolioSlug);
    return;
  }
  if (params.get('preview') === '1') {
    renderPreviewDiploma(params);
    return;
  }

  const id = params.get('id')?.trim();
  if (!id) {
    if (statusEl) statusEl.textContent = 'Proporciona un ID de certificado (?id=JWS-CERT-...)';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/academy/certificates/verify/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) {
      if (statusEl) statusEl.textContent = 'Certificado no encontrado o inválido.';
      return;
    }
    const data = await res.json();
    if (data.status === 'revoked') {
      if (revokedBanner) {
        revokedBanner.textContent = `CERTIFICADO REVOCADO · ${data.revoked_reason || 'Anulado oficialmente'}`;
        revokedBanner.hidden = false;
      }
      if (statusEl) statusEl.textContent = `✕ Certificado Revocado · ${data.cert_code || data.cert_id}`;
    } else {
      if (statusEl) statusEl.textContent = data.valid ? `✓ Certificado Válido · ${data.cert_code || data.cert_id}` : '✕ Firma inválida';
      if (printBtn && data.valid) {
        printBtn.hidden = false;
        printBtn.addEventListener('click', () => window.print());
      }
      if (linkedinBtn && data.valid && data.allow_linkedin_deeplink) {
        linkedinBtn.href = buildLinkedInCertUrl(data);
        linkedinBtn.hidden = false;
      }
    }

    if (tierBadge && data.plan_tier_badge) {
      tierBadge.textContent = String(data.plan_tier_badge).toUpperCase();
      tierBadge.hidden = false;
    }
    if (holderEl) holderEl.textContent = `Titular: ${data.holder_name}`;
    if (pathEl) pathEl.textContent = `Especialidad: ${(data.target_slug || data.path_id || '').toUpperCase()}`;
    if (dateEl) dateEl.textContent = `Emitido: ${data.issued_at}`;
    if (sigEl) sigEl.textContent = `HMAC-SHA256: ${data.signature_short || (data.signature || '').slice(0, 12)}`;
    if (qrEl && data.status !== 'revoked') {
      renderQrMatrix(qrEl, `https://jw-solutions.com/tools/code-formatter/cert/?id=${encodeURIComponent(data.cert_code || data.cert_id)}`);
    }
  } catch {
    if (statusEl) statusEl.textContent = 'No se pudo conectar con el servicio de verificación.';
  }
}

if (typeof document !== 'undefined' && document.getElementById('cf-cert-card')) {
  verify();
}
