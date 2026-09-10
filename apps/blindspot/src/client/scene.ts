// 3D scene setup — renderer, camera, lights, fog, background.
// The space is a well-lit paper archive: warm paper background, ink text,
// one terracotta accent. Distant panels dissolve into the paper via fog;
// panel content itself renders at full fidelity (no in-shader dimming).

import * as THREE from "three"
import { TOKENS } from "./tokens.js"
import { getQuality } from "./quality.js"

export interface SceneContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  pointLight: THREE.PointLight
  floor: THREE.Mesh
  dispose: () => void
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const q = getQuality()

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatioCap))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  // VSM blurs the shadow-catcher contact shadows; PCF edges read as hard
  // grey wedges against the paper background
  renderer.shadowMap.type = THREE.VSMShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0

  const bgColor = new THREE.Color(TOKENS.paper)
  renderer.setClearColor(bgColor)

  const scene = new THREE.Scene()
  scene.background = bgColor
  // Warm fog — distant panels dissolve into paper, current panel stays crisp
  scene.fog = new THREE.Fog(new THREE.Color(TOKENS.fog), 8, 30)

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 5)

  // ── Lights ──
  // Bright, even fill — a well-lit reading room, not a dim archive
  const ambient = new THREE.AmbientLight(0xfff5e6, 0.9)
  scene.add(ambient)

  // Key light from upper-left, casts the soft shadow that grounds the panels
  const directional = new THREE.DirectionalLight(0xffffff, 1.2)
  directional.position.set(-5, 8, 5)
  directional.castShadow = true
  directional.shadow.mapSize.width = q.shadowMapSize
  directional.shadow.mapSize.height = q.shadowMapSize
  directional.shadow.camera.near = 0.5
  directional.shadow.camera.far = 60
  directional.shadow.camera.left = -12
  directional.shadow.camera.right = 12
  directional.shadow.camera.top = 12
  directional.shadow.camera.bottom = -12
  directional.shadow.bias = -0.0005
  directional.shadow.radius = 12
  directional.shadow.blurSamples = q.shadowBlurSamples
  scene.add(directional)

  // Accent point light — terracotta tint, follows camera for warmth
  const pointLight = new THREE.PointLight(0xd4663a, 0.8, 15)
  pointLight.position.copy(camera.position)
  scene.add(pointLight)

  // Invisible shadow catcher — without it the floating panels read as cutouts.
  // Fog must stay off the material or the whole plane tints into view.
  const floorGeometry = new THREE.PlaneGeometry(60, 140)
  const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.12, fog: false })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, -2.8, -40)
  floor.receiveShadow = true
  scene.add(floor)

  // Handle resize
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener("resize", onResize)

  function dispose() {
    window.removeEventListener("resize", onResize)
    floorGeometry.dispose()
    floorMaterial.dispose()
    renderer.dispose()
  }

  return { renderer, scene, camera, pointLight, floor, dispose }
}
