import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import {
  EPOWER_3D_LABELS,
  EPOWER_ASSEMBLY_TRANSFORM,
  EPOWER_CAMERA_CONFIG,
  clampEPowerLabelPosition,
  computeEPowerLabelMetrics,
  estimateEPowerLabelDimensions,
  type EPowerLabelId,
} from '../src/components/epowerLabelLayout.js'

interface Rect {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

function rectsOverlap(a: Rect, b: Rect, minGapPx = 0): boolean {
  return !(
    a.right + minGapPx <= b.left ||
    b.right + minGapPx <= a.left ||
    a.bottom + minGapPx <= b.top ||
    b.bottom + minGapPx <= a.top
  )
}

function makeCamera(width: number, height: number, distanceScale = 1): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(EPOWER_CAMERA_CONFIG.fov, width / height, 0.1, 100)
  const [cx, cy, cz] = EPOWER_CAMERA_CONFIG.position
  camera.position.set(cx * distanceScale, cy * distanceScale, cz * distanceScale)
  camera.lookAt(...EPOWER_CAMERA_CONFIG.target)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

function makeAssemblyMatrix(): THREE.Matrix4 {
  const group = new THREE.Group()
  group.position.set(...EPOWER_ASSEMBLY_TRANSFORM.position)
  group.rotation.set(...EPOWER_ASSEMBLY_TRANSFORM.rotation)
  group.updateMatrixWorld(true)
  return group.matrixWorld
}

function projectPoint(
  localPos: readonly [number, number, number],
  assemblyMatrix: THREE.Matrix4,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): [number, number] {
  const world = new THREE.Vector3(localPos[0], localPos[1], localPos[2]).applyMatrix4(assemblyMatrix)
  const ndc = world.clone().project(camera)
  return [ndc.x * (width / 2) + width / 2, -ndc.y * (height / 2) + height / 2]
}

function projectBox(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  assemblyMatrix: THREE.Matrix4,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): Rect {
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const [sx, sy] = projectPoint([x, y, z], assemblyMatrix, camera, width, height)
        left = Math.min(left, sx)
        right = Math.max(right, sx)
        top = Math.min(top, sy)
        bottom = Math.max(bottom, sy)
      }
    }
  }
  return { left, right, top, bottom }
}

const LOCALE_LABELS: Record<'EN' | 'JP' | 'ZH' | 'DE' | 'FR', Record<EPowerLabelId, string>> = {
  EN: {
    engine: 'ENGINE · ZR15DDTe',
    generator: 'GENERATOR · ×2.2',
    dcbus: '5-IN-1 · DC BUS',
    motor: 'DRIVE MOTOR · 151 kW',
    battery: 'BATTERY · 2.1 kWh',
  },
  JP: {
    engine: 'エンジン · ZR15DDTe',
    generator: '発電機 · ×2.2',
    dcbus: '5-IN-1 · DCバス',
    motor: '駆動モーター · 151 kW',
    battery: 'バッテリー · 2.1 kWh',
  },
  ZH: {
    engine: '发动机 · ZR15DDTe',
    generator: '发电机 · ×2.2',
    dcbus: '5-IN-1 · 直流母线',
    motor: '驱动电机 · 151 kW',
    battery: '电池 · 2.1 kWh',
  },
  DE: {
    engine: 'VERBRENNER · ZR15DDTe',
    generator: 'GENERATOR · ×2.2',
    dcbus: '5-IN-1 · DC-BUS',
    motor: 'E-MOTOR · 151 kW',
    battery: 'BATTERIE · 2.1 kWh',
  },
  FR: {
    engine: 'MOTEUR · ZR15DDTe',
    generator: 'GÉNÉRATEUR · ×2.2',
    dcbus: '5-IN-1 · BUS DC',
    motor: 'MOTEUR ÉLEC. · 151 kW',
    battery: 'BATTERIE · 2.1 kWh',
  },
}

test('computeEPowerLabelMetrics stays compact, monotonic, bounded, and hits 515x230 targets', () => {
  const reported = computeEPowerLabelMetrics(515, 230)
  assert.ok(
    reported.effectiveFontPx >= 8 && reported.effectiveFontPx <= 10,
    `Expected 8-10 CSS px font at 515x230, got ${reported.effectiveFontPx}`,
  )
  assert.ok(
    reported.effectiveBadgeHeightPx >= 12 && reported.effectiveBadgeHeightPx <= 16,
    `Expected 12-16 CSS px badge height at 515x230, got ${reported.effectiveBadgeHeightPx}`,
  )
  assert.ok(reported.baseFontPx >= 10, 'Base CSS font must be >= 10px to avoid Chrome min-font-size distortion')

  const narrow = computeEPowerLabelMetrics(360, 230)
  const standard = computeEPowerLabelMetrics(640, 352)
  const wide = computeEPowerLabelMetrics(1280, 720)
  const ultraWide = computeEPowerLabelMetrics(2560, 1440)

  assert.ok(narrow.scale <= reported.scale)
  assert.ok(reported.scale <= standard.scale)
  assert.ok(standard.scale <= wide.scale)
  assert.equal(wide.scale, ultraWide.scale, 'Wide viewports must clamp to an upper bound')
  assert.ok(narrow.effectiveFontPx >= 8 && ultraWide.effectiveFontPx <= 10)
  assert.ok(narrow.effectiveBadgeHeightPx >= 12 && ultraWide.effectiveBadgeHeightPx <= 16)

  // Invalid dimensions fall back safely
  const fallback = computeEPowerLabelMetrics(0, Number.NaN)
  assert.ok(Number.isFinite(fallback.scale) && fallback.scale >= 0.8 && fallback.scale <= 1.0)
})

test('5-locale label strings match src/i18n.ts dictionary entries', () => {
  const i18nSource = readFileSync(new URL('../../src/i18n.ts', import.meta.url), 'utf8')
  const expectedSnippets = [
    "epEngineShort: 'ENGINE'",
    "epEngineShort: 'エンジン'",
    "epEngineShort: '发动机'",
    "epEngineShort: 'VERBRENNER'",
    "epEngineShort: 'MOTEUR'",
    "epMotorShort: 'DRIVE MOTOR'",
    "epMotorShort: '駆動モーター'",
    "epMotorShort: '驱动电机'",
    "epMotorShort: 'E-MOTOR'",
    "epMotorShort: 'MOTEUR ÉLEC.'",
  ]
  for (const snippet of expectedSnippets) {
    assert.ok(i18nSource.includes(snippet), `Expected src/i18n.ts to contain ${snippet}`)
  }
})

test('EPower3D removes distanceFactor and disables pointer events on Html label wrappers', () => {
  const epowerSource = readFileSync(new URL('../../src/components/EPower3D.tsx', import.meta.url), 'utf8')
  assert.ok(!epowerSource.includes('distanceFactor'), 'EPower3D must not use distanceFactor')
  assert.ok(epowerSource.includes('pointerEvents="none"'), 'Html labels must disable pointer events')
  assert.ok(epowerSource.includes('epower-three-label'), 'EPower3D must use dedicated epower-three-label class')
})

test('All 5 locales have zero label-to-label overlap and zero viewport clipping across viewports and zoom range', () => {
  const assemblyMatrix = makeAssemblyMatrix()
  const defaultDist = Math.hypot(...EPOWER_CAMERA_CONFIG.position)
  const minZoomScale = EPOWER_CAMERA_CONFIG.minDistance / defaultDist
  const maxZoomScale = EPOWER_CAMERA_CONFIG.maxDistance / defaultDist

  const viewports: Array<{ name: string; width: number; height: number; zoomScales: number[] }> = [
    { name: 'narrow-360x250', width: 360, height: 250, zoomScales: [1] },
    { name: 'narrow-390x230', width: 390, height: 230, zoomScales: [1] },
    { name: 'reported-515x230', width: 515, height: 230, zoomScales: [minZoomScale, 1, maxZoomScale] },
    { name: 'desktop-640x352', width: 640, height: 352, zoomScales: [minZoomScale, 1, maxZoomScale] },
    { name: 'wide-860x600', width: 860, height: 600, zoomScales: [minZoomScale, 1, maxZoomScale] },
  ]

  for (const vp of viewports) {
    const metrics = computeEPowerLabelMetrics(vp.width, vp.height)
    for (const zoomScale of vp.zoomScales) {
      const camera = makeCamera(vp.width, vp.height, zoomScale)
      for (const [locale, texts] of Object.entries(LOCALE_LABELS)) {
        const rects: Array<{ id: EPowerLabelId; rect: Rect }> = EPOWER_3D_LABELS.map((anchor) => {
          const text = texts[anchor.id]
          const bounds = estimateEPowerLabelDimensions(text, metrics)
          const [rawX, rawY] = projectPoint(anchor.position, assemblyMatrix, camera, vp.width, vp.height)
          const [cx, cy] = clampEPowerLabelPosition(rawX, rawY, vp.width, vp.height, bounds)
          return {
            id: anchor.id,
            rect: {
              left: cx - bounds.widthPx / 2,
              right: cx + bounds.widthPx / 2,
              top: cy - bounds.heightPx / 2,
              bottom: cy + bounds.heightPx / 2,
            },
          }
        })

        // 1. No viewport clipping anywhere
        for (const { id, rect } of rects) {
          assert.ok(
            rect.left >= 0 && rect.right <= vp.width && rect.top >= 0 && rect.bottom <= vp.height,
            `${vp.name} zoom=${zoomScale} ${locale} ${id} clipped viewport: ${JSON.stringify(rect)}`,
          )
        }

        // 2. No pairwise overlap among the 5 labels
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i]
            const b = rects[j]
            assert.ok(
              !rectsOverlap(a.rect, b.rect, 2),
              `${vp.name} zoom=${zoomScale} ${locale}: ${a.id} ${JSON.stringify(a.rect)} overlaps ${b.id} ${JSON.stringify(b.rect)}`,
            )
          }
        }
      }
    }
  }
})

test('Default 515x230 view keeps labels clear of core 3D mechanisms and UI overlays across all 5 locales', () => {
  const width = 515
  const height = 230
  const assemblyMatrix = makeAssemblyMatrix()
  const camera = makeCamera(width, height, 1)
  const metrics = computeEPowerLabelMetrics(width, height)

  // Core mechanism bounding boxes (local to EPowerAssembly)
  const mechanisms: Array<{ name: string; rect: Rect }> = [
    { name: 'engine-block', rect: projectBox([-3.86, 0.71, -0.49], [-2.04, 2.24, 0.49], assemblyMatrix, camera, width, height) },
    { name: 'increaser-gear', rect: projectBox([-1.62, 0.40, -0.52], [-1.38, 1.44, 0.52], assemblyMatrix, camera, width, height) },
    { name: 'generator', rect: projectBox([-0.97, 0.34, 0.19], [0.07, 1.50, 1.35], assemblyMatrix, camera, width, height) },
    { name: 'dcbus', rect: projectBox([0.13, -0.14, -0.04], [1.31, 0.47, 0.68], assemblyMatrix, camera, width, height) },
    { name: 'drive-motor', rect: projectBox([0.83, -1.54, -0.68], [2.07, -0.18, 0.68], assemblyMatrix, camera, width, height) },
    { name: 'reducer-wheel', rect: projectBox([2.43, -1.50, -1.50], [2.67, -0.22, -0.22], assemblyMatrix, camera, width, height) },
    { name: 'wheel-disc', rect: projectBox([3.43, -1.74, -1.74], [3.67, 0.02, 0.02], assemblyMatrix, camera, width, height) },
    { name: 'battery-pack', rect: projectBox([-2.76, -1.57, -0.11], [-1.14, -0.93, 0.81], assemblyMatrix, camera, width, height) },
  ]

  // Stage chrome overlays: top-right drag-hint & bottom-left axis-legend
  const dragHintRect: Rect = { left: width - 210, right: width - 9, top: 8, bottom: 20 }
  const axisLegendRect: Rect = { left: 10, right: 175, top: height - 63, bottom: height - 9 }

  for (const [locale, texts] of Object.entries(LOCALE_LABELS)) {
    for (const anchor of EPOWER_3D_LABELS) {
      const bounds = estimateEPowerLabelDimensions(texts[anchor.id], metrics)
      const [rawX, rawY] = projectPoint(anchor.position, assemblyMatrix, camera, width, height)
      const [cx, cy] = clampEPowerLabelPosition(rawX, rawY, width, height, bounds)

      // Clamping should not need to shift default-view anchors on 515x230
      assert.equal(cx, rawX, `${locale} ${anchor.id} should not hit horizontal clamp at default 515x230`)
      assert.equal(cy, rawY, `${locale} ${anchor.id} should not hit vertical clamp at default 515x230`)

      const labelRect: Rect = {
        left: cx - bounds.widthPx / 2,
        right: cx + bounds.widthPx / 2,
        top: cy - bounds.heightPx / 2,
        bottom: cy + bounds.heightPx / 2,
      }

      assert.ok(
        !rectsOverlap(labelRect, dragHintRect),
        `${locale} ${anchor.id} ${JSON.stringify(labelRect)} overlaps drag-hint ${JSON.stringify(dragHintRect)}`,
      )
      assert.ok(
        !rectsOverlap(labelRect, axisLegendRect),
        `${locale} ${anchor.id} ${JSON.stringify(labelRect)} overlaps axis-legend ${JSON.stringify(axisLegendRect)}`,
      )

      for (const mech of mechanisms) {
        assert.ok(
          !rectsOverlap(labelRect, mech.rect),
          `${locale} ${anchor.id} ${JSON.stringify(labelRect)} covers ${mech.name} ${JSON.stringify(mech.rect)}`,
        )
      }
    }
  }
})

test('clampEPowerLabelPosition handles offscreen edges, tiny containers, and orbited viewpoints cleanly', () => {
  const bounds = { widthPx: 96, heightPx: 14 }
  assert.deepEqual(clampEPowerLabelPosition(-50, -20, 515, 230, bounds), [52, 11])
  assert.deepEqual(clampEPowerLabelPosition(600, 300, 515, 230, bounds), [463, 219])
  assert.deepEqual(clampEPowerLabelPosition(200, 100, 515, 230, bounds), [200, 100])
  // Very narrow viewport narrower than badge width clamps cleanly to center
  assert.deepEqual(clampEPowerLabelPosition(10, 10, 80, 20, bounds), [40, 10])
  // Invalid viewport passes through unchanged without NaN
  assert.deepEqual(clampEPowerLabelPosition(120, 80, 0, 230, bounds), [120, 80])

  // Orbited cameras stay clamped inside viewport with finite coordinates
  const assemblyMatrix = makeAssemblyMatrix()
  const metrics = computeEPowerLabelMetrics(515, 230)
  for (const yawDeg of [-35, -15, 15, 35]) {
    const yaw = (yawDeg * Math.PI) / 180
    const camera = new THREE.PerspectiveCamera(EPOWER_CAMERA_CONFIG.fov, 515 / 230, 0.1, 100)
    const r = Math.hypot(EPOWER_CAMERA_CONFIG.position[0], EPOWER_CAMERA_CONFIG.position[2])
    camera.position.set(Math.sin(yaw) * r, EPOWER_CAMERA_CONFIG.position[1], Math.cos(yaw) * r)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()

    for (const anchor of EPOWER_3D_LABELS) {
      const b = estimateEPowerLabelDimensions(LOCALE_LABELS.JP[anchor.id], metrics)
      const [rawX, rawY] = projectPoint(anchor.position, assemblyMatrix, camera, 515, 230)
      const [cx, cy] = clampEPowerLabelPosition(rawX, rawY, 515, 230, b)
      assert.ok(Number.isFinite(cx) && Number.isFinite(cy))
      assert.ok(cx - b.widthPx / 2 >= 0 && cx + b.widthPx / 2 <= 515)
      assert.ok(cy - b.heightPx / 2 >= 0 && cy + b.heightPx / 2 <= 230)
    }
  }
})

test('Shared THS2 and Rotary-EV label definitions remain untouched', () => {
  const styles = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8')
  const ths = readFileSync(new URL('../../src/components/PowerSplit3D.tsx', import.meta.url), 'utf8')
  const rotary = readFileSync(new URL('../../src/components/Rotary3D.tsx', import.meta.url), 'utf8')

  assert.ok(styles.includes('.three-label { font-size: 9px; padding: 5px 7px; }'))
  assert.ok(styles.includes('.three-label.epower-three-label {'))
  assert.ok(ths.includes('distanceFactor={10}'))
  assert.ok(rotary.includes('distanceFactor={11}'))
  assert.ok(!ths.includes('epower-three-label'))
  assert.ok(!rotary.includes('epower-three-label'))
})
