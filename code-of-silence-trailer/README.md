# CODE OF SILENCE 2.0 — trailer

A 94-second first-person investigation trailer, built as one self-contained web page.

* `index.html` plays the trailer live in a browser, with flashlight, sets, post-processing and a fully synthesised soundtrack. Open it and press **Play trailer**. Space pauses, R restarts, F toggles fullscreen.
* `render.mjs` renders the same page frame by frame to a 1080p MP4 with the soundtrack.

Everything you see and hear is generated in code. There are no image, model or audio files, so nothing needs licensing.

## Edit before the event

At the top of the `<script>` in `index.html`:

```js
const EVENT = { date: '[DATE]', time: '[TIME]', venue: '[VENUE]' };
const SENDER = 'Veema';   // the emails' sender, exactly as written in the case material
```

Fill in `EVENT` and re-render. The brief spells the email sender **Veema** while the missing scientist is **Dr. Verma**. The emails use the brief's spelling exactly. If that was a typo, change `SENDER` to `'Verma'` and every email updates.

## Render the video

```sh
npm i playwright && npx playwright install chromium   # once
node render.mjs code-of-silence-2.0.mp4                # 1920x1080, 30 fps, H.264 + AAC
node render.mjs reel.mp4 --size 1080x1920              # vertical cut (shots are framed for 16:9, so sides crop)
node render.mjs preview.mp4 --from 60 --to 72          # just a section
```

Rendering is CPU-heavy: about 1 s per frame on 4 cores without a GPU. Use `--workers N` to match your cores.

---

## Scene by scene

Times are trailer seconds (`m:ss.s`). **Text** is exactly what appears on screen.

### Scene 1 — Black screen (0:00–0:06.5)
* **Picture:** total black, film grain only.
* **Text:** `CASE FILE: VERMA` (0:02.2–0:04.2), small white monospace typed in with a block cursor, then glitches out. `STATUS: MISSING` (0:04.4–0:06.1), red monospace with a soft red glow, glitches out.
* **Sound:** a sub drone fades in, with distorted radio static that drifts through two tuning whistles. A typewriter tick plays per character.
* **Transition:** a two-click flashlight switch at 0:06.5. The beam stutters (on, off, half, on) before it holds.

### Scene 2 — Entering the facility (0:06.5–0:18.0)
* **Environment:** a vestibule opening onto the lobby. The heavy steel door is ajar, with a wired-glass window and a `SECURITY / CHECKPOINT / LEVEL B` sign. A card reader blinks red, and a `RESTRICTED — AUTHORIZED PERSONNEL ONLY` sign hangs beside it. In the lobby:
  * the reception counter, with a check-in kiosk flickering `SESSION TERMINATED · ERR 0x3F · SECURITY LOCKDOWN · LAST BADGE: RD-0472` (Verma's badge number)
  * an off-hook phone, an overturned office chair, and about 20 scattered printouts
  * a ceiling tile hanging from its grid, with cables dangling out of the hole
  * a wall clock stopped at **2:47**, its second hand twitching in place
  * a wall-mounted security camera with a red LED
  * a `WARNING — RESTRICTED AREA` sign, and a red emergency beacon pulsing in the far doorway
* **Camera:** the player stands at the door and glances at the card reader. The door creaks open (0:07.8–0:09.5) and the player walks through at about 1.1 m/s. The flashlight sweeps across the desk and kiosk, drops to the papers and the chair, rises to the stopped clock, and ends on the security camera.
* **HUD**, top-left (0:07.1–0:17.7): `FLOOR 01` · `POWER: UNSTABLE` (amber, flickering) · `SIGNAL: LOST` (red, blinking).
* **Subtitle** (0:12.1–0:15.9): `DR. VERMA HAS NOT BEEN SEEN FOR 72 HOURS.`
* **Lighting:** the flashlight only, plus one fluorescent tube stuttering at the back, the red beacon, and the kiosk's glow. Sparks spit from the cables at 0:10.3 and 0:16.1.
* **Sound:**
  * card reader denial beep, door creak, footsteps (heel click, body and thump, panned per foot)
  * mains hum at 50 Hz with harmonics, and fluorescent buzz synced to the tube's flicker
  * spark crackle, a stuck clock tick every second, and a distant metal clang
  * a servo chirp from the security camera

### Scene 3 — The six rooms (0:18.0–0:30.0)
* **Environment:** a long two-tone concrete corridor under a hanging sign, `LAB WING B · ROOMS 01–06`, with doors alternating left and right.
  * Each door has a `ROOM 0N` plate, a stencilled number, and a numbered yellow evidence marker on the floor.
  * Rooms 02 and 03 are crossed with `DO NOT ENTER · RESTRICTED` tape. Room 05 has a keypad. Light leaks under Room 06.
  * Also in the corridor: a cart, dropped boxes, a fire-extinguisher cabinet and a `HIGH VOLTAGE` sign.
  * Ceiling cables spark at 0:25.6. At the far end are a red-lit exit and a green EXIT sign.
* **Camera:** a steady walk of about 14 m at a realistic pace. The beam checks each door in turn as the player passes.
* **Cut-ins:** six 0.34 s glimpses, one per door, each with a glitch, a static burst and a low hit.
  1. 0:19.4 — laboratory
  2. 0:21.1 — computer with corrupted files
  3. 0:23.0 — destroyed security terminal, sparking
  4. 0:24.8 — desk buried in documents
  5. 0:26.6 — locked evidence cage
  6. 0:28.4 — wall diagram
* **Text:** `SIX ROOMS.` (0:21.3) · `SIX CLUES.` (0:24.3) · `ONE TRUTH.` (0:27.2). Each is in a wide-tracked serif that resolves from a blur and drifts slowly, with a sub-boom and a reverse swell.

### Scene 4 — First clue (0:30.0–0:39.5)
* **Environment:** Lab B.
  * Epoxy benches with beakers, flasks, reagent bottles and test-tube racks, plus a tipped flask in a spill.
  * A microscope, and a fume hood whose lamp flickers.
  * A radiation `CAUTION` sign, and a whiteboard reading *"Batch 17 — results ≠ report / who changed the numbers?"*
  * A desk with a lamp, a mug and a keyboard.
* **The clue:** a printed internal email, rendered as a real printout. It has a header rule, `From: Veema` / `To: Sahil` / `Sent: ▇▇ ▇▇/▇▇ ▇▇:▇▇ TIMESTAMP CORRUPTED` / `Subject: (no subject)`, fold creases, a staple hole and a red **EXHIBIT B** rubber stamp. Body:
  > I found something awful in the lab.
  > Can we talk?
* **Camera:** the beam crosses the benches and lands on the desk. The player slowly leans in until the page is readable (0:32.7–0:36.8), then picks it up (0:36.9–0:37.6). The page lifts off the desk into the player's hand and the beam follows it.
* **HUD toast** (0:37.45–0:39.35): `+ EVIDENCE ACQUIRED` / `PRINTED EMAIL · 1 / 6`.
* **Sound:** paper handling, a soft two-note evidence chime, then a hard glitch (0:38.25) with static.

### Scene 5 — The jumbled emails (0:39.5–0:50.0)
* **Environment:** the archive desk. Five printouts lie overlapping at different angles among other papers, with a magnifying glass and a mug.
* **Camera:** the player leans over the desk and scans the emails one at a time, deliberately **out of chronological order**:

  | Time | Exhibit | From → To | Body |
  |---|---|---|---|
  | 0:39.5 | A | Director → Sahil | Money is sent. Keep him quiet. |
  | 0:41.1 | D | Veema → Reporter | Meet me tomorrow. I have proof. |
  | 0:42.4 | C | Sahil → Director | It's done. He won't be meeting anyone. |
  | 0:43.6 | E | Sahil → Director | Veema knows. What do I do? |
  | 0:44.8 | B | Veema → Sahil | I found something awful in the lab. Can we talk? |

  Every timestamp is redacted, so the order can't be read off the page. The player then pulls back to show the whole scattered desk (0:45.5–0:46.6).
* **Text:** `THE EMAILS DON'T MATCH.` (0:45.85, serif card). Then a game objective: a small red label `OBJECTIVE UPDATED` above a typed line, `PUT THEM IN ORDER.` (0:47.95).
* **Sound:** paper on each reveal. A slow heartbeat starts at 0:44.2, and a hit lands under the card.

### Scene 6 — The investigation (0:50.0–1:03.0)
Fast first-person cuts, each joined by a short glitch, with text cards on black between them. A heartbeat accelerates from 72 to about 110 bpm underneath.

| Time | Shot | Sound |
|---|---|---|
| 0:50.0 | The beam swings down the corridor mid-stride | buzz, footsteps |
| 0:51.1 | Keypad beside Room 05: four keys light, `* * * *`, then `ACCESS GRANTED` and the LED turns green | four beeps, a two-tone accept |
| 0:51.9 | Room 05's door unlocks and swings into darkness | bolt clunk, creak |
| 0:52.8 | **`SEARCH.`** | hit |
| 0:53.55 | Workstation recovering files: `LAB_B_SAMPLES_0317.csv [CORRUPTED]`, `proof_backup.zip [ACCESS DENIED]`, `████.dat [DELETED]`, scrolling hex | data chatter |
| 0:54.45 | A strange symbol painted on the wall: a broken ring, a slash, an inverted triangle and six marks | swell |
| 0:55.25 | **`DECODE.`** | hit |
| 0:56.0 | Corkboard of notes and red string: `72 HRS`, `LAB B 2:47 AM`, `WHO HAD ACCESS?`, `follow the money`, `THE PROOF → where?`, `emails out of order`, photos marked `?` | paper |
| 0:56.9 | A drawer slides open: a USB drive tagged `PROOF` and a polaroid captioned `LAB B — 2:47` | drawer slide |
| 0:57.8 | Manila folder: `VERMA`, `CASE 0472 · PERSONNEL`, a red `CONFIDENTIAL` stamp | paper |
| 0:58.6 | **`CONNECT THE CLUES.`** | hit |
| 0:59.35 | The security camera swivels to stare at the player; its LED and lens flare red | servo whine |
| 1:00.25 | A dead CCTV monitor bursts on: static, then `CAM 06 · LIVE`, `● REC`, `02:47:13`, and a dark figure in a corridor | static burst |
| 1:00.95 | A silhouette crosses the far end of the corridor, backlit red | distant running footsteps |
| 1:02.05 | **`QUESTION EVERYTHING.`** | hit |

The figure is only ever a dark, hooded human shape. Its face is never shown, and nothing supernatural appears.

### Scene 7 — Dr. Verma's office (1:03.0–1:11.5)
* **Environment:**
  * a half-open door, and a desk with a `DR. VERMA` nameplate
  * an **empty chair** turning slowly on its own (with a creak)
  * **broken glasses** on the floor, one lens shattered
  * research papers scattered across the floor
  * a bookshelf, a framed certificate, a filing cabinet
  * on the desk: an ID badge (`DR. VERMA · SENIOR RESEARCH SCIENTIST · ACCESS LEVEL 4 · RD-0472`) and a USB drive with a handwritten `PROOF` tag — the final evidence
  * the computer, still running: `FINAL_REPORT_v7.docx — Dr. Verma`, with an `Upload failed — Connection terminated by remote host` dialog stuck at `proof_backup.zip 87%`
* **Camera:** entry, the chair, then a crouch to the glasses (1:06.5), up to the badge and drive (1:07.7), and around the desk to the screen, pushing in slowly.
* **The turn:** at 1:09.0 the screen flickers and goes black. Red text types itself out on the monitor: `YOU WERE NEVER SUPPOSED / TO FIND THIS.` The room is now lit red by the screen. At 1:11.27 the same line strobes full-frame for a few frames under a hard glitch.
* **Sound:** a riser builds from 1:08.1, with heartbeats and keystroke ticks as the text types.
* **Transition:** a hard cut to black at **1:11.5**, then about one second of **total silence**. The reverb is cut too, so nothing rings on.

### Scene 8 — The final reveal (1:12.6–1:17.0)
* The flashlight clicks back on in the silence. The player stands in the long corridor looking toward the red-lit exit.
* **Barely visible**, about 20 m away at the junction, a figure stands backlit by the red beacon. There's a slow heartbeat, a distant metallic creak and the fluorescent buzz.
* At 1:15.0 the flashlight bulb fails: on, off, half, off. When it steadies (1:15.6) **the figure is gone**. A low sub drop follows, then a cut to black at 1:17.0 with a boom.
* **Text on black:** `WHO SILENCED DR. VERMA?` (1:17.8–1:20.6, large serif, deep boom), then `FIND OUT.` (1:21.0–1:22.7, red, wide tracking, hit).
* A reverse swell rises, then **silence** for 0.6 s (1:23.4–1:24.0).

### Final title card (1:24.0–1:34.0)
* **1:24.0 — impact:**
  * `CODE OF SILENCE` slams in, over-exposed and blurred, settling in 0.5 s
  * silver gradient lettering in Playfair Display Black, with a red glow
  * a slow 6% scale-down over 2.4 s
  * behind it, a concrete wall lit by a pulsing red emergency light, with drifting dust and grain
  * sound: sub boom, low brass-like "braam" (detuned saws), noise burst, long reverb
* **1:24.25–1:25.6:** a flashlight-white light sweep travels across the letters.
* **1:24.9:** `2.0` flickers on in red, flanked by red rules that extend outward, with a second hit and a glitch.
* **1:25.4:** `A MURDER MYSTERY` in small tracked mono, matching the original poster.
* **1:26.2:** `EVERY CLUE HAS A STORY.` in a serif italic that resolves from a blur, with a high shimmer.
* **1:27.4:** `[DATE] · [TIME] · [VENUE]`, typed.
* **1:28.6:** `ENTER THE INVESTIGATION.`, red, typed, with a blinking cursor.
* The card holds. The video fades out over 1:33.1–1:34.0; the live page stays on the card with a Replay button.

---

## Look and sound system

* **Camera:** first person at 1.65 m eye height.
  * Spline paths at walking pace, with head bob driven by distance walked: a dip on each footstep, a sway every two.
  * Breathing and hand tremor on top.
  * The flashlight is held low and to the right, trailing the view by about 0.1 s, so shadows fall up and to the left.
* **Flashlight:** a shadow-casting spotlight with a projected beam pattern (hot core, bright ring, dim spill). Its intensity adapts to the subject's distance, like an eye adjusting, so close-ups don't blow out.
* **Atmosphere:** exponential fog, dust motes that only glow inside the beam, and haze around the beam.
* **Picture:**
  * bloom on practical lights and screens, ACES tone mapping
  * a cold, desaturated grade that **keeps reds saturated**
  * heavy vignette, animated film grain, slight chromatic aberration
  * a scripted glitch layer: line tearing, datamosh blocks, RGB split
* **Type:** Playfair Display for cinematic cards and the title, IBM Plex Mono for system text and the HUD, Courier Prime for the emails, Caveat for handwriting, Inter for signage. All load from Google Fonts.
* **Audio:** synthesised in Web Audio from seeded noise and oscillators. The same graph plays live in the browser and renders offline for the video.
  * Layers: sub and mid drones, room tone, 50 Hz mains hum, a dissonant pad from 0:30 onward.
  * Every sound effect listed above sits on one timeline with the picture.
  * Mastered to about −18 LUFS with roughly 8 LU of dynamic range: quiet at the start, loudest at the title impact.

## Assets and placeholders

| Placeholder | Where | Notes |
|---|---|---|
| `[DATE]`, `[TIME]`, `[VENUE]` | `EVENT` in `index.html` | shown on the title card |
| Email sender name | `SENDER` in `index.html` | see the Veema/Verma note above |
| Badge number `RD-0472`, case `0472`, clock time `2:47` | inline strings | invented details; change them to match your clues |

Built procedurally in code, with no files needed:
* **Surfaces:** concrete, vinyl floor and ceiling tile textures.
* **Paper:** printouts, the five emails, ID badge, folder, polaroid, corkboard notes, chalk diagram, wall symbol.
* **Signs and markings:** all signage, door plates, stencils, evidence markers, caution tape.
* **Screens:** kiosk, CCTV, file recovery, and the office computer.
* **Furniture and props:** chairs, desks, monitors, glassware, server racks, filing cabinets, evidence cage, clock, security camera, broken glasses, USB drive.
* **The figure:** a faceless capsule silhouette.

External dependencies: three.js r160 from jsDelivr, and the Google Fonts listed above.
