# Cassio on iMessage

Each person connects their own ZeroSettle number. ZeroSettle hosts Cassio on that number. Cassio can look up that person's estimates and text them when a homeowner opens one. Client texts stay on the office Photon line. This number does not send those.

## Before you connect

1. Apply these SQL files in the Supabase SQL editor, in this order:
   - `supabase/migrations/20261117170000_cassio_zerosettle_lines.sql`
   - `supabase/migrations/20261117180000_cassio_book.sql`
   - `supabase/migrations/20261117190000_cassio_actions.sql`
2. Deploy this app so `/api/cassio/mcp` is on the public https site.
3. On the host, set `SUPABASE_SERVICE_ROLE_KEY`. Lookups work without it. The text Cassio sends when a homeowner opens an estimate needs it.
4. In ZeroSettle, the line is paid and the API token comes from that same account. Open [the ZeroSettle console](https://portal.zerosettle.io/imessage), mint an API token, and copy it. Do not paste it into chat or into source.

## Connect

1. Open the live site in a browser. A localhost address cannot be the book lookup, because ZeroSettle has to call it over public https.
2. Go to **Settings → Cassio on iMessage**. It is under You, on your own seat.
3. Paste the API token and press **Connect Cassio**. If the number is already connected, leave the token blank and press **Update Cassio**. That refreshes the brief and the book lookup.
4. The page should name the number and say it can look up whether an estimate was opened. If it tells you to run SQL, run the book and actions files above and press Update again.
5. Text that number from your own phone. Ask: `Has Bryce Jones opened their estimate?` Cassio should answer from your book, not from the conversation.

## What Cassio can see

- Estimates on jobs you own, jobs where you are the project manager, and jobs you are assigned to.
- Company admins and directors can see the company's estimates.
- For a match: estimate number and name, status, when it was sent, how many times it was opened, and the last open time.
- Opens from the last 14 days when you ask what is new.
- Cassio cannot send estimates, invoices, or payments from a text.

Book questions are answered only in a private text from the phone on your profile, or the phone saved on the ZeroSettle line. In a group, or if Truss cannot tell who sent the text, Cassio is told to stay silent and the tools return no facts. Dollar amounts are never included in a tool result, a group, or a text to anyone other than that private thread.

## Communications and appointments

In that private text, ask Cassio to log a note, call, or text on a client, or to book an appointment on a job. It repeats the change and waits for a reply that is only YES. Then it saves. A YES with extra words does not save.

## Seeds group

1. On **Settings → Cassio on iMessage**, press **Create phrase**.
2. Add the Cassio number to the Seeds group and send that phrase in the group.
3. Press **I sent it**. Truss saves the group id from the message that contains the phrase.
4. Lead status changes on leads you own are posted to that group within about 15 minutes, without dollar amounts. You can also ask Cassio in the private text to share a lead status, then reply YES.

A phrase found in more than one group is refused. Forgetting the group stops the posts. Cassio does not choose a group, and it does not type the update into a chat itself.

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
