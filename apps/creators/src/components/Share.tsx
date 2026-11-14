import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';

function WhatsAppGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
    </svg>
  );
}

/** Copy / WhatsApp / native share sheet for one link. */
export function ShareButtons({ url, message, compact = false }: { url: string; message: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = `${message} ${url}`;
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const t = document.createElement('textarea');
      t.value = url;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary" onClick={copy}>
        {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
        {copied ? 'Copied' : compact ? 'Copy' : 'Copy link'}
      </button>
      <a className="btn-whatsapp" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
        <WhatsAppGlyph /> WhatsApp
      </a>
      {canShare && (
        <button type="button" className="btn-secondary" onClick={() => navigator.share({ text: message, url }).catch(() => {})}>
          <Share2 size={16} /> Share
        </button>
      )}
    </div>
  );
}

/** WhatsApp link to a specific phone number (for admin invites). */
export function whatsappTo(phone: string, text: string) {
  const digits = phone.replace(/[^\d]/g, '').replace(/^0/, '94');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
