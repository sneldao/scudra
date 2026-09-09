// Client quality profile — chosen once per page load.
//
// Blindspot's texture budget (~60–70MB worst case on 2× displays) is the
// heaviest cost in the experience. On low-end devices we trade a little
// crispness for dramatically lower memory and draw cost: cap the render
// pixel ratio, shrink the VSM shadow map, reduce shadow blur samples, and
// rasterise panel textures at 1× instead of the device DPR.

export interface QualityProfile {
  /** True on coarse-pointer, low-core/low-memory devices. */
  lowEnd: boolean
  /** Cap for renderer.setPixelRatio. */
  pixelRatioCap: number
  /** Square VSM shadow map edge length (px). */
  shadowMapSize: number
  /** VSM blur samples. */
  shadowBlurSamples: number
  /** Multiplier applied to panel texture rasterisation (HTML → canvas). */
  textureScale: number
}

let cached: QualityProfile | null = null

export function getQuality(): QualityProfile {
  if (cached) return cached

  const coarse = window.matchMedia("(pointer: coarse)").matches
  const cores = navigator.hardwareConcurrency ?? 8
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8
  const lowEnd = coarse && (cores <= 4 || memory <= 4)

  cached = {
    lowEnd,
    pixelRatioCap: lowEnd ? 1.5 : 2,
    shadowMapSize: lowEnd ? 1024 : 2048,
    shadowBlurSamples: lowEnd ? 8 : 16,
    // 1× on low-end keeps a 6×4 panel at 960×640 CSS px ≈ 2.5MB instead of
    // the ~9.8MB worst case at 2×. (See apps/blindspot/DESIGN.md.)
    textureScale: lowEnd ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
  }
  return cached
}