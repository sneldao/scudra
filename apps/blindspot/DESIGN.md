---
version: 3
name: Blindspot
description: Privacy-preserving onchain investigation agent. A 3D dossier you scroll through.
product_thesis: "Open a dossier. See everything. Leave no trace."
engine: three.js
scroll: lenis
animation: proximity-driven redaction shader (scroll-driven, no tween library)
framework: astro (page + layout) with a single react island; engine modules are vanilla TS
fonts: self-hosted via @fontsource (fraunces, inter, jetbrains-mono)
colors:
  paper: oklch(0.98 0.005 85)
  paper-warm: oklch(0.96 0.008 75)
  ink: oklch(0.15 0.01 270)
  ink-muted: oklch(0.45 0.01 270)
  ink-dim: oklch(0.65 0.005 270)
  accent: oklch(0.62 0.14 40)
  accent-soft: oklch(0.62 0.14 40 / 0.08)
  risk-low: oklch(0.55 0.13 145)
  risk-moderate: oklch(0.68 0.14 75)
  risk-high: oklch(0.58 0.20 25)
  depth-fog: oklch(0.94 0.008 80)
typography:
  display:
    fontFamily: Fraunces
    fontWeight: 400
    letterSpacing: -0.02em
  body:
    fontFamily: Inter
    fontWeight: 400
    letterSpacing: -0.01em
  mono:
    fontFamily: JetBrains Mono
    fontWeight: 400
motion:
  ease-reveal: cubic-bezier(0.22, 1, 0.36, 1)
  ease-reverse: cubic-bezier(0.4, 0, 0.2, 1)
  ease-camera: cubic-bezier(0.25, 0.1, 0.25, 1)
  duration-reveal: scroll-driven (proximity dissolve)
  duration-camera: scroll-driven
---

## Overview

Blindspot is a privacy-preserving onchain investigation agent. The interface
is a **3D dossier** — a sequence of panels floating in three-dimensional space
that you scroll through. Each panel reveals a layer of the target: identity,
onchain holdings, off-chain presence, risk. When the investigation ends, the
dossier closes and the cover returns. You were never there.

The experience is built on **Three.js** as a full 3D engine — not CSS
perspective tricks, not 2D parallax. Real camera movement through a 3D scene.
Real depth. Real lighting. HTML content is rendered to canvas textures and
projected onto 3D planes, giving the data physicality — it exists in space,
not on a flat page.

### Implementation shape

- **Astro** serves the page (`src/pages/index.astro`) and the layout
  (`src/layouts/Layout.astro`), including self-hosted font CSS and meta tags.
- **One React island** (`src/components/BlindspotApp.tsx`, `client:load`)
  owns the lifecycle: search → SSE stream → dossier → verdict → reset. It
  renders the canvas, the projected DOM form, and the status/error overlays.
- **Vanilla TS engine modules** under `src/client/` (scene, camera curve,
  scroll, panels, redaction shader, chart, texture pipeline, tokens, fonts).
  React never touches per-frame work; the render loop writes imperative
  DOM updates (form projection, tooltip) through refs.
- **API route** (`src/pages/api/investigate.ts`) streams investigation events
  over SSE and sanitizes errors at the boundary — the client never sees raw
  stack traces or keys.

## Design Principles

### 1. The dossier is a physical space

The UI is not a page. It is a place. You enter it, move through it, and leave
it. Each panel of the dossier is a plane (or group of planes) positioned in
3D space. The camera travels between them as you scroll. This is the curve
gallery approach: scroll drives a camera along a path, and content comes into
view as you approach it.

### 2. Light, warm, editorial

The aesthetic is a well-lit archive. Warm paper-white background, ink-black
text, one terracotta accent. No dark mode. No surveillance aesthetic. No
glossy orbs. The feeling is closer to flipping through a beautifully designed
intelligence brief than staring at a hacker terminal. Delight comes from
craft, spatial depth, and smooth motion — not from darkness.

### 3. Real 3D, not faked

- Depth is real Z-positioning, not CSS `translateZ` hacks.
- Parallax is real camera movement, not `transform: scroll-percentage`.
- Lighting is real Three.js lights, not CSS box-shadows.
- Fog is real Three.js scene fog, not CSS gradients.
- The chart is a real 3D mesh, not a 2D SVG with a tilt transform.
- HTML-to-texture projection uses the SVG ForeignObject → Canvas →
  THREE.CanvasTexture pipeline (the three-html-to-canvas approach).

### 4. Scroll is the engine, proximity is the reveal

Lenis provides smooth, momentum-based scrolling. Scroll position maps to
camera position along a spline path through the scene. Each panel's
declassification is driven by **proximity** — the camera's distance to that
panel — fed to the redaction shader. As you approach, the ink bars dissolve
in organic patches and the document underneath declassifies, layer by layer.
No tween library, no scroll triggers: the reveal is a pure function of where
the camera is. The user never clicks "next" — they scroll, and the world
unfolds.

### 5. Ephemeral by default

The dossier opens, reveals its contents, and closes. When the investigation
ends, the verdict panel declassifies last; "New investigation" (or Escape)
disposes every panel and rebuilds the cover, and the search form reappears.
No persistent state. No history. This mirrors the architecture: ephemeral
sandboxes, killed after use.

## The 3D Scene

### Scene setup

```
Scene
├── Camera (PerspectiveCamera, fov 50, travels along spline;
│           dollies back on portrait viewports to keep plates in frame)
├── Lights
│   ├── AmbientLight (0xfff5e6, 0.9 — warm fill, prevents dead shadows)
│   ├── DirectionalLight (key light, from upper-left, VSM soft shadows)
│   └── PointLight (accent, terracotta tint, follows camera for warmth)
├── Fog (paper-warm; near/far track viewing distance: dist+3 … dist+25)
├── Background (paper color)
├── Floor (invisible ShadowMaterial catcher, hidden on portrait aspects)
└── PanelGroup (5 panels, each at increasing Z depth)
    ├── Panel 0: Cover/Search (Z = 0)
    ├── Panel 1: Identity (Z = -20)
    ├── Panel 2: Onchain (Z = -40)
    ├── Panel 3: Off-chain (Z = -60)
    └── Panel 4: Verdict (Z = -80)
```

### Camera path

The camera travels along a gentle curve — not a straight line. This is the
curve-gallery technique: a Blender-style curve path (implemented as a
THREE.CatmullRomCurve3) that weaves slightly left-right as it moves forward
through Z. This makes the journey feel like walking through a gallery, not
riding an elevator.

```
Camera path (viewed from above):

    Panel 0     Panel 1     Panel 2     Panel 3     Panel 4
      ●           ●           ●           ●           ●
       \         / \         / \         / \         /
        \--curve--/ \--curve--/ \--curve--/ \--curve--/
         (right)    (left)     (right)    (left)

    Z:    0        -20        -40        -60        -80
```

The curve offset is subtle — ±2 units on X. Enough to create a sense of
movement and let panels come into view from an angle, not dead-on.

Each curve stop sits **5 units in front of** its panel, so the active panel
fills the frame at its scroll position instead of the camera passing through
it. Scroll progress (0 → 1) maps to `curve.getPointAt(progress)`. The camera
look-at lerps between adjacent panel centers, so the gaze turns smoothly as
the camera travels rather than snapping per panel.

On portrait viewports the horizontal field of view is too narrow for a 6-unit
plate, so the render loop dollies the camera back along the view direction
until the plate width fits, and the fog gradient shifts with the viewing
distance so the active panel stays crisp at any aspect ratio.

### Panel construction

Each panel is a group of 3D planes. The content plane is a
`THREE.PlaneGeometry` with a shader material using a `THREE.CanvasTexture`
rendered from HTML via the SVG ForeignObject pipeline:

```
HTML string
  → SVG <foreignObject> wrapping the HTML (with base64 @font-face CSS)
  → Image (loaded from the SVG data URI)
  → Canvas (drawn from the image at PX_PER_UNIT × devicePixelRatio-clamped)
  → THREE.CanvasTexture (sRGB color space)
  → THREE.Mesh with PlaneGeometry
```

This lets us design each panel in HTML/CSS (typography, layout, color) and
project it into 3D with real depth, lighting, and perspective.

Above the content plane sit one or more **redaction planes** — ink-bar meshes
sharing a redaction shader material. They are the declassification primitive
(see "Redaction Dissolve in 3D" below).

### Panel detail

#### Panel 0 — The Cover

The entry point, mounted at first paint — the dossier exists before any
investigation runs. A single plane, centered, facing the camera, with no
redaction layers.

Content:

- "— BLINDSPOT —" classified mark, then "Blindspot" in Fraunces, large
- "Privacy-preserving onchain investigation" in Inter, ink-muted
- A deliberately blank band below the tagline
- Footer line: "EPHEMERAL SANDBOX · NO TRACE · YOU WERE NEVER HERE"

The search input and button are **real DOM elements**, not projected to
texture, because they need to be interactive. Each frame the render loop
projects a world-space anchor on the cover's blank band to screen space and
pins the form there, so the live form appears printed on the plate. On
submit the form unmounts and the camera begins traveling along the curve.

#### Panel 1 — Identity

Reveals the ENS resolution as one content plane under three sequential
redaction layers:

- **Name band** (top third, threshold 0.0): "vitalik.eth" in Fraunces, large —
  declassifies first
- **Address band** (middle, threshold 0.2): the full address in JetBrains
  Mono, ink-muted
- **Metadata band** (bottom, threshold 0.4): website, twitter, aliases in
  Inter, with terracotta underlines for links

#### Panel 2 — Onchain

Reveals the Mobula data. The most visually rich panel.

- **Content plane**: "$2.1M", "14 assets", "+$340K realized PnL" in Fraunces,
  very large, above a compact top-5 holdings table. Two redaction layers:
  numbers first (threshold 0.0), holdings second (0.25).
- **Chart mesh** (offset left, +0.5 in front of the plate): a real 3D donut
  chart. Each segment is a ring sector extruded with `THREE.ExtrudeGeometry`
  to give it depth. Segments are colored from the chart palette in
  `src/client/tokens.ts`. The chart turns ±7.5° on Y tied to scroll progress
  through the panel zone. Hover (raycasting, fine pointers only) highlights a
  segment and shows the token name and value in a DOM tooltip.

#### Panel 3 — Off-chain

Reveals the stealth browser enrichment as one content plane:

- Source URLs (terracotta links) with titles beneath, up to three
- "fetched via 72.41.xx.xx (US)" in JetBrains Mono
- Two redaction layers (0.05 / 0.35) — the evidence declassifies last among
  the evidence panels

Screenshots captured by the Solari stealth browser are referenced in the
report; on the panel they are summarized as source cards rather than textured
planes, keeping the texture budget and the reading order clean.

#### Panel 4 — The Verdict

The finale. Single large plane, centered, under three redaction layers so the
risk score is the last thing revealed — like a stamp being uncovered.

- **Risk score**: "42" in Fraunces, very large, colored by risk level
  (terracotta for high, amber for moderate, green for low)
- **Risk label**: "MODERATE RISK" in Inter, uppercase, wide tracking, same
  color
- **Risk summary** in Inter, ink-muted
- **Privacy verdict**: e.g. "DEANONYMIZED — egress correlated" in JetBrains
  Mono
- **Buttons**: "Download report" and "New investigation" — real DOM elements
  overlaid on the canvas, like the search form

On "New investigation": all panels are disposed, scroll returns to the top,
and the cover is rebuilt so the room is never empty.

## Scroll System

### Lenis configuration

```js
const lenis = new Lenis({
  lerp: 0.08, // smooth, not instant
  duration: 1.2, // momentum duration
  smoothWheel: !prefersReducedMotion,
})
```

No scroll-trigger proxy and no tween library: the render loop reads
`getProgress()` every frame and derives camera position, proximity, and chart
rotation from it directly.

### Scroll-to-camera mapping

Total scroll length = 5 panels × 100vh = 500vh of scroll.

```
scrollProgress = lenis.scroll / (document.body.scrollHeight - window.innerHeight)

cameraPosition = cameraCurve.getPointAt(scrollProgress)
camera.lookAt(lerp between adjacent panel centers)
```

Under `prefers-reduced-motion` Lenis smoothing is off (native scroll), and
panels are revealed without dissolve, lift, or chart turn.

## HTML-to-Texture Pipeline

The core technique that makes this work. Each panel's content is designed in
HTML/CSS, then projected into 3D.

### The pipeline

```
1. Build HTML string for the panel content
   (using template literals with the investigation data)

2. Wrap in SVG foreignObject, injecting base64 @font-face CSS:
   <svg xmlns="http://www.w3.org/2000/svg" width="W" height="H">
     <foreignObject width="100%" height="100%">
       <div xmlns="http://www.w3.org/1999/xhtml" style="...">
         <style>${embeddedFontCSS}</style>
         ${panelHTML}
       </div>
     </foreignObject>
   </svg>

3. Serialize to data URI:
   const svgData = new XMLSerializer().serializeToString(svg)
   const dataURI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData)

4. Load as Image:
   const img = new Image()
   img.src = dataURI
   await img.decode()

5. Draw to Canvas at world-derived resolution:
   const canvas = document.createElement('canvas')
   canvas.width = worldWidth * PX_PER_UNIT * scale   // scale = clamp(devicePixelRatio, 1, 2)
   canvas.height = worldHeight * PX_PER_UNIT * scale
   const ctx = canvas.getContext('2d')
   ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

6. Create Three.js texture:
   const texture = new THREE.CanvasTexture(canvas)
   texture.colorSpace = THREE.SRGBColorSpace
   texture.anisotropy = renderer.capabilities.getMaxAnisotropy()

7. Create mesh:
   const geometry = new THREE.PlaneGeometry(worldWidth, worldHeight)
   const material = createContentMaterial({ map: texture })
   const mesh = new THREE.Mesh(geometry, material)
   mesh.position.set(x, y, z)
```

### Texture resolution

Panel sizes are specified in **world units** (a panel is 6 × 4 units) and
rasterized at `PX_PER_UNIT = 160` CSS pixels per world unit — a 960 × 640 CSS
pixel layout — then multiplied by `clamp(devicePixelRatio, 1, 2)`. Sizing the
canvas from world units (not from an assumed CSS pixel size) is what keeps
type legible when the plate fills the frame.

### Embedded fonts

An SVG foreignObject image is a sandbox: it cannot fetch network resources,
so panel type would silently fall back to a system font. The pipeline
therefore embeds the three faces (Fraunces, Inter, JetBrains Mono) as base64
`@font-face` data URIs, built once per session from the self-hosted
`@fontsource` woff2 files (`src/client/fonts.ts`). The same faces are loaded
for the DOM side via CSS imports in the Astro layout, so DOM and texture type
match exactly.

### Texture updates

Textures are created once per investigation (when the data arrives via SSE)
and disposed when the investigation resets. No per-frame texture updates
needed — the content is static once rendered. The only dynamic elements
(redaction dissolve, chart turn, panel lift) are shader uniforms and mesh
transforms, not texture re-rendering.

### Interactive elements

Real HTML inputs (search form, verdict buttons) are **not** projected to
texture. They are positioned as DOM overlays on top of the canvas, at the
screen position of a world-space anchor, re-projected each frame. This keeps
inputs fully interactive (focus, typing, click) while appearing to exist in
3D space.

## Redaction Dissolve in 3D

The core UI primitive: a document that declassifies as you approach.

### Construction

Each redaction layer owns a set of **ink bars** — thin planes inset from the
page edges with paper showing between them, ragged on the right like
hand-redacted lines — floating 0.02 units above the content plane. Bars of
one layer share one shader material, so the layer dissolves as a unit. A
closed panel therefore reads as a redacted document (ink bars on paper with
glimpses of uncovered lines), never as a black slab.

### Shader

Each redaction material is a `THREE.ShaderMaterial` with uniforms:

| Uniform                  | Meaning                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `proximity`              | 0 = fully redacted, 1 = fully revealed (from camera distance) |
| `layerThreshold`         | proximity at which this layer starts dissolving               |
| `dissolveRange`          | proximity span of the dissolution (default 0.25)              |
| `time`                   | slow noise boil while dissolving                              |
| `inkColor` / `glowColor` | ink (token ink) and terracotta edge glow                      |
| `noiseScale`             | ink patch scale, varied per layer                             |

The fragment shader thresholds **domain-warped fbm noise** against the
dissolve progress: ink recedes in organic patches rather than a clean wipe,
and the receding edges glow warm before they go. Fully dissolved fragments
`discard`, so revealed panels cost nothing extra.

The content plane underneath renders at full fidelity — no in-shader dimming.
In a lit paper room, distance falloff is scene fog's job; dimming content in
the shader muddies panels against a light background.

### Proximity mapping

```
dist = camera.position.distanceTo(panelCenter)
proximity = dist <= 3 ? 1 : dist >= 12 ? 0 : 1 - (dist - 3) / 9
```

Sequential `layerThreshold` values (0.0 / 0.2 / 0.4 …) are the stagger: the
name declassifies before the address, the address before the metadata, the
risk score last. Scrolling back re-redacts everything — the same function in
reverse, no separate close animation.

## The 3D Donut Chart

Panel 2's portfolio chart is a real 3D mesh, not a 2D projection.

### Construction

```
For each token in top 5 holdings:
  1. Calculate segment angle: (tokenValue / totalValue) * Math.PI * 2
  2. Create RingGeometry sector:
     const geo = new THREE.RingGeometry(innerRadius, outerRadius, 32, 1,
                                        startAngle, segmentAngle)
  3. Extrude for depth:
     const extruded = new THREE.ExtrudeGeometry(geo.shape, { depth: 0.3, bevelEnabled: false })
  4. Color from the chart palette (tokens.ts — sRGB hex; THREE.Color cannot
     parse oklch() strings)
  5. Group faces the camera (+Z); no extra rotation — the extrude already
     presents its face forward
```

### Interaction

Raycasting on pointer move (fine pointers only): if the ray intersects a
segment mesh, highlight it (scale up slightly, lighten color) and show a DOM
tooltip with the token name and value, repositioned imperatively each frame.
This is real 3D picking, not 2D hit detection.

### Rotation

The chart group rotates ±7.5 degrees on Y axis, tied to scroll progress
through Panel 2's zone. As you scroll past, the chart turns slightly, showing
its 3D depth. Not a continuous spin — a subtle turn that reveals the
extrusion.

## Lighting

### Lights

- **AmbientLight**: `color: 0xfff5e6, intensity: 0.9` — warm fill, prevents
  dead shadows in a lit reading room
- **DirectionalLight**: `color: 0xffffff, intensity: 1.2, position: (-5, 8, 5)`
  — key light from upper-left. `castShadow: true` with a VSM shadow map
  (2048×2048, `radius: 12`, `blurSamples: 16`) — VSM's blur is what keeps the
  contact shadow soft; PCF edges read as hard grey wedges against paper
- **PointLight**: `color: 0xd4663a (terracotta), intensity: 0.8, distance: 15`
  — follows the camera position, offset slightly. Adds warmth to nearby
  panels. This is what makes the paper feel warm, not clinical.

### Shadows

Panels cast soft shadows onto an invisible `ShadowMaterial` floor plane
below them (opacity 0.12, `fog: false` — fog on the catcher would tint the
whole plane into view as a grey sheet). The shadow grounds the floating
panels in space — without it, they look like cutouts. On portrait aspects the
catcher is hidden: at grazing angles its shadow reads as a stray wedge.

### Fog

`THREE.Fog(paper-warm, near, far)` where near/far track the viewing distance
(`dist + 3` … `dist + 25`; at the desktop resting distance of 5 that is 8 …
30 — just beyond the current panel to two panels ahead). Distant panels are
washed out, the current panel is crisp. The fog color matches the background,
so distant panels dissolve into the paper rather than into darkness.

## Colors

The oklch tokens above are the source of truth for the DOM side (CSS). The
WebGL side cannot parse oklch — `new THREE.Color("oklch(...)")` silently
returns white — so `src/client/tokens.ts` holds the same palette compiled to
sRGB hex, with the oklch origin noted per token, and every material, fog, and
chart segment color imports from it.

- **Paper** is the background and the base surface of all panels. Warm, not
  white. Think museum archive paper, not printer paper.
- **Ink** is the primary text color. High contrast on paper (14:1).
- **Ink-muted** is for secondary text (addresses, metadata). 6:1 contrast.
- **Ink-dim** is for the most subtle text (phase labels, hints). 3:1 —
  decorative, not essential.
- **Accent** (terracotta) is the only color besides ink. Used for:
  - Interactive element focus (search bar border, button hover)
  - Risk score color (when moderate or high)
  - Link underlines in panel content
  - The PointLight tint and the redaction edge glow (warmth in the scene)
- **Risk colors** appear only in Panel 4 (the verdict). Green for low risk,
  amber for moderate, terracotta-red for high. They do not appear earlier —
  showing risk colors before the verdict would prejudice the reading.

### Do not

- Use pure white (`#fff`). Paper has warmth.
- Use dark mode. This is a light, editorial experience.
- Use gradients on UI elements. The only gradient is the fog falloff.
- Use more than one accent color. Terracotta is the only accent.
- Use risk colors during investigation phases.
- Pass oklch() strings to THREE.Color — use `src/client/tokens.ts`.

## Typography

- **Fraunces** (serif) for display: the wordmark, panel headings, risk score,
  large numbers. Optical sizing enabled — looks good at all sizes.
- **Inter** (sans) for body: metadata, descriptions, buttons, status text.
- **JetBrains Mono** for technical identifiers: addresses, sandbox IDs,
  egress IPs, token contracts.

All three faces are self-hosted via `@fontsource` packages — imported as CSS
in the Astro layout for the DOM, and embedded as base64 data URIs for the
texture pipeline (the foreignObject sandbox cannot fetch fonts).

### Scale (texture CSS pixels, at PX_PER_UNIT = 160)

| Use              | Font           | Size    | Weight | Tracking         |
| ---------------- | -------------- | ------- | ------ | ---------------- |
| Wordmark         | Fraunces       | 56px    | 400    | -0.02em          |
| Panel heading    | Fraunces       | 36px    | 400    | -0.02em          |
| Risk score       | Fraunces       | 96px    | 400    | line-height 1    |
| Large numbers    | Fraunces       | 48px    | 400    | -0.02em          |
| Tagline          | Inter          | 17px    | 400    | -0.01em          |
| Body text        | Inter          | 14px    | 400    | -0.01em          |
| Metadata         | Inter          | 13px    | 400    | -0.01em          |
| Section label    | Inter          | 11px    | 400    | 0.08em uppercase |
| Mono identifiers | JetBrains Mono | 11–13px | 400    | 0                |
| Classified mark  | Inter          | 10px    | 600    | 0.15em uppercase |

## Motion

### Easing

| Token            | Curve                              | Use                         |
| ---------------- | ---------------------------------- | --------------------------- |
| `--ease-reveal`  | `cubic-bezier(0.22, 1, 0.36, 1)`   | DOM overlay reveals         |
| `--ease-reverse` | `cubic-bezier(0.4, 0, 0.2, 1)`     | DOM overlay closes (snappy) |
| `--ease-camera`  | `cubic-bezier(0.25, 0.1, 0.25, 1)` | Scroll-return on reset      |

Panel declassification needs no easing curve: it is a pure function of
proximity, so it inherits the scroll's own momentum from Lenis.

### Rules

1. **Camera movement is scroll-driven, not duration-based.** The camera
   position is a function of scroll progress. No tween on the camera during
   normal scrolling — only the scroll-return on "new investigation".

2. **Reveals are proximity-driven shader dissolves.** Each redaction layer
   dissolves over its `dissolveRange` of proximity, thresholded against
   domain-warped noise. Scrolling back re-redacts with the same function —
   the asymmetry of easeReverse lives in the scroll momentum, not a timer.

3. **Stagger between layers is threshold distance, not milliseconds.**
   Within a panel, layers declassify in sequence (0.0 → 0.2 → 0.4) as the
   camera closes in. Name → address → metadata. This creates a cascade that
   feels like the dossier page being assembled.

4. **Chart rotation is scroll-driven.** The donut chart's Y rotation is
   mapped to scroll progress through Panel 2's zone. No tween — it's a
   direct function of scroll position. Scroll forward, it turns right.
   Scroll back, it turns left. Always in sync with the user.

5. **Panels lift as you approach.** Up to 0.15 units of Y translation with
   proximity — a tactile response, like a page rising to meet your hand.

6. **No infinite animations.** No breathing, no pulsing, no idle loops. The
   scene is still unless the user scrolls. (The redaction shader's `time`
   uniform only boils the noise while a layer is mid-dissolve.) Motion is a
   response to user input, not ambient decoration.

7. **Respect `prefers-reduced-motion`.** If set: native scroll instead of
   Lenis smoothing, proximity pinned to 1 (panels revealed, no dissolve), no
   lift, no chart turn, instant scroll-return. Camera still moves through the
   scene (that's the core experience) but without supplementary animation.

## Dependencies

| Library                                       | Version | Source | Purpose                                                     |
| --------------------------------------------- | ------- | ------ | ----------------------------------------------------------- |
| Three.js                                      | ^0.170  | npm    | 3D engine: scene, camera, meshes, lighting, fog, raycasting |
| Lenis                                         | ^1.1    | npm    | Smooth momentum scrolling                                   |
| React                                         | ^19     | npm    | Single island: lifecycle state, DOM overlays                |
| Astro                                         | ^5      | npm    | Page, layout, API route, meta, font CSS                     |
| @fontsource/fraunces, /inter, /jetbrains-mono | latest  | npm    | Self-hosted faces for DOM and texture embedding             |

No tween library. No GSAP, no ScrollTrigger — proximity and scroll progress
drive everything. All loaded via npm (not CDN) for reliable, version-pinned
builds. Three.js is imported as a module: `import * as THREE from 'three'`.

## Performance

- **Texture budget**: a panel rasterizes at 960 × 640 CSS px × scale
  (1–2) → 2.5–9.8MB per panel (plus mipmaps), six panels worst-case ≈ 60–70MB
  on 2× displays, a quarter of that on 1×. Created once per investigation,
  disposed on reset.
- **Geometry**: ~60 meshes total (content planes, redaction bars, chart
  segments). Negligible draw calls; redaction bars per layer share one
  material.
- **Shadows**: 2048×2048 VSM shadow map, one directional light only.
- **Fog**: eliminates overdraw on distant panels (they're fogged out, not
  rendered in detail) and fully-dissolved redaction fragments `discard`.
- **Frame rate**: target 60fps. The scene is simple — no particles, no
  post-processing. If frame drops occur, reduce shadow map to 1024×1024 and
  disable shadows on sub-planes.
- **Low-end autoscaling**: `quality.ts` detects coarse-pointer, low-core/low
  memory devices once per load and caps the render pixel ratio (1.5), the VSM
  shadow map (1024×1024), and the panel texture scale (1×) — cutting the
  worst-case texture budget roughly in half on constrained hardware without
  any manual tuning. On the most constrained devices (very low cores/memory)
  it also disables shadow casting on sub-planes (the floating chart
  segments), keeping only the current panel's grounding shadow.
- **Texture disposal**: on "new investigation", all textures and geometries
  are disposed via `texture.dispose()` and `geometry.dispose()` to prevent
  GPU memory leaks across multiple investigations.

## Accessibility

- **Focus states**: search input and buttons (real DOM overlays) have
  visible terracotta focus rings via a global `:focus-visible` rule.
- **Labels**: the search input has a visually-hidden `<label>`; the canvas is
  `aria-hidden`; loading status is `role="status" aria-live="polite"`;
  errors are `role="alert"`.
- **Keyboard**: Enter submits search. Tab moves between interactive
  elements. Escape resets to a new investigation.
- **Reduced motion**: native scroll, panels revealed without dissolve, no
  lift, no chart turn. Camera still travels through the scene.
- **Touch devices**: native touch scroll. Hover effects (chart segment
  highlight, tooltip) gated behind `(hover: hover) and (pointer: fine)`.
- **Portrait viewports**: camera dollies back so plates stay fully in frame;
  the form overlay keeps full-size touch targets rather than scaling down.
- **Contrast**: ink on paper is 14:1 (AAA). Ink-muted on paper is 6:1 (AA+).
  Accent on paper is 4.5:1 (AA). All essential content meets AA.
- **Screen readers**: the 3D canvas is `aria-hidden`. The downloadable HTML
  report is the accessible version of the content. The live UI is a visual
  experience; the report is the information.
- **Errors**: the API sanitizes failures at the boundary; the UI always shows
  a human sentence and a way back ("Try again"), never a raw stack or a
  silent stall.

## Do's and Don'ts

### Do

- Use Three.js for all 3D — real scene, real camera, real depth.
- Project HTML to canvas textures for panel content, sized from world units
  at PX_PER_UNIT = 160 with embedded base64 fonts.
- Use Lenis for smooth scroll; read progress per frame in the render loop.
- Use proximity-driven shader uniforms for declassification on 3D planes.
- Keep the palette warm and editorial — paper, ink, terracotta.
- Compile colors for WebGL in `src/client/tokens.ts` (sRGB hex).
- Dispose textures and geometries on investigation reset.
- Gate hover effects behind `@media (hover: hover) and (pointer: fine)`.
- Respect `prefers-reduced-motion`.

### Don't

- Use CSS perspective or `translateZ` to fake 3D.
- Use dark mode or a dark palette.
- Use the orb, breathing animations, or any infinite loops.
- Use more than one accent color.
- Use risk colors before Panel 4.
- Use pure white (`#fff`) — paper has warmth.
- Use a tween library — proximity and scroll progress are the animation
  system.
- Load fonts from the network — self-host for the DOM, embed base64 for
  textures.
- Animate anything other than transform, opacity, and shader uniforms.
- Forget to dispose GPU resources on reset.
