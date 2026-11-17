# Cassio on iMessage

Each person connects their own ZeroSettle number. ZeroSettle hosts Cassio on that number. Cassio can look up that person's estimates and text them when a homeowner opens one. Client texts stay on the office Photon line. This number does not send those.

## Before you connect

1. Apply both SQL files in the Supabase SQL editor, in this order:
   - `supabase/migrations/20261117170000_cassio_zerosettle_lines.sql`
   - `supabase/migrations/20261117180000_cassio_book.sql`
2. Deploy this app so `/api/cassio/mcp` is on the public https site.
3. On the host, set `SUPABASE_SERVICE_ROLE_KEY`. Lookups work without it. The text Cassio sends when a homeowner opens an estimate needs it.
4. In ZeroSettle, the line is paid and the API token comes from that same account. Open [the ZeroSettle console](https://portal.zerosettle.io/imessage), mint an API token, and copy it. Do not paste it into chat or into source.

## Connect

1. Open the live site in a browser. A localhost address cannot be the book lookup, because ZeroSettle has to call it over public https.
2. Go to **Settings → Cassio on iMessage**. It is under You, on your own seat.
3. Paste the API token and press **Connect Cassio**. If the number is already connected, leave the token blank and press **Update Cassio**. That refreshes the brief and the book lookup.
4. The page should name the number and say it can look up whether an estimate was opened. If it tells you to run the book SQL, run `20261117180000_cassio_book.sql` and press Update again.
5. Text that number from your own phone. Ask: `Has Bryce Jones opened their estimate?` Cassio should answer from your book, not from the conversation.

## What Cassio can see

- Estimates on jobs you own, jobs where you are the project manager, and jobs you are assigned to.
- Company admins and directors can see the company's estimates.
- For a match: estimate number and name, status, when it was sent, how many times it was opened, and the last open time.
- Opens from the last 14 days when you ask what is new.
- Cassio still cannot change jobs, estimates, or invoices from a text.

Keep the number private. ZeroSettle does not tell Truss who sent the text. The lookup is the book of the person who connected the number, so anyone who texts that number can ask about that book.

## When a homeowner opens an estimate

Truss still texts and emails you on the office line, the same as before, when proposal-opened texts are on.

If the service role key is set, Cassio also texts the mobile on your profile, from your Cassio number, with the same update. The phone on your profile should be the phone you use to text Cassio. Proposal-opened texts have to be on under **Settings → Notifications**. If you turn those texts off, neither number sends the update.

## Checks when an answer looks wrong

- "This ZeroSettle line is not paid yet" means that token's line has not finished checkout. Use the token from the paid account and connect again.
- Cassio says it cannot see estimate activity. Press **Update Cassio** on the live site so the new brief and the book lookup are saved. Then ask again.
- The page says to open the live site. You connected from an address ZeroSettle cannot call. Open the production site and press Update.
- No match for a person you can see in the app. That estimate is not on your jobs, or your role is not admin or director. Open the job and check the owner and project manager.
- A homeowner opened an estimate and only the office number texted you. Set `SUPABASE_SERVICE_ROLE_KEY`, keep proposal-opened texts on, and confirm the mobile on your profile.
- ZeroSettle says the assistant is out of credits. Each reply Cassio sends uses one credit. That is separate from a paid line.

Disconnect in Truss stops Truss from updating the assistant. The assistant keeps answering in ZeroSettle until you turn it off there.
