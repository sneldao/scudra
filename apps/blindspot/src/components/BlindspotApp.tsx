// BlindspotApp — the main React island.
//
// Manages the investigation lifecycle (search → SSE events → data → verdict)
// and renders the Three.js canvas + DOM overlays.
// The 3D engine modules (scene, panels, shaders, scroll, camera) stay as
// vanilla TS — React just owns the container and the state.

import { useCallback, useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { createScene, type SceneContext } from "../client/scene.js"
import { createScrollSystem, type ScrollSystem } from "../client/scroll.js"
import { getCameraPosition, getLookAtTarget, getActivePanel, panelCenters, PANEL_Z } from "../client/camera-curve.js"
import {
  buildCoverPanel,
  buildPanels,
  type PanelMesh,
  type PanelSystem,
  type InvestigationData,
} from "../client/panels.js"
import { pickChartSegment } from "../client/chart.js"
import { formatCompact } from "../lib/format.js"
import type { InvestigationEvent } from "../lib/events.js"

type Phase = "search" | "loading" | "investigating" | "verdict" | "error"

// World-space point on the cover plate where the live search form sits.
// The form is a real DOM element; each frame we project this anchor to screen
// space so the input appears pinned to the dossier cover.
const FORM_ANCHOR = new THREE.Vector3(0, -0.6, PANEL_Z[0])
const WHITE = new THREE.Color(1, 1, 1)
const DOLLY_DIR = new THREE.Vector3()

export default function BlindspotApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<SceneContext | null>(null)
  const scrollRef = useRef<ScrollSystem | null>(null)
  const panelSystemRef = useRef<PanelSystem | null>(null)
  const coverRef = useRef<PanelMesh | null>(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerRef = useRef(new THREE.Vector2(-10, -10))
  const hoveredRef = useRef<THREE.Mesh | null>(null)
  const reducedRef = useRef(false)
  const hoverEnabledRef = useRef(true)

  const [phase, setPhaseState] = useState<Phase>("search")
  const phaseRef = useRef<Phase>("search")
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])

  const [loadingText, setLoadingText] = useState("resolving identity...")
  const [errorText, setErrorText] = useState("")
  const [reportPath, setReportPath] = useState<string | null>(null)

  // ── Init Three.js scene + render loop ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    hoverEnabledRef.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches

    const ctx = createScene(canvas)
    ctxRef.current = ctx

    const scrollSystem = createScrollSystem(() => {})
    scrollRef.current = scrollSystem

    let disposed = false

    // The dossier cover exists from first paint — before any investigation
    buildCoverPanel().then((cover) => {
      if (disposed) {
        cover.dispose()
        return
      }
      coverRef.current = cover
      ctx.scene.add(cover.mesh)
    })

    const projected = new THREE.Vector3()

    function render() {
      const progress = scrollSystem.getProgress()
      const time = reducedRef.current ? 0 : performance.now() * 0.001

      // Camera
      const camPos = getCameraPosition(progress)
      const lookTarget = getLookAtTarget(progress)
      ctx.camera.position.copy(camPos)
      ctx.camera.lookAt(lookTarget)

      // Portrait viewports see a narrow horizontal slice of the world; dolly
      // back along the view direction so the dossier plate stays in frame
      const aspect = window.innerWidth / window.innerHeight
      const needed = 3.2 / (Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2) * aspect)
      let dist = camPos.distanceTo(lookTarget)
      if (needed > dist) {
        DOLLY_DIR.copy(camPos).sub(lookTarget).normalize()
        ctx.camera.position.copy(lookTarget).addScaledVector(DOLLY_DIR, needed)
        ctx.camera.lookAt(lookTarget)
        dist = needed
      }

      // The shadow catcher only grounds the panels at landscape angles; in
      // portrait its grazing-angle shadow reads as a stray grey wedge
      ctx.floor.visible = aspect >= 1

      // Fog gradient tracks the viewing distance so the active panel stays
      // crisp and the next panels dissolve, dollied back or not
      const fog = ctx.scene.fog as THREE.Fog
      fog.near = dist + 3
      fog.far = dist + 25

      // Point light follows camera
      ctx.pointLight.position.copy(ctx.camera.position)
      ctx.pointLight.position.x += 2
      ctx.pointLight.position.y += 1

      const panelSystem = panelSystemRef.current
      if (panelSystem) {
        // Proximity-based declassification. Under reduced motion the panels
        // are simply revealed — no dissolve, no lift animation, no chart turn.
        for (let i = 0; i < panelSystem.panels.length; i++) {
          const pc = panelCenters[i]
          if (!pc) continue
          let proximity: number
          if (reducedRef.current) {
            proximity = 1
          } else {
            const dist = camPos.distanceTo(pc)
            proximity = dist <= 3 ? 1 : dist >= 12 ? 0 : 1 - (dist - 3) / 9
          }
          for (const plane of panelSystem.panels[i]) {
            plane.setProximity(proximity, time)
          }
        }

        // Chart rotation — scroll-driven, skipped under reduced motion
        if (panelSystem.chart && !reducedRef.current) {
          const chartProgress = THREE.MathUtils.clamp((progress - 0.3) / 0.2, 0, 1)
          panelSystem.chart.group.rotation.y = (chartProgress - 0.5) * (Math.PI / 12)
        }

        // Chart hover — fine pointers only
        if (hoverEnabledRef.current && getActivePanel(progress) === 2 && panelSystem.chart) {
          const hit = pickChartSegment(raycasterRef.current, pointerRef.current, ctx.camera, panelSystem.chart)
          if (hit !== hoveredRef.current) {
            unhighlight(hoveredRef.current)
            hoveredRef.current = hit
            if (hit && tooltipRef.current) {
              const mat = hit.material as THREE.MeshStandardMaterial
              mat.color.set(originalColorOf(hit)).lerp(WHITE, 0.22)
              hit.scale.setScalar(1.05)
              tooltipRef.current.textContent = `${hit.userData.label}: $${formatCompact(hit.userData.value as number)}`
              tooltipRef.current.style.opacity = "1"
            } else if (tooltipRef.current) {
              tooltipRef.current.style.opacity = "0"
            }
          }
          if (hoveredRef.current && tooltipRef.current) {
            hoveredRef.current.getWorldPosition(projected)
            projected.project(ctx.camera)
            const x = (projected.x * 0.5 + 0.5) * window.innerWidth
            const y = (-projected.y * 0.5 + 0.5) * window.innerHeight
            tooltipRef.current.style.transform = `translate3d(${x + 20}px, ${y - 10}px, 0)`
          }
        } else if (hoveredRef.current) {
          unhighlight(hoveredRef.current)
          hoveredRef.current = null
          if (tooltipRef.current) tooltipRef.current.style.opacity = "0"
        }

        // Verdict phase follows the camera, no polling interval
        if (phaseRef.current === "investigating" || phaseRef.current === "verdict") {
          const target: Phase = getActivePanel(progress) === 4 ? "verdict" : "investigating"
          if (target !== phaseRef.current) setPhase(target)
        }
      }

      // Pin the live search form to the cover plate
      if (phaseRef.current === "search" && formRef.current) {
        projected.copy(FORM_ANCHOR).project(ctx.camera)
        const x = (projected.x * 0.5 + 0.5) * window.innerWidth
        const y = (-projected.y * 0.5 + 0.5) * window.innerHeight
        formRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      }

      ctx.renderer.render(ctx.scene, ctx.camera)
      rafId = requestAnimationFrame(render)
    }
    let rafId = requestAnimationFrame(render)

    // Pointer tracking
    function onPointerMove(e: PointerEvent) {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointerRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener("pointermove", onPointerMove)

    // Escape resets
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape" && phaseRef.current !== "search" && phaseRef.current !== "loading") {
        reset()
      }
    }
    window.addEventListener("keydown", onKeydown)

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("keydown", onKeydown)
      scrollSystem.dispose()
      panelSystemRef.current?.dispose()
      panelSystemRef.current = null
      coverRef.current?.dispose()
      coverRef.current = null
      ctx.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Start investigation ──
  const startInvestigation = useCallback(
    async (name: string) => {
      setPhase("loading")
      setErrorText("")
      setLoadingText("Resolving identity…")

      const data: Partial<InvestigationData> = {
        ensName: name,
        topHoldings: [],
        offchainSources: [],
      }

      let closed = false
      const url = `/api/investigate?name=${encodeURIComponent(name)}`
      const eventSource = new EventSource(url)

      eventSource.onmessage = async (e) => {
        // A malformed frame is logged and skipped — throwing here would land
        // in an unhandled rejection and kill the stream handling silently.
        let event: InvestigationEvent
        try {
          event = JSON.parse(e.data)
        } catch {
          console.warn("discarding malformed SSE frame:", e.data)
          return
        }

        switch (event.type) {
          case "ens:resolved":
            data.address = event.address
            data.aliases = event.aliases || []
            data.website = event.website
            data.twitter = event.twitter
            setLoadingText("Booting a disposable machine…")
            break

          case "sandbox:booted":
            setLoadingText("Connecting through a residential IP…")
            break

          case "browser:connected":
            if (event.egressIp && event.egressIp !== "detecting...") {
              data.egressIp = event.egressIp
              data.proxyCountry = event.proxyCountry
            }
            setLoadingText("Fetching the onchain portfolio…")
            break

          case "mobula:data":
            data.totalValueUSD = event.totalValueUSD
            data.assetCount = event.assetCount
            data.realizedPnlUSD = event.realizedPnlUSD
            setLoadingText("Gathering off-chain context…")
            break

          case "offchain:data":
            setLoadingText("Analyzing risk…")
            break

          case "analyzing":
            setLoadingText("Assembling the dossier…")
            break

          case "complete":
            closed = true
            eventSource.close()
            const r = event.report
            data.riskScore = r.riskScore
            data.riskLabel = r.riskLabel
            data.riskSummary = r.riskSummary
            data.privacyVerdict = r.privacyVerdict
            data.reportPath = r.reportPath
            data.egressIp = r.egressIp
            data.proxyCountry = data.proxyCountry || "us"
            setReportPath(r.reportPath)

            // Fill defaults
            if (!data.address) data.address = "unknown"
            if (!data.aliases) data.aliases = []
            if (!data.totalValueUSD) data.totalValueUSD = 0
            if (!data.assetCount) data.assetCount = 0
            if (!data.realizedPnlUSD) data.realizedPnlUSD = 0
            if (!data.egressIp) data.egressIp = "unknown"
            if (!data.proxyCountry) data.proxyCountry = "us"
            // No synthetic fill-in: empty holdings / sources render as honest
            // empty states in the panels.

            await loadPanels(data as InvestigationData)
            break

          case "error":
            closed = true
            eventSource.close()
            setErrorText(event.message)
            setPhase("error")
            break
        }
      }

      // A dropped stream is a failure the user must hear about — otherwise
      // the UI would sit on "loading..." forever with no way out.
      eventSource.onerror = () => {
        eventSource.close()
        if (closed) return
        closed = true
        setErrorText(
          "The investigation stream was interrupted before the dossier completed. Check your connection and try again.",
        )
        setPhase("error")
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // ── Load panels into the scene ──
  const loadPanels = useCallback(
    async (data: InvestigationData) => {
      const ctx = ctxRef.current
      if (!ctx) return

      // The standalone cover is superseded by the full dossier (which
      // includes its own cover plate)
      if (coverRef.current) {
        ctx.scene.remove(coverRef.current.mesh)
        coverRef.current.dispose()
        coverRef.current = null
      }
      if (panelSystemRef.current) {
        ctx.scene.remove(panelSystemRef.current.group)
        panelSystemRef.current.dispose()
      }

      setLoadingText("")
      setPhase("investigating")

      // Reset scroll
      scrollRef.current?.scrollToTop()

      // Build new panels
      const ps = await buildPanels(data)
      ctx.scene.add(ps.group)
      panelSystemRef.current = ps

      // Panel 0 always visible
      ps.panels[0]?.forEach((p) => p.reveal())
    },
    [setPhase],
  )

  // ── Reset ──
  const reset = useCallback(() => {
    const ctx = ctxRef.current
    if (ctx && panelSystemRef.current) {
      ctx.scene.remove(panelSystemRef.current.group)
      panelSystemRef.current.dispose()
      panelSystemRef.current = null
    }
    if (hoveredRef.current) {
      unhighlight(hoveredRef.current)
      hoveredRef.current = null
    }
    if (tooltipRef.current) tooltipRef.current.style.opacity = "0"
    scrollRef.current?.scrollToTop()
    setReportPath(null)
    setErrorText("")
    setPhase("search")

    // Put the cover back so the room is never empty
    if (ctx && !coverRef.current) {
      buildCoverPanel().then((cover) => {
        coverRef.current = cover
        ctx.scene.add(cover.mesh)
      })
    }
  }, [setPhase])

  // ── Submit handler ──
  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = e.currentTarget.querySelector("input")
    const name = input?.value.trim()
    if (!name) return
    startInvestigation(name)
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
        }}
      />

      {/* Live search form, pinned to the cover plate by projection */}
      {phase === "search" && (
        <div
          ref={formRef}
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            zIndex: 10,
            display: "flex",
            justifyContent: "center",
            width: "100%",
            padding: "0 1.25rem",
            boxSizing: "border-box",
            pointerEvents: "none",
            transform: "translate3d(50vw, 50vh, 0) translate(-50%, -50%)",
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              width: "100%",
              maxWidth: "26rem",
              pointerEvents: "auto",
            }}
          >
            <label htmlFor="ens-name" className="sr-only">
              ENS name to investigate
            </label>
            <input
              id="ens-name"
              name="ens-name"
              type="text"
              placeholder="Enter an ENS name"
              autoComplete="off"
              spellCheck="false"
              autoCapitalize="off"
              autoFocus
              style={{
                flex: 1,
                minWidth: 0,
                padding: "0.75rem 1rem",
                border: "1px solid oklch(0.80 0.005 270)",
                borderRadius: 8,
                background: "oklch(0.96 0.008 75)",
                color: "var(--ink)",
                fontFamily: "inherit",
                fontSize: "1rem",
              }}
            />
            <button
              type="submit"
              aria-label="Start investigation"
              style={{
                padding: "0.75rem 1.25rem",
                border: "1px solid oklch(0.80 0.005 270)",
                borderRadius: 8,
                background: "transparent",
                color: "var(--ink)",
                fontFamily: "inherit",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              →
            </button>
          </form>
        </div>
      )}

      {/* Loading status */}
      {phase === "loading" && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 10,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.875rem",
            color: "var(--ink-muted)",
          }}
        >
          {loadingText}
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div
          role="alert"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 10,
            fontSize: "0.875rem",
            color: "oklch(0.48 0.16 25)",
            maxWidth: "min(400px, calc(100vw - 3rem))",
            textAlign: "center",
          }}
        >
          {errorText}
          <button
            onClick={reset}
            style={{
              display: "block",
              margin: "1rem auto 0",
              padding: "0.5rem 1rem",
              border: "1px solid oklch(0.80 0.005 270)",
              borderRadius: 8,
              background: "transparent",
              color: "var(--ink)",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Verdict buttons */}
      {phase === "verdict" && (
        <div
          style={{
            position: "fixed",
            bottom: "3rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "flex",
            gap: "0.75rem",
          }}
        >
          <button
            onClick={() => {
              if (reportPath) {
                window.open("/api/report?path=" + encodeURIComponent(reportPath), "_blank")
              }
            }}
            style={verdictBtnStyle}
          >
            Download report
          </button>
          <button onClick={reset} style={verdictBtnStyle}>
            New investigation
          </button>
        </div>
      )}

      {/* Chart tooltip — positioned imperatively each frame */}
      <div
        ref={tooltipRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          zIndex: 20,
          opacity: 0,
          background: "var(--ink)",
          color: "var(--paper)",
          padding: "0.375rem 0.625rem",
          borderRadius: 6,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.75rem",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      />
    </>
  )
}

const verdictBtnStyle: React.CSSProperties = {
  padding: "0.625rem 1.25rem",
  border: "1px solid oklch(0.80 0.005 270)",
  borderRadius: 8,
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "inherit",
  fontSize: "0.875rem",
  cursor: "pointer",
}

function unhighlight(mesh: THREE.Mesh | null) {
  if (!mesh) return
  const mat = mesh.material as THREE.MeshStandardMaterial
  mat.color.set(originalColorOf(mesh))
  mesh.scale.setScalar(1)
}

function originalColorOf(mesh: THREE.Mesh): string {
  return (mesh.userData as { originalColor: string }).originalColor
}
