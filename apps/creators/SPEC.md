# CreatorTrack — Product Spec (Iterations 1 & 2)

**Status:** Draft for approval
**Website:** creatortrack.lk
**Lives in:** the OmniTrack repo at `apps/creators/`, as a separate app with its own users, database (Firestore) and Cloud Run service. Nothing is shared with the OmniTrack agency app's data or logins.

## Principles

- **Free for creators, always.** Brands are the only paying side.
- **Verified data only.** Stats come from each platform's official API after the creator connects their account, never from scraping or screenshots.
- **Low running cost.** Official APIs are free; hosting scales to zero when idle.
- **Built for the next iteration.** Iteration 1 records every brand report view so Iteration 2 only adds limits and payment.

## Roadmap

| Iteration | Scope | Start trigger |
|---|---|---|
| 1 | Creator sign-up and invites, automatic data collection, creator dashboard, brand access with verified email | Now |
| 2 | Paid reports: 1 free per day, LKR 500 single report, bundles | 100+ creators with a connected account |
| 3 | Full campaign execution (briefs, invitations, applications, tracking) | Later; not specified here |

---

# Iteration 1

## 1. Platforms

Creators connect any combination of **Instagram, TikTok and YouTube**, and need at least one to appear in search.

| Data | Instagram | TikTok | YouTube |
|---|---|---|---|
| Followers / subscribers | ✓ | ✓ | ✓ (large counts rounded by YouTube) |
| Recent posts with likes and comments | ✓ | ✓ | ✓ |
| Views per post | ✓ (reels) | ✓ | ✓ |
| Shares | — | ✓ | — |
| Engagement rate (calculated) | ✓ | ✓ | ✓ |
| Total channel views, watch time, avg view duration | — | — | ✓ |
| Audience age and gender | ✓ (100+ followers) | ✗ | ✓ |
| Audience country | ✓ | ✗ | ✓ |
| Audience city | ✓ | ✗ | ✗ |
| Growth history | from our daily pulls | from our daily pulls | ✓ provided by Google |

- **Instagram** requires a free Creator or Business account. Sign-up explains how to switch.
- **Engagement rate** = (likes + comments) ÷ followers, averaged over recent posts.

## 2. Accounts and sign-in

- Two roles: **Creator** and **Brand**.
- Sign in with **email and password** or **Sign in with Google**, for both roles.
- **Email verification** is required: a link is emailed at sign-up, and Google sign-ins count as verified.
- Password reset by email.
- Disposable email domains are blocked.

## 3. Creator sign-up: three routes

All routes end in the same steps: create account, verify email, set up profile, connect at least one platform.

### 3.1 Open sign-up
Anyone can sign up at `creatortrack.lk/signup`.

### 3.2 Personal invitation (admin)
- Admin clicks **Invite creator** and enters a name, plus optional email and phone.
- The system creates a single-use link, e.g. `creatortrack.lk/join/x7Kp2m`, valid for **14 days**.
- **Share options:**
  - Copy link
  - Send via WhatsApp: opens WhatsApp with a prefilled message
  - Send by email
  - Native share sheet on phones: Messenger, Instagram DM, Viber, Telegram, SMS and others
- The name is prefilled on sign-up. If the creator signs up with the invited email address, it counts as verified.
- **Bulk invites:** upload a CSV of names, phones and emails to get one link per row.
- **Invitation list** with status *Sent → Opened → Signed up → Connected*, plus resend and cancel.

### 3.3 Invite a friend (creator referral)
- Every creator has a reusable referral link, e.g. `creatortrack.lk/r/anne`, that never expires.
- **Share options:** Copy, WhatsApp or the native share sheet, with a prefilled message:
  > "I'm on CreatorTrack, where brands find creators with verified stats. Join free: [link]"
- Sign-ups through it are attributed to the referrer.
- Dashboard shows **Friends joined**, counting only friends who connected at least one platform.
- **Community Builder badge** on the public profile after **5** friends join.
- Admin sees a top-referrers list.

### 3.4 Link previews
Invite, referral and profile links show a preview card with the CreatorTrack logo and a short title when pasted into WhatsApp, Messenger and similar apps.

## 4. Creator profile

- Display name, short bio, city, country.
- **Categories: choose 1–5** from the list below.
- Public link name, e.g. `creatortrack.lk/c/anne`. Unique, editable.
- Private contact email, used by the platform only in Iterations 1–2.
- Profile appears in search once at least one platform is connected and the profile isn't hidden by an admin.

**Categories:** Fashion & Style, Beauty & Makeup, Fitness & Health, Food & Drink, Travel, Lifestyle, Tech & Gadgets, Gaming, Parenting & Family, Finance & Business, Education, Comedy & Entertainment, Music & Dance, Art & Design, Sports, Automotive, Pets & Animals, Home & DIY, Photography, Sustainability.

## 5. Data collection

- **On connect:** stats are pulled immediately.
- **Daily:** an automatic sync of every connected account. Each sync saves a daily snapshot, which is the source for growth charts.
- **Token renewal:**
  - Instagram: 60-day tokens renewed automatically.
  - TikTok: refresh tokens last a year.
  - YouTube: refresh tokens don't expire unless revoked.
- **Broken connection:**
  - The account is marked *needs reconnecting*.
  - The creator is emailed a reconnect link.
  - The public profile shows the last verified date.
- Access tokens are encrypted at rest.

## 6. Creator dashboard

A platform switcher (**All · Instagram · TikTok · YouTube**) filters every section.

1. **Key numbers:** total followers (with week and month change), average engagement rate, average views per post, posts this month.
2. **Growth:**
   - follower chart over 7d, 30d, 90d or all time, one line per platform
   - engagement-rate trend
   - best growth day callout
3. **Content performance:**
   - top 5 and lowest posts, with thumbnail and stats, linking to each post
   - format comparison: Reels/photos/carousels, Shorts vs long videos
   - best day to post, calculated from the creator's own posts
4. **Audience:** age and gender, top countries and cities, where the platform provides them. TikTok shows a short "not provided by TikTok" note.
5. **Brand interest (counts only; brand identities are never shown):**
   - profile views this week and month
   - search appearances
   - number of brands that viewed the full report
6. **Account health:**
   - connection status per platform, with a reconnect button
   - profile completeness meter
   - tips, e.g. "Connect YouTube…"
7. **Share and invite:**
   - verified link with Copy, WhatsApp and Share
   - "see how brands see you" preview
   - referral link with "Friends joined"
   - **Download my media kit**: a free PDF of their own stats
8. **Weekly email summary** every Monday, which the creator can switch off.

**Settings:** disconnect a platform, which deletes its data, and **delete my account**, which deletes everything. Both are required by Meta, TikTok and Google.

History note: Instagram and TikTok growth charts fill in day by day from our snapshots. YouTube history is available from day one.

## 7. Brand experience

| | Visitor (no account) | Brand, verified email |
|---|---|---|
| Search and filter: category, platform, follower range, engagement, location | ✓ | ✓ |
| Headline stats: followers, engagement rate, average views, categories, verified badge, last verified date | ✓ | ✓ |
| Full report: demographics, recent posts with stats, growth charts, YouTube watch metrics | 🔒 "Sign up free to see full data" | ✓ |
| Download PDF report | ✗ | ✓ |

- **Brand sign-up fields:** name, company name, email and password, or Google sign-in.
- **Every full-report view is recorded** (brand, creator, date). This feeds the creator's "brands viewed your report" count and the Iteration 2 limits.
- **PDF report:**
  - CreatorTrack branding and verification date
  - per-platform stats, demographics and top posts
  - stamped with the downloading brand's name and download date

## 8. Admin panel (minimal)

- Lists of creators and brands. Hide or unhide a creator profile, and disable an account.
- Invitations (section 3.2) and top referrers.
- Counts:
  - creators signed up
  - **creators connected**, with progress toward 100
  - brands, verified brands
  - report views

## 9. Pre-launch checklist (outside the code)

- [ ] Domain **creatortrack.lk**, pointed at Cloud Run
- [ ] **Meta developer app** (Instagram API with Instagram Login), with App Review
- [ ] **TikTok developer app** (Login Kit + Display API), with app review
- [ ] **Google Cloud OAuth app** (YouTube Data + Analytics, read-only, and Google sign-in), with verification
- [ ] Privacy Policy and Terms of Service pages. Pages are built in the app; the wording comes from the owner or a lawyer.
- [ ] Email provider (Resend, free tier) with sending domain verified
- [ ] Separate Firestore database and Cloud Run service; Cloud Scheduler job for the daily sync

---

# Iteration 2 — Paid reports

**Starts when:** 100+ creators have at least one connected account.

## 1. Report rules

- **A report** gives one brand full data for one creator, across all connected platforms, for **7 days**, including PDF downloads. Reopening an unlocked report within the 7 days costs nothing.
- **1 free report per day** per brand account:
  - resets at midnight Sri Lanka time (UTC+5:30)
  - doesn't accumulate
- **Unlock order:** today's free report → a credit → prompt to buy.
- Headline stats stay free for everyone, with no account needed.

## 2. Pricing (LKR)

| Option | Price | Per report |
|---|---|---|
| Single report | 500 | 500 |
| 5 reports | 2,000 | 400 |
| 15 reports | 5,000 | ~333 |
| 40 reports | 10,000 | 250 |

Bundle credits are valid for **6 months** from purchase.

## 3. Payments

- **PayHere** (Sri Lankan gateway; cards, eZ Cash, mCash, in LKR). Stripe does not support Sri Lankan merchants.
- **Checkout flow:** choose an option, pay on PayHere, return to the site. Credits or the unlock apply when PayHere's payment notification is confirmed server-side.
- **Brand billing page:**
  - credits remaining and their expiry
  - today's free report used or available
  - unlocked reports with expiry dates
  - purchase history with downloadable receipts

## 4. Admin additions

- Sales list and monthly revenue.
- Grant free credits, for promotions or goodwill.
- Flags for suspicious activity: many brand accounts from one device or network.

## 5. Abuse protection

- One free daily report per verified email. Disposable domains are blocked (from Iteration 1).
- PDFs are stamped with the buyer's name and date.
- Suspicious sign-up patterns are flagged for review.

## 6. Category ranking (creator dashboard)

Enabled once there are enough creators per category, e.g. "#12 in Food & Drink by engagement in Sri Lanka".

## 7. Switching from Iteration 1

- Verified brands are emailed **one week before** paid reports go live.
- Each existing brand receives a few free credits as a thank-you. The amount is to be decided.

---

## Decisions log

| Topic | Decision |
|---|---|
| Name and domain | CreatorTrack, creatortrack.lk |
| Creator pricing | Free, always |
| Platforms | Instagram, TikTok, YouTube |
| Data source | Official platform APIs (no paid connector) |
| Categories | 20 categories, up to 5 per creator |
| Sign-in | Email + password or Google, email verification required |
| Creator sign-up | Open sign-up, admin invite links (WhatsApp/share), creator referral links |
| Referral reward | Community Builder badge at 5 friends joined |
| Brand view visibility to creators | Counts only, never brand names |
| Iteration 1 brand access | Full data and PDF free with a verified email |
| Report access period | 7 days |
| Free reports | 1 per brand per day (Iteration 2) |
| Prices | LKR 500 single; 5 = 2,000; 15 = 5,000; 40 = 10,000; credits valid 6 months |
| Payment gateway | PayHere |
| Campaigns | Iteration 3 |
