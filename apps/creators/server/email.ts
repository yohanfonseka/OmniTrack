import { config } from './config.js';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

/** Sends through Resend's HTTP API. */
export class ResendMailer implements Mailer {
  async send(email: OutgoingEmail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: config.email.from, ...email }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

/** Development / tests: keeps emails in memory and logs them. */
export class MemoryMailer implements Mailer {
  outbox: OutgoingEmail[] = [];
  constructor(private log = true) {}
  async send(email: OutgoingEmail) {
    this.outbox.push(email);
    if (this.log) console.log(`[email] to=${email.to} subject="${email.subject}"\n${email.text}\n`);
  }
}

export function createMailer(): Mailer {
  if (config.email.resendApiKey) return new ResendMailer();
  if (config.isProduction) throw new Error('RESEND_API_KEY is required in production.');
  console.warn('[email] RESEND_API_KEY not set; emails are printed to the console.');
  return new MemoryMailer();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** One consistent, simple layout for every email. */
function layout(to: string, subject: string, paragraphs: string[], button?: { label: string; url: string }): OutgoingEmail {
  const text = [...paragraphs, button ? `${button.label}: ${button.url}` : '', '', '— CreatorTrack · creatortrack.lk']
    .filter((l, i, a) => l !== '' || i === a.length - 2)
    .join('\n\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f1d2b">
<div style="font-weight:700;font-size:18px;color:#6d28d9;margin-bottom:20px">CreatorTrack</div>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.55;margin:0 0 14px">${escapeHtml(p)}</p>`).join('\n')}
${button ? `<p style="margin:22px 0"><a href="${escapeHtml(button.url)}" style="background:#6d28d9;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(button.label)}</a></p>` : ''}
<p style="font-size:12px;color:#77738a;margin-top:28px">CreatorTrack · creatortrack.lk</p></div>`;
  return { to, subject, text, html };
}

export const emails = {
  verify: (to: string, name: string, url: string) =>
    layout(to, 'Confirm your email for CreatorTrack', [`Hi ${name},`, 'Please confirm your email address to finish setting up your CreatorTrack account. The link is valid for 48 hours.'], { label: 'Confirm email', url }),

  reset: (to: string, url: string) =>
    layout(to, 'Reset your CreatorTrack password', ['Someone asked to reset the password for this account. If that was you, use the link below within 1 hour. If not, you can ignore this email.'], { label: 'Reset password', url }),

  invite: (to: string, name: string, url: string) =>
    layout(to, "You're invited to CreatorTrack", [`Hi ${name},`, "You're invited to join CreatorTrack, where brands find creators with verified Instagram, TikTok and YouTube stats. It's free for creators, always.", 'This invitation is valid for 14 days.'], { label: 'Join CreatorTrack', url }),

  reconnect: (to: string, name: string, platform: string, url: string) =>
    layout(to, `Please reconnect your ${platform} account`, [`Hi ${name},`, `We couldn't refresh your ${platform} stats because the connection has expired or was removed. Brands will see your last verified numbers until you reconnect.`, 'It takes less than a minute.'], { label: `Reconnect ${platform}`, url }),

  weekly: (to: string, name: string, lines: string[], url: string) =>
    layout(to, 'Your week on CreatorTrack', [`Hi ${name}, here's your week:`, ...lines.map((l) => `• ${l}`), 'You can turn these emails off in Settings.'], { label: 'Open my dashboard', url }),
};
