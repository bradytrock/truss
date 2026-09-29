# Google Calendar setup

Each signed-in seat links their own Google Calendar from **Calendar → Calendars & sharing**. Truss reads that seat’s primary calendar (`calendar.events.readonly`) and overlays it on the week grid. Refresh tokens stay in `calendar_tokens` and are only reachable through Postgres RPCs. Teammates see the overlay only if that seat shares it, or if the viewer is a company admin.

Without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, the same sheet offers **Link demo Google Calendar** instead of a real Google account.

Gmail uses the same OAuth client. Add its callback and scopes in the same Google Cloud client if Mail should connect too. Calendar and Gmail are separate Connect buttons; linking one does not link the other.

## 1. Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and pick the project you already use for Truss, or create one.
2. Enable **Google Calendar API** (APIs & Services → Library). Enable **Gmail API** only if this same client will also connect Mail.
3. Open the OAuth consent screen. In the newer console this is **Google Auth platform** (Branding, Audience, Data access, Clients).

On the consent screen:

- **App name** and a support email you control.
- **User type**
  - **Internal** if every person who will connect is in your Google Workspace. Tokens do not expire on a 7-day testing clock, and you do not add test users.
  - **External** if people use personal Gmail or another Workspace. Leave the app in **Testing** until you are ready to publish.
- **Scopes** (Data access). Add exactly what the app requests:
  - `https://www.googleapis.com/auth/calendar.events.readonly`
  - `https://www.googleapis.com/auth/userinfo.email`
  - For Gmail as well: `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send`
- If the app is **External** and still in **Testing**, add every Google account that will click Connect under **Test users**. Accounts that are not listed get `access_denied`.
- Publishing an External app to **In production** removes the 7-day refresh-token limit. `calendar.events.readonly` is a sensitive scope, so Google may ask for verification before a wide audience can consent. Internal Workspace apps skip that.

## 2. OAuth client

Create an **OAuth client ID** of type **Web application** (APIs & Services → Credentials, or Google Auth platform → Clients).

Authorized redirect URIs — add every origin people actually open. The path is fixed; the host must match the address bar when they click Connect.

| Where they open Truss | Redirect URI |
| --- | --- |
| Local (`npm run dev`, port 3847) | `http://localhost:3847/api/google/calendar/callback` |
| Hosted app | `https://<your-host>/api/google/calendar/callback` |

Gmail, if you use it, needs its own URI on the same client:

- `http://localhost:3847/api/google/gmail/callback`
- `https://<your-host>/api/google/gmail/callback`

`http` vs `https`, `www` vs apex, and the port all have to match. A preview URL is a different origin, so add it or connect only on the host you registered.

Copy the client ID and client secret. You will not see the secret again; reset it in Google Cloud if you lose it, then update the env vars below. Existing refresh tokens keep working until you delete the client.

## 3. Environment variables

Locally, in `.env.local` (copy from `.env.example` if you do not have one):

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Leave `GOOGLE_REDIRECT_URI` unset unless the public origin is not the origin of the request (a proxy that hides the host). When set, it must be character-for-character one of the redirect URIs above. The default is `{origin}/api/google/calendar/callback`.

On the host (Vercel → Project → Settings → Environment Variables), set the same two names for Production, and for Preview if you connect calendars on preview URLs. Redeploy after saving. Restart `npm run dev` after changing `.env.local`.

`NEXT_PUBLIC_GOOGLE_CLIENT_ID` is accepted as a fallback for the client ID only. The secret must be `GOOGLE_CLIENT_SECRET` and must stay server-side.

## 4. Database

A project created from `supabase/bootstrap.sql` already has `calendar_accounts`, `calendar_tokens`, `calendar_shares`, and the RPCs `save_google_calendar_tokens`, `google_calendar_credentials`, and `disconnect_google_calendar`.

An older project needs [`supabase/migrations/20260819230000_google_calendars.sql`](../supabase/migrations/20260819230000_google_calendars.sql). If sharing fails because `calendar_shares` still has `owner_id` / `viewer_id`, also run [`supabase/migrations/20260830140000_calendar_shares_staff_columns.sql`](../supabase/migrations/20260830140000_calendar_shares_staff_columns.sql).

## 5. Connect a seat

1. Sign in to Truss on an origin whose redirect URI you registered.
2. Open **Calendar**.
3. Open **Calendars & sharing**.
4. **Connect Google Calendar**. If you still see **Link demo Google Calendar**, the server does not have both env vars (hit `/api/google/calendar/status` — `configured` should be `true`).
5. Approve the Google prompt. Truss always asks for consent and offline access so Google returns a refresh token.
6. You land back on `/calendar` with the account email. The sheet should say **Linked as** that address.

The connect URL is `/api/google/calendar/connect?staffId=<this seat>`. You can only store tokens for your own seat unless you are a company admin.

## 6. Who can see it

Linking does not publish the calendar to the company.

- You always see your own overlay.
- **Share with {team}** lets everyone on your field team overlay it.
- **Also share with** grants one other seat.
- Company admins can read every linked calendar and see who is linked.

Check the person on in **Calendars you can see**. Events are loaded for the visible week from Google’s primary calendar.

Truss field events (site walks, production, and the rest) are separate. Connecting Google does not write those back to Google.

## Connect again

Do this when a link stops loading events, after you add a scope, after you replace the OAuth client, or when an External app in Testing hits the 7-day refresh-token limit.

1. **Calendars & sharing → Disconnect**.
2. **Connect Google Calendar** and approve consent again.
3. Confirm the sheet shows **Linked as** the same Google account.

Disconnect deletes that seat’s row in `calendar_tokens`. The next connect writes a new refresh token.

## When it fails

| What you see | What to fix |
| --- | --- |
| **Link demo Google Calendar**, or `/api/google/calendar/status` returns `configured: false` | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are missing on the process that served the page. Restart dev, or redeploy after setting host env vars. |
| Google says **redirect_uri_mismatch** | The host you clicked Connect on is not in the client’s redirect URIs. Add `{that origin}/api/google/calendar/callback`. |
| Google says **access_denied**, or the app is unverified and you are not a tester | Add that Google account as a test user, or publish the app, or switch the consent screen to Internal. |
| Calendar toast **state** or **OAuth state mismatch** | Start Connect again from the same host. The state cookie lasts 10 minutes and is tied to that browser. |
| Toast with a Google token error (`invalid_client`, `invalid_grant`) | Client secret does not match this client ID, or the refresh token was revoked. Update the secret and connect again. |
| Linked, but the grid has no Google events | That primary calendar has nothing in the week you are viewing, or Google rejected the token (Disconnect and Connect). Demo events only appear for a **demo** link, and **Show demo Google events** is off until you turn it on. |
| **You can only connect your own Google Calendar** | The `staffId` on the connect link is not the signed-in seat, and you are not a company admin. |
| **Not signed in** from the token RPC | The Supabase session was missing when Google redirected back. Sign in, then Connect again. |

A successful connect redirects to `/calendar?google=connected&email=…`. A failure redirects to `/calendar?google=error&reason=…`. The page shows that reason in a toast and then clears the query string.
