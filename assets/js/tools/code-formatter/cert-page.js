// Verificador público de certificados HMAC-SHA256 (100% textContent, cero innerHTML).
const API_BASE = 'https://api.jw-solutions.com';

async function verify() {
  const statusEl = document.getElementById('cf-cert-status');
  const holderEl = document.getElementById('cf-cert-holder');
  const pathEl = document.getElementById('cf-cert-path');
  const dateEl = document.getElementById('cf-cert-date');
  const sigEl = document.getElementById('cf-cert-sig');

  const id = new URLSearchParams(window.location.search).get('id')?.trim();
  if (!id) {
    statusEl.textContent = 'Proporciona un ID de certificado (?id=JW-...)';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/academy/certificates/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) {
      statusEl.textContent = 'Certificado no encontrado o inválido.';
      return;
    }
    const data = await res.json();
    statusEl.textContent = data.valid ? `✓ Certificado Válido · ${data.cert_id}` : '✕ Firma inválida';
    holderEl.textContent = `Titular: ${data.holder_name}`;
    pathEl.textContent = `Ruta profesional: ${data.path_id}`;
    dateEl.textContent = `Emitido: ${data.issued_at}`;
    sigEl.textContent = `HMAC-SHA256: ${data.signature}`;
  } catch {
    statusEl.textContent = 'No se pudo conectar con el servicio de verificación.';
  }
}

verify();
