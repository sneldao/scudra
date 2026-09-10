// 3D donut chart — extruded ring segments as real 3D meshes.
// Uses ExtrudeGeometry from RingGeometry sector shapes for depth.
// Raycasting for hover highlight. Scroll-driven Y rotation.

import * as THREE from "three"
import { getQuality } from "./quality.js"

export interface ChartSegment {
  label: string
  value: number
  color: string
}

export interface DonutChartOptions {
  segments: ChartSegment[]
  innerRadius?: number
  outerRadius?: number
  depth?: number
  position?: [number, number, number]
}

export interface DonutChart {
  group: THREE.Group
  segments: THREE.Mesh[]
  dispose: () => void
}

export function createDonutChart(opts: DonutChartOptions): DonutChart {
  const { segments, innerRadius = 1.2, outerRadius = 2.5, depth = 0.3, position = [0, 0, 0] } = opts

  const quality = getQuality()

  const group = new THREE.Group()
  group.position.set(...position)
  group.castShadow = quality.castSubPlaneShadows
  group.receiveShadow = true

  const total = segments.reduce((sum, s) => sum + s.value, 0)
  let currentAngle = 0
  const meshes: THREE.Mesh[] = []
  const geometries: THREE.ExtrudeGeometry[] = []

  for (const seg of segments) {
    const segmentAngle = (seg.value / total) * Math.PI * 2

    // Build a ring sector shape
    const shape = new THREE.Shape()
    const segments_ = 32

    // Outer arc
    shape.absarc(0, 0, outerRadius, currentAngle, currentAngle + segmentAngle, false)
    // Line to inner radius
    const endX = Math.cos(currentAngle + segmentAngle) * innerRadius
    const endY = Math.sin(currentAngle + segmentAngle) * innerRadius
    shape.lineTo(endX, endY)
    // Inner arc (reverse)
    shape.absarc(0, 0, innerRadius, currentAngle + segmentAngle, currentAngle, true)
    shape.closePath()

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: segments_,
    })
    geometries.push(geo)

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(seg.color),
      roughness: 0.6,
      metalness: 0.1,
    })

    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = quality.castSubPlaneShadows
    mesh.receiveShadow = true
    mesh.userData = {
      label: seg.label,
      value: seg.value,
      originalColor: seg.color,
      isChartSegment: true,
    }
    meshes.push(mesh)
    group.add(mesh)

    currentAngle += segmentAngle
  }

  function dispose() {
    geometries.forEach((g) => g.dispose())
    meshes.forEach((m) => {
      if (m.material instanceof THREE.Material) m.material.dispose()
    })
  }

  return { group, segments: meshes, dispose }
}

// Raycaster for hover detection
export function pickChartSegment(
  raycaster: THREE.Raycaster,
  pointer: THREE.Vector2,
  camera: THREE.PerspectiveCamera,
  chart: DonutChart,
): THREE.Mesh | null {
  raycaster.setFromCamera(pointer, camera)
  const intersects = raycaster.intersectObjects(chart.segments, false)
  return intersects.length > 0 ? (intersects[0].object as THREE.Mesh) : null
}
