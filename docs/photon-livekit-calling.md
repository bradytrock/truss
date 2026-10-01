# Photon + LiveKit calling runbook

Truss places and receives calls on the office Photon iMessage line through **LiveKit Cloud SIP**, with a web softphone in the app. Multi-ring can include softphones, staff cells, and (later) the mobile app.

## Prerequisites

1. Photon project linked under **Settings → Photon** (project id + secret).
2. Photon iMessage line with Voice enabled.
3. Host env:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
4. SQL migration applied: `supabase/migrations/20261001180000_calling.sql`.

## One-time provisioning

1. Open **Settings → Calling**.
2. Enter the office Photon line (E.164).
3. Click **Save and provision LiveKit SIP trunks**.
   - Creates a LiveKit **outbound** trunk to `sip.spectrum.photon.codes:5061` (TLS).
   - Auth username = Photon project id, password = project secret.
   - Registration stays **off** (Photon and LiveKit both require this).
   - Media encryption is **disabled** so Photon RTP can negotiate.
   - Creates an **inbound** trunk + per-call room dispatch rule.
   - If LiveKit already has an inbound trunk for that number (no `AllowedNumbers`), provisioning reuses it. A second open trunk on the same number is rejected.
4. Copy the **LiveKit webhook** URL into the LiveKit project webhook settings (room/participant events).
5. In the **Photon** dashboard, set the line’s inbound SIP URI to the LiveKit SIP endpoint (`sips:…:5061`). Use the hint on Settings → Calling; confirm the hostname in LiveKit Cloud SIP docs for your project.
6. Register the Photon business profile before production outbound volume.

## Spike checklist (audio proof)

- [ ] Outbound: dial a personal cell from **Calls** in Truss; hear two-way audio.
- [ ] Inbound: call the Photon line; softphone rings; answer in browser.
- [ ] Multi-ring: enable cell + softphone for a seat; both ring; first answer cancels the other.
- [ ] Cold transfer to another seat’s cell.
- [ ] Warm transfer consult, then complete.
- [ ] No-answer queue fallback to an ElevenLabs voice agent number (optional).

## Routing model

| Object | Role |
| --- | --- |
| `call_endpoints` | Per-seat softphone / cell / app flags |
| `call_queues` | Simultaneous ring groups + no-answer fallback |
| `call_routes` | Dialed number → queue or seat |
| `call_sessions` / `call_legs` | CRM call history and multi-ring race |

Rooms are named `call_{companyIdCompact}_{callIdCompact}`.

## Transfers

- **Cold:** LiveKit `TransferSIPParticipant` (SIP REFER) to a teammate cell or entered number.
- **Warm:** Consult room for the agent + target (softphone and optional cell), then complete with cold transfer of the caller.

## Mobile (later)

Reuse `/api/calls/*` and the same endpoint kinds. Native clients join with LiveKit mobile SDKs as the `app` endpoint; add push for incoming rings.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Cannot provision trunks | LiveKit env vars; Photon linked; office line set |
| Conflicting inbound SIP trunks for the office number | An inbound trunk already owns that number without `AllowedNumbers`. Provision reuses that trunk instead of creating `<new>`. |
| Outbound fails immediately | Photon project owns the From line; TLS 5061; registration off |
| Inbound never rings Truss | Photon inbound `sips:` URI; LiveKit webhook URL; calling enabled |
| No audio | Photon RTP vs encryption — trunks use `SIP_MEDIA_ENCRYPT_DISABLE` |
| Softphone never prompts for mic | Browser permission; `microphone=(self)` Permissions-Policy |

## Related settings

- **Settings → Photon** — messaging + SIP credentials source
- **Settings → Calling** — trunks, queues, routes
- **Settings → People → Calling** — per-seat endpoints
- **Settings → People → Voice** — ElevenLabs missed-call / no-answer agents
