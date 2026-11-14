/** Common throwaway-email domains. Not exhaustive; blocks the obvious abuse. */
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com',
  'temp-mail.org', 'tempmail.com', 'tempmail.net', 'yopmail.com', 'yopmail.net', 'trashmail.com',
  'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mintemail.com', 'throwawaymail.com',
  'fakeinbox.com', 'mohmal.com', 'emailondeck.com', 'mailnesia.com', 'tempail.com', 'spamgourmet.com',
  'mytemp.email', 'tmpmail.org', 'tmpmail.net', 'burnermail.io', 'inboxkitten.com', 'mail.tm',
  'moakt.com', 'tempr.email', 'discard.email', 'emailfake.com', 'fakemail.net', 'trashmail.de',
  'byom.de', 'mailcatch.com', 'mailpoof.com', 'spambox.us', 'anonaddy.me', '1secmail.com',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  return !!domain && DISPOSABLE.has(domain);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}
