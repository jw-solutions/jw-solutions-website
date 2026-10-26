// Acciones rápidas: toast, copiar, descargar, copiar como Markdown.
import { LANG_EXT } from './detect.js';
import { t } from './i18n.js';

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('cf-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('cf-toast--show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('cf-toast--show'), 2200);
}

export async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    // Con un <dialog> modal abierto, el resto del documento es inerte: el campo temporal debe vivir dentro del diálogo.
    (document.querySelector('dialog[open]') || document.body).appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('clipboard');
  }
}

export async function copyCode(code) {
  if (!code.trim()) return toast(t('noCode'));
  try { await writeClipboard(code); toast(t('copied')); } catch { toast(t('copyFail')); }
}

export function downloadText(text, name, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCode(code, lang) {
  if (!code.trim()) return toast(t('noCodeDl'));
  const name = `codigo.${LANG_EXT[lang] || 'txt'}`;
  downloadText(code, name);
  toast(t('downloaded', { name }));
}

export function toMarkdown(code, lang) {
  const longest = Math.max(2, ...(code.match(/`+/g) || []).map((s) => s.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${lang || ''}\n${code.replace(/\n$/, '')}\n${fence}\n`;
}

export async function copyMarkdown(code, lang) {
  if (!code.trim()) return toast(t('noCode'));
  try { await writeClipboard(toMarkdown(code, lang)); toast(t('mdCopied')); } catch { toast(t('copyFail')); }
}
