// HTML-to-texture pipeline.
// Converts an HTML string into a THREE.CanvasTexture by routing through
// SVG <foreignObject> → Image → Canvas. This lets us design panels in
// HTML/CSS and project them onto 3D planes with real depth.
//
// Sizing: callers describe a panel in world units (the same numbers used for
// PlaneGeometry). PX_PER_UNIT converts that to the CSS pixel box the panel
// HTML is authored against; `scale` then rasterises that box at device
// resolution so text stays crisp on retina displays.

import * as THREE from "three"
import { getEmbeddedFontCSS } from "./fonts.js"
import { getQuality } from "./quality.js"

// CSS pixels per world unit. A 6×4 panel becomes a 960×640 CSS box.
export const PX_PER_UNIT = 160

export interface TextureOptions {
  worldWidth: number
  worldHeight: number
  scale?: number
}

export async function htmlToTexture(html: string, opts: TextureOptions): Promise<THREE.CanvasTexture> {
  const { worldWidth, worldHeight } = opts
  // A caller-passed scale wins; otherwise rasterise at the quality-driven
  // scale (1× on low-end, device DPR on capable machines) so the texture
  // budget stays bounded on constrained hardware.
  const scale = opts.scale ?? getQuality().textureScale

  const cw = Math.round(worldWidth * PX_PER_UNIT)
  const ch = Math.round(worldHeight * PX_PER_UNIT)
  const rw = Math.round(cw * scale)
  const rh = Math.round(ch * scale)

  // The foreignObject sandbox cannot fetch fonts, so they are inlined.
  const fontCSS = await getEmbeddedFontCSS()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rw}" height="${rh}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml"
  style="width:${rw}px;height:${rh}px;font-size:${16 * scale}px;box-sizing:border-box;">
<style>${fontCSS}</style>
${html}
</div>
</foreignObject>
</svg>`

  const dataUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)

  const img = new Image()
  img.src = dataUri
  await img.decode()

  const canvas = document.createElement("canvas")
  canvas.width = rw
  canvas.height = rh
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0, rw, rh)

  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 4
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  return texture
}
