# ☕ Bean & Brew

A **3D** browser barista game. Grind, pull, steam and serve — and make rent
every day or hand back the apron.

**▶ Play it: https://ctbot000.github.io/barista-game/**

You work a real espresso bar rendered in WebGL: the grinder doses a portafilter
that you then lock into the group head, espresso streams into the cup, the
pitcher rises to the steam wand, and the finished drink slides across the
counter to whoever ordered it. The camera moves to whichever station you're
working at.

No build step and no network calls — Three.js is vendored into `vendor/`.

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

## The café

The scene is built from primitives at a consistent 1 unit = 10 cm, so the cup,
the machine and the person waiting for it are all the size they should be
relative to each other. Each station has its own camera, and the wide shots keep
the customer in frame at every stage aspect ratio.

The cup is a lathed shell rather than a capped cylinder, so it is genuinely
hollow, and the espresso / milk / foam layers are stacked meshes inside it that
grow as you build the drink. Steam, coffee grounds and the espresso stream are
pooled meshes recycled on the simulation clock.

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

It loads as an ES module, so it needs to be served rather than opened as a
`file://` URL. Any static server will do:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Notes on the build

- Vanilla HTML/CSS/JS plus Three.js, which is vendored rather than pulled from a
  CDN, so the page makes no network calls at all. No framework, no bundler; the
  favicon is an inline SVG data URI and the fonts are system stacks.
- Rules live in `game.js`, the café in `cafe3d.js`. The game hands the scene a
  small view model each tick and knows nothing else about rendering.
- Every metal in the scene is lit by a procedural environment map generated from
  a 64×32 canvas gradient. Without one, a high-metalness material has nothing to
  reflect and renders near-black no matter how bright the lamps are.
- The simulation runs on a **fixed 120 Hz timestep** with an accumulator, and
  every animation lifetime is wall-clock rather than frame-counted, so a
  backgrounded tab doesn't freeze anything mid-flight.
- Progress is held in memory and written through to `localStorage`, so blocked
  storage costs you persistence across reloads and nothing else.
- Adding `?test=1` to the URL exposes `window.__barista` — a deterministic
  driver with a seedable RNG and a `step(ms)` that runs the *whole* frame, the
  3D draw and every per-frame integrator included, so a scripted run reaches the
  same state a real one would. `probe()` reads the drawing buffer inside the
  drawing task, which tells you the GPU produced a frame independently of
  whether anything ever composited it. Without the flag neither is defined.

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
