# Desk Garden

A tiny plant that lives on your real desk. Once a day, take two minutes to
**plant an intention, water it with your palm, and breathe with it**, and it
grows. Built for Meta Quest in mixed reality, hands-only, seated.

Entry for the **Meta VR Start Developer Competition 2026**.
Track: **Productivity** (a habit tied to a daily moment). Division: **New Experience**.
Built with the [Immersive Web SDK (IWSDK)](https://iwsdk.dev) on WebXR.

## The daily ritual (about 2 minutes)

| Step | What you do | What happens |
|---|---|---|
| Arrive | Sit at your desk and press Start | The plant finds your real table (scene planes) and settles on it |
| Intention | Touch Focus, Calm, Move or Connect with a fingertip | A seed of that colour drops into the pot |
| Water | Hold your palm face-down over the ring | Droplets fall from your real hand and the soil darkens |
| Breathe | Open and close your hand with the ring, three times | The plant breathes with you |
| Bloom | Watch | It grows one stage and opens a flower in today's colour |

When you come back the next day, the plant is bigger and has one flower for
every day you showed up, so the colours become a record of your intentions.
If you skip days it droops a little, but it never dies. Watering perks it back up.

## How it maps to the judging

- **Hands-first:** every step uses hand tracking (poke, palm pose, open/close, pinch-to-move the pot). You never need a controller.
- **Seated, two-foot bubble:** everything sits about 42 cm in front of you on the desk.
- **One-bus-stop session:** a full ritual takes about 2 minutes. Pausing and resuming is safe because progress saves after each bloom.
- **Purposeful passthrough:** the plant sits on your detected **table** plane (preferring planes labelled `table`/`desk`). It also **leans toward your real window** if your room scan has one. Remove your room and the experience changes.
- **FoV-aware:** the cards sit beside the plant within about ±20° and turn to face you.
- **Reason to come back:** daily growth, a streak, coloured flower history, and a gentle droop when you skip days.
- **First five minutes:** no wall of text. Each step has one short line, a visual target and a sound.
- **Accessibility:** every gesture also has a **Help me** button (ray, gaze-pinch, poke or mouse). The breathing step completes for anyone who simply watches. There is a **high-contrast** mode, and all audio is synthesized with on-card captions.
- **Original:** the plant, effects and sounds are all generated in code, with no third-party services or assets.

## Run it

Requires Node 22.12+ (see `.nvmrc`).

```sh
npm install
npm run dev        # IWSDK dev server + emulator (IWER) in a managed browser
npm run typecheck
npm run build      # static site in dist/
```

**On a Quest:** run `npm run dev`, then open the network URL it prints in the
Quest Browser (same Wi-Fi, accept the local certificate). Set up your room
(Settings > Physical space > Space setup) so your desk is detected.

**Flat-screen preview:** the built site also runs in a desktop browser with a
stand-in desk. You can click through the whole ritual with the mouse, which is
handy for screenshots.

**Demo helper:** the **Next day** button (shown after a bloom) moves the
calendar forward one day so judges can see several days of growth in one sitting.

## Deploy (GitHub Pages)

`.github/workflows/deploy-pages.yml` builds and publishes every push to `main`.
One-time setup: in the repo, go to **Settings > Pages > Source** and choose **GitHub Actions**.
The site is then served at
`https://najmunnaharhira.github.io/meta-vr-start-developer-competition-2026/`.
Use that link for the Devpost submission, and keep it live until Dec 11, 2026.

## Code map

```
src/garden-system.ts   ritual state machine, desk placement, gestures, effects
src/plant-model.ts     procedural pot, stem, leaves, flowers; growth/droop/lean
src/hands.ts           WebXR hand joints -> palm pose, openness, pinch
src/garden-state.ts    daily progress, streaks, localStorage save
src/label.ts           canvas-drawn text cards (normal + high contrast)
src/sfx.ts             synthesized Web Audio sounds
iwsdk.config.json      AR session: hand tracking, planes, meshes, anchors, hit-test
```

## Submission checklist (deadline Nov 18, 2026, 12:00 PM PT)

- [ ] Meta VR Start membership active, and Developer Access enabled on your Meta account
- [ ] Registered on Devpost: https://start-developer-competition-26.devpost.com/
- [ ] GitHub Pages enabled and the live link tested on a Quest
- [ ] Demo video under 3 minutes, recorded on Quest, public on YouTube or Vimeo
- [ ] Description: inspiration, how it was built, future plans, target launch date
- [ ] Track: Productivity · Division: New Experience
- [ ] Screenshots attached
