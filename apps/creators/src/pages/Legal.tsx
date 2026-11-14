import { Notice } from '../components/ui';
import { Link } from '../router';

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl py-10">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <div className="prose-sm mt-6 grid gap-4 text-ink/90 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </div>
  );
}

const DRAFT = (
  <Notice kind="warn">Draft wording for review. The final text must be approved by the business owner or a lawyer before launch.</Notice>
);

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      {DRAFT}
      <h2>What we collect</h2>
      <ul>
        <li>Account details you give us: name, email address, company name (brands), and your profile (bio, categories, city).</li>
        <li>For creators who connect a platform: public profile details and statistics from Instagram, TikTok and YouTube through their official APIs: follower counts, recent posts and their likes, comments and views, and audience breakdowns where the platform provides them.</li>
        <li>Usage information, such as how often a profile is viewed and which brand accounts have opened a full report.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To show creators’ verified statistics to brands, and to give creators their own dashboard.</li>
        <li>To email you about your account (verification, password resets, reconnect reminders) and, for creators, an optional weekly summary.</li>
      </ul>
      <h2>What we never do</h2>
      <ul>
        <li>We never post to your accounts, read your messages or sell your data.</li>
        <li>We never show creators which brands viewed their report: only a count.</li>
      </ul>
      <h2>Your control</h2>
      <ul>
        <li>Disconnect a platform at any time from your dashboard; its data is deleted immediately.</li>
        <li>Delete your account from Settings; everything we hold about you is deleted. See <Link href="/data-deletion" className="underline">data deletion</Link>.</li>
      </ul>
      <h2>Contact</h2>
      <p>privacy@creatortrack.lk</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of Service">
      {DRAFT}
      <ul>
        <li>CreatorTrack is free for creators. Brands may be charged for full reports in future; any change will be announced in advance.</li>
        <li>Creators may only connect accounts they own or manage.</li>
        <li>Reports and PDFs are for the downloading brand’s own evaluation of creators and must not be redistributed.</li>
        <li>Statistics come from each platform’s API and are shown as provided; CreatorTrack does not guarantee future performance.</li>
        <li>We may hide profiles or suspend accounts that are fake, misleading or abusive.</li>
      </ul>
    </Page>
  );
}

export function DataDeletion() {
  return (
    <Page title="Deleting your data">
      <p>You can remove your data from CreatorTrack at any time:</p>
      <ul>
        <li><b>One platform:</b> sign in, open your dashboard, and press disconnect next to the platform. Its data is deleted straight away.</li>
        <li><b>Everything:</b> sign in, go to <Link href="/settings" className="underline">Settings</Link> and use “Delete my account”. Your account, profile, connected platforms and statistics are permanently deleted.</li>
        <li>You can also remove CreatorTrack’s access from inside Instagram, TikTok or your Google account settings. We stop receiving data immediately, and your profile shows its last verified date.</li>
        <li>Can’t sign in? Email privacy@creatortrack.lk from your account’s address and we’ll delete it within 30 days.</li>
      </ul>
    </Page>
  );
}

export function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link href="/" className="btn-primary mt-6">Go home</Link>
    </div>
  );
}
