# ☕ Bean & Brew

A browser barista game. Grind, pull, steam and serve — and make rent every day
or hand back the apron.

**▶ Play it: https://ctbot000.github.io/barista-game/**

No build step, no dependencies, no tracking. Three files and a `<script>` tag.

---

## The loop

Customers queue up with a ticket and a patience bar. You build their drink at
four stations, and each one is a different kind of test:

| Step | Input | Skill |
|---|---|---|
| **1 · Grind & dose** | hold, then let go | precision — the meter accelerates as it fills, so you have to release early |
| **2 · Pull the shot** | tap | timing — stop the sweeping marker on the crema window, once per shot |
| **3 · Steam the milk** | drag, or `←` `→` | tracking — hold the wand inside a sweet spot that drifts for 3.6 s |
| **4 · Finish & serve** | click the extras | accuracy — tick *exactly* what the ticket names, nothing more |

Quality is a weighted blend of all four, and it drives both the price you get
and the tip. Serve five-star cups back to back and a **streak multiplier**
builds on your tips, up to ×2 — one sloppy cup and it's gone.

At closing time you pay the rent. Miss it and the shop closes.

## Controls

- **Space** / **Enter** — whatever the current station wants (hold to grind, tap to pull, serve)
- **← →** or **A D** — move the steam wand
- Mouse and touch work everywhere; the steam wand follows your pointer over the panel
- 🔊 in the top bar mutes the sound

## What makes it harder

Every day: shorter patience, tighter dose and crema windows, a faster marker, a
wilder steam drift, more customers, and rent that climbs by $8.50. New drinks
unlock as you go — espresso and lattes on day 1, flat whites on day 3, iced
mochas by day 7.

Between days you spend the till on five upgrades — a burr grinder and a
precision basket widen the windows, a pro steam wand calms the drift, comfy
seating buys patience, and a neon sign raises tips.

Reputation swings on every cup and drops hard on a walkout. Hit zero and word
gets around.

## Running it locally

Any static server will do:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Notes on the build

- Vanilla HTML/CSS/JS. No framework, no bundler, no external requests — the
  favicon is an inline SVG data URI and the fonts are system stacks.
- The simulation runs on a **fixed 120 Hz timestep** with an accumulator, and
  every animation lifetime is wall-clock rather than frame-counted, so a
  backgrounded tab doesn't freeze anything mid-flight.
- Progress is held in memory and written through to `localStorage`, so blocked
  storage costs you persistence across reloads and nothing else.
- Adding `?test=1` to the URL exposes `window.__barista` — a deterministic
  driver with a seedable RNG and a `step(ms)` function that advances the
  simulation without waiting on animation frames. It's what the balance numbers
  below were measured with. Without the flag it isn't defined.

## Balance

Tuned against a bot whose error is sampled **once per decision** (a Gaussian
timing offset plus a small whiff chance), not per tick — a per-tick miss is an
8 ms delay, not a handicap, and reports every game as trivial. Median days
survived, buying upgrades greedily:

| Bot | Median days |
|---|---|
| perfect | 24 |
| good (±0.02) | 20 |
| ok (±0.045) | 12 |
| sloppy (±0.09) | 5 |

Rent grows linearly while the customer count caps at 20, so every run ends
eventually. How far you get is the score.
