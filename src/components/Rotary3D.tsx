import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Html, OrbitControls } from '@react-three/drei'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  ROTARY_GEOMETRY,
  epitrochoidPoint,
  getChamberState,
  rotorApex,
  rotorCenter,
  rotorFlankPoint,
  rotorOrientation,
  type RotaryStrokePhase,
} from '../simulation/rotaryGeometry'
import type { RotarySnapshot } from '../simulation/rotaryModel'
import type { RotaryLiveAngles } from '../simulation/useRotarySimulation'
import type { TFunction } from '../i18n'

/**
 * Educational 3D visualization of the Mazda MX-30 Rotary-EV (e-SKYACTIV R-EV, 8C-PH).
 *
 * Highlights:
 * 1. Exact 8C epitrochoid housing H(t) = e(cos 3t, sin 3t) + R(cos t, sin t) with R/e = 120/17.5.
 * 2. True eccentric orbital + 1:3 self-rotation motion:
 *    C(theta) = (e cos theta, e sin theta), phi = theta / 3, all 3 apex seals riding H(t).
 * 3. Real-time 3-chamber gas volumes morphing between each rotor flank and the trochoid wall,
 *    colored smoothly by exact phase (Intake -> Compression -> Ignition/Expansion -> Exhaust),
 *    turning neutral immediately when the rotary engine stops.
 * 4. Coaxial packaging (8C Rotary + 1:1 Generator | Mechanical Air Gap & DC Bus | 125 kW Drive Motor)
 *    with NO rigid shaft connecting the generation side to the traction drive side.
 */

const MM_TO_3D = 1 / 112
const CHAMBER_SEGMENTS = 24
const CHAMBER_HALF_Z = (ROTARY_GEOMETRY.ROTOR_WIDTH_MM * 0.44) * MM_TO_3D
const ROTOR_DEPTH = ROTARY_GEOMETRY.ROTOR_WIDTH_MM * MM_TO_3D
const HOUSING_DEPTH = (ROTARY_GEOMETRY.ROTOR_WIDTH_MM + 12) * MM_TO_3D

const PHASE_COLORS: Record<RotaryStrokePhase, { color: THREE.Color; emissive: THREE.Color; opacity: number; emissiveIntensity: number }> = {
  INTAKE: {
    color: new THREE.Color('#34a8f5'),
    emissive: new THREE.Color('#136ec4'),
    opacity: 0.48,
    emissiveIntensity: 0.35,
  },
  COMPRESSION: {
    color: new THREE.Color('#7f5ef5'),
    emissive: new THREE.Color('#4a2bc2'),
    opacity: 0.62,
    emissiveIntensity: 0.55,
  },
  COMBUSTION: {
    color: new THREE.Color('#ff7a29'),
    emissive: new THREE.Color('#ff3d00'),
    opacity: 0.78,
    emissiveIntensity: 1.15,
  },
  EXHAUST: {
    color: new THREE.Color('#c95e52'),
    emissive: new THREE.Color('#6b2822'),
    opacity: 0.42,
    emissiveIntensity: 0.25,
  },
}

const IDLE_CHAMBER_COLOR = new THREE.Color('#b6c6c1')
const IDLE_CHAMBER_EMISSIVE = new THREE.Color('#000000')

function gearShape(teeth: number, rootRadius: number, toothDepth: number) {
  const shape = new THREE.Shape()
  const steps = teeth * 4
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    const phase = i % 4
    const radius = rootRadius + (phase === 1 || phase === 2 ? toothDepth : 0)
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function SpurGear({
  teeth,
  radius,
  depth,
  width = 0.22,
  color,
  markerColor = '#caff45',
}: {
  teeth: number
  radius: number
  depth: number
  width?: number
  color: string
  markerColor?: string
}) {
  const geometry = useMemo(() => {
    const shape = gearShape(teeth, radius - depth, depth)
    const hole = new THREE.Path()
    hole.absarc(0, 0, radius * 0.22, 0, Math.PI * 2, true)
    shape.holes.push(hole)
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: width,
      bevelEnabled: true,
      bevelSize: 0.02,
      bevelThickness: 0.018,
      bevelSegments: 2,
    })
    g.center()
    return g
  }, [teeth, radius, depth, width])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} metalness={0.58} roughness={0.25} />
      </mesh>
      <mesh position={[radius * 0.6, 0, width * 0.56]}>
        <boxGeometry args={[radius * 0.4, 0.065, 0.045]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.45} />
      </mesh>
    </group>
  )
}

function writeChamberPositions(posAttr: THREE.BufferAttribute, shaftAngleRad: number, chamberIndex: 0 | 1 | 2) {
  const arr = posAttr.array as Float32Array
  const startT = rotorOrientation(shaftAngleRad) + (chamberIndex * Math.PI * 2) / 3
  const spanT = (Math.PI * 2) / 3
  const zF = CHAMBER_HALF_Z
  const zB = -CHAMBER_HALF_Z
  let ptr = 0

  const writeTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
  ) => {
    arr[ptr++] = ax; arr[ptr++] = ay; arr[ptr++] = az
    arr[ptr++] = bx; arr[ptr++] = by; arr[ptr++] = bz
    arr[ptr++] = cx; arr[ptr++] = cy; arr[ptr++] = cz
  }

  for (let i = 0; i < CHAMBER_SEGMENTS; i += 1) {
    const u0 = i / CHAMBER_SEGMENTS
    const u1 = (i + 1) / CHAMBER_SEGMENTS
    const h0 = epitrochoidPoint(startT + u0 * spanT, MM_TO_3D)
    const h1 = epitrochoidPoint(startT + u1 * spanT, MM_TO_3D)
    const f0 = rotorFlankPoint(shaftAngleRad, chamberIndex, u0, MM_TO_3D)
    const f1 = rotorFlankPoint(shaftAngleRad, chamberIndex, u1, MM_TO_3D)

    // Front gas face (+Z)
    writeTri(f0.x, f0.y, zF, h0.x, h0.y, zF, h1.x, h1.y, zF)
    writeTri(f0.x, f0.y, zF, h1.x, h1.y, zF, f1.x, f1.y, zF)

    // Back gas face (-Z)
    writeTri(f0.x, f0.y, zB, h1.x, h1.y, zB, h0.x, h0.y, zB)
    writeTri(f0.x, f0.y, zB, f1.x, f1.y, zB, h1.x, h1.y, zB)

    // Outer trochoid wall ribbon
    writeTri(h0.x, h0.y, zB, h1.x, h1.y, zB, h1.x, h1.y, zF)
    writeTri(h0.x, h0.y, zB, h1.x, h1.y, zF, h0.x, h0.y, zF)
  }

  posAttr.needsUpdate = true
}

interface PulseConfig {
  points: [number, number, number][]
  powerKw: number
  direction: 1 | -1
  maxPowerKw: number
  color: string
  emissive: string
}

function PowerPulseStream({ points, powerKw, direction, maxPowerKw, color, emissive }: PulseConfig) {
  const pulseCount = 5
  const curve = useMemo(() => {
    const vecs = points.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    return new THREE.CatmullRomCurve3(vecs)
  }, [points])

  const tubeGeometry = useMemo(() => new THREE.TubeGeometry(curve, 28, 0.05, 10, false), [curve])
  useEffect(() => () => tubeGeometry.dispose(), [tubeGeometry])
  const meshRefs = useRef<Array<THREE.Mesh | null>>([])
  const phaseRef = useRef(0)
  const upAxis = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const quat = useMemo(() => new THREE.Quaternion(), [])

  const active = powerKw > 0.25
  const intensity = Math.min(1, powerKw / Math.max(1, maxPowerKw))

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    if (active) {
      const speed = 0.28 + intensity * 1.15
      phaseRef.current = (phaseRef.current + dt * speed * direction + 10) % 1
    }
    for (let i = 0; i < pulseCount; i += 1) {
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      mesh.visible = active
      if (!active) continue
      const u = (phaseRef.current + i / pulseCount) % 1
      curve.getPointAt(u, pos)
      curve.getTangentAt(u, tangent)
      if (direction < 0) tangent.negate()
      mesh.position.copy(pos)
      quat.setFromUnitVectors(upAxis, tangent.normalize())
      mesh.quaternion.copy(quat)
      const s = 0.78 + intensity * 0.42
      mesh.scale.set(s, s * 1.15, s)
    }
  })

  return (
    <group>
      <mesh geometry={tubeGeometry}>
        <meshStandardMaterial
          color={active ? color : '#b8c5c0'}
          emissive={active ? emissive : '#000000'}
          emissiveIntensity={active ? 0.25 + intensity * 0.55 : 0}
          metalness={0.32}
          roughness={0.35}
          transparent
          opacity={active ? 0.92 : 0.42}
        />
      </mesh>
      {Array.from({ length: pulseCount }).map((_, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            meshRefs.current[idx] = el
          }}
          visible={false}
        >
          <coneGeometry args={[0.095, 0.23, 6]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.85} metalness={0.2} roughness={0.25} />
        </mesh>
      ))}
    </group>
  )
}

const GEN_TO_DC_POINTS: [number, number, number][] = [
  [-0.78, 0.98, 0.22],
  [-0.3, 1.28, 0.26],
  [0.18, 1.16, 0.24],
]

const DC_TO_MOTOR_POINTS: [number, number, number][] = [
  [0.58, 1.14, 0.22],
  [1.06, 1.18, 0.16],
  [1.46, 0.96, 0.08],
]

const BATT_TO_DC_POINTS: [number, number, number][] = [
  [0.25, -1.24, 0.24],
  [0.34, -0.25, 0.35],
  [0.36, 0.85, 0.24],
]

const EXT_TO_DC_POINTS: [number, number, number][] = [
  [-2.65, -1.55, 0.42],
  [-1.35, -1.52, 0.44],
  [-0.55, -1.48, 0.38],
]

function RotaryPowertrainAssembly({
  snapshot,
  liveAnglesRef,
  exploded,
  t,
}: {
  snapshot: RotarySnapshot
  liveAnglesRef?: RefObject<RotaryLiveAngles>
  exploded: boolean
  t: TFunction
}) {
  const rotorGroupRef = useRef<THREE.Group>(null)
  const eccShaftRef = useRef<THREE.Group>(null)
  const genRotorRef = useRef<THREE.Group>(null)
  const motorRotorRef = useRef<THREE.Group>(null)
  const redPinionRef = useRef<THREE.Group>(null)
  const redWheelRef = useRef<THREE.Group>(null)
  const wheelHubRef = useRef<THREE.Group>(null)
  const sparkFlashRef = useRef<THREE.Mesh>(null)
  const chamberMatRefs = useRef<Array<THREE.MeshStandardMaterial | null>>([null, null, null])
  const fallbackAngles = useRef({ theta: 0, motor: 0, wheel: 0 })

  // 1. Exact Epitrochoid Housing Ring Geometry (outer shell minus exact H(t) inner bore)
  const housingGeometry = useMemo(() => {
    const outer = new THREE.Shape()
    const samples = 144
    const wallThickness = 20 * MM_TO_3D
    for (let i = 0; i <= samples; i += 1) {
      const a = (i / samples) * Math.PI * 2
      const p = epitrochoidPoint(a, MM_TO_3D)
      const len = Math.hypot(p.x, p.y) || 1
      const ox = p.x + (p.x / len) * wallThickness
      const oy = p.y + (p.y / len) * wallThickness
      if (i === 0) outer.moveTo(ox, oy)
      else outer.lineTo(ox, oy)
    }
    outer.closePath()

    const inner = new THREE.Path()
    for (let i = samples; i >= 0; i -= 1) {
      const a = (i / samples) * Math.PI * 2
      const p = epitrochoidPoint(a, MM_TO_3D)
      if (i === samples) inner.moveTo(p.x, p.y)
      else inner.lineTo(p.x, p.y)
    }
    inner.closePath()
    outer.holes.push(inner)

    const g = new THREE.ExtrudeGeometry(outer, {
      depth: HOUSING_DEPTH,
      bevelEnabled: true,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      bevelSegments: 2,
    })
    g.center()
    return g
  }, [])

  // 2. Back side-housing plate with side intake & exhaust port silhouettes
  const backPlateGeometry = useMemo(() => {
    const plate = new THREE.Shape()
    const samples = 96
    const wallThickness = 20 * MM_TO_3D
    for (let i = 0; i <= samples; i += 1) {
      const a = (i / samples) * Math.PI * 2
      const p = epitrochoidPoint(a, MM_TO_3D)
      const len = Math.hypot(p.x, p.y) || 1
      const ox = p.x + (p.x / len) * wallThickness
      const oy = p.y + (p.y / len) * wallThickness
      if (i === 0) plate.moveTo(ox, oy)
      else plate.lineTo(ox, oy)
    }
    plate.closePath()
    const hole = new THREE.Path()
    hole.absarc(0, 0, 26 * MM_TO_3D, 0, Math.PI * 2, true)
    plate.holes.push(hole)
    const g = new THREE.ExtrudeGeometry(plate, { depth: 0.07, bevelEnabled: false })
    g.center()
    return g
  }, [])

  // 3. Exact Curved-Flank Triangular Rotor Geometry (centered at rotor center C = (0,0) in local rotor space)
  const rotorGeometry = useMemo(() => {
    const shape = new THREE.Shape()
    const perFace = 22
    // Build rotor outline at shaftAngle = 0 shifted back by C(0) = (e, 0) so rotor local origin is its exact center!
    const c0 = rotorCenter(0, MM_TO_3D)
    for (let face = 0; face < 3; face += 1) {
      for (let j = 0; j < perFace; j += 1) {
        const u = j / perFace
        const p = rotorFlankPoint(0, face as 0 | 1 | 2, u, MM_TO_3D)
        const lx = p.x - c0.x
        const ly = p.y - c0.y
        if (face === 0 && j === 0) shape.moveTo(lx, ly)
        else shape.lineTo(lx, ly)
      }
    }
    shape.closePath()

    // Central bearing & internal phasing gear bore
    const bore = new THREE.Path()
    bore.absarc(0, 0, 38 * MM_TO_3D, 0, Math.PI * 2, true)
    shape.holes.push(bore)

    const g = new THREE.ExtrudeGeometry(shape, {
      depth: ROTOR_DEPTH * 0.94,
      bevelEnabled: true,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      bevelSegments: 2,
    })
    g.center()
    return g
  }, [])

  // 4. Three Reusable Dynamic Gas Chamber BufferGeometries (updated in-place each frame)
  const chamberGeometries = useMemo(() => {
    return ([0, 1, 2] as const).map((idx) => {
      const geo = new THREE.BufferGeometry()
      const vertCount = CHAMBER_SEGMENTS * 6 * 3 // 6 triangles per segment
      const positions = new Float32Array(vertCount * 3)
      const attr = new THREE.BufferAttribute(positions, 3)
      attr.setUsage(THREE.DynamicDrawUsage)
      geo.setAttribute('position', attr)
      writeChamberPositions(attr, 0, idx)
      geo.computeVertexNormals()
      return geo
    })
  }, [])

  const frameGeometries = useMemo(() => {
    const battBox = new THREE.BoxGeometry(2.35, 0.56, 1.18)
    const edges = {
      battery: new THREE.EdgesGeometry(battBox),
    }
    battBox.dispose()
    return edges
  }, [])

  useEffect(
    () => () => {
      housingGeometry.dispose()
      backPlateGeometry.dispose()
      rotorGeometry.dispose()
      chamberGeometries.forEach((g) => g.dispose())
      frameGeometries.battery.dispose()
    },
    [housingGeometry, backPlateGeometry, rotorGeometry, chamberGeometries, frameGeometries],
  )

  // Local apex positions (relative to rotor center C) for the 3 apex seals
  const localApexes = useMemo(() => {
    const c0 = rotorCenter(0, MM_TO_3D)
    return ([0, 1, 2] as const).map((i) => {
      const a = rotorApex(0, i, MM_TO_3D)
      return {
        x: a.x - c0.x,
        y: a.y - c0.y,
        angle: (i * Math.PI * 2) / 3,
      }
    })
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    let theta: number
    let motorAngle: number
    let wheelAngle: number

    if (liveAnglesRef?.current) {
      theta = liveAnglesRef.current.visualShaftAngleRad
      motorAngle = liveAnglesRef.current.motorAngleRad
      wheelAngle = liveAnglesRef.current.wheelAngleRad
    } else {
      fallbackAngles.current.theta += ((snapshot.engine.rpm * Math.PI) / 30) * ROTARY_GEOMETRY.VISUAL_SCALE * dt
      fallbackAngles.current.motor += ((snapshot.motor.rpm * Math.PI) / 30) * ROTARY_GEOMETRY.VISUAL_SCALE * dt
      fallbackAngles.current.wheel += ((snapshot.wheelRpm * Math.PI) / 30) * ROTARY_GEOMETRY.VISUAL_SCALE * dt
      theta = fallbackAngles.current.theta
      motorAngle = fallbackAngles.current.motor
      wheelAngle = fallbackAngles.current.wheel
    }

    // 1. Exact eccentric orbital center C(theta) and 1:3 self-rotation phi = theta / 3
    const center = rotorCenter(theta, MM_TO_3D)
    const phi = rotorOrientation(theta)
    if (rotorGroupRef.current) {
      rotorGroupRef.current.position.set(center.x, center.y, 0)
      rotorGroupRef.current.rotation.z = phi
    }

    // 2. Eccentric shaft + coaxial 1:1 generator rotor (rotate at theta)
    if (eccShaftRef.current) {
      eccShaftRef.current.rotation.z = theta
    }
    if (genRotorRef.current) {
      genRotorRef.current.rotation.x = -theta
    }

    // 3. Independent drive motor + 11.236:1 reduction gear + wheel hub
    if (motorRotorRef.current) motorRotorRef.current.rotation.x = motorAngle
    if (redPinionRef.current) redPinionRef.current.rotation.x = motorAngle
    if (redWheelRef.current) redWheelRef.current.rotation.x = -wheelAngle
    if (wheelHubRef.current) wheelHubRef.current.rotation.x = -wheelAngle

    // 4. Update all 3 combustion chamber gas meshes & smooth phase colors
    const firing = snapshot.engineFiring
    let anySpark = false
    for (let k = 0; k < 3; k += 1) {
      const geo = chamberGeometries[k]
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
      writeChamberPositions(posAttr, theta, k as 0 | 1 | 2)

      const chamber = getChamberState(theta, k as 0 | 1 | 2, firing)
      if (chamber.sparkActive) anySpark = true

      const mat = chamberMatRefs.current[k]
      if (mat) {
        if (!firing && snapshot.engine.rpm < 80) {
          mat.color.copy(IDLE_CHAMBER_COLOR)
          mat.emissive.copy(IDLE_CHAMBER_EMISSIVE)
          mat.emissiveIntensity = 0
          mat.opacity = 0.16
        } else {
          const style = PHASE_COLORS[chamber.phase]
          mat.color.copy(style.color)
          mat.emissive.copy(style.emissive)
          const boost = chamber.sparkActive ? 0.8 : 0
          mat.emissiveIntensity = (firing ? style.emissiveIntensity : 0.15) + boost
          mat.opacity = firing ? style.opacity : 0.28
        }
      }
    }

    if (sparkFlashRef.current) {
      sparkFlashRef.current.visible = anySpark
      if (anySpark) {
        const pulse = 0.85 + 0.3 * Math.sin(theta * 14)
        sparkFlashRef.current.scale.setScalar(pulse)
      }
    }
  })

  const genActive = snapshot.flows.genToDcKw > 0.3
  const motorDriving = snapshot.flows.motorFromDcKw > 0.3
  const motorRegen = snapshot.flows.regenToDcKw > 0.3
  const battDischarging = snapshot.flows.battToDcKw > 0.3
  const battCharging = snapshot.flows.dcToBattKw > 0.3
  const frictionActive = snapshot.frictionBrakeKw > 0.8
  const extCharging = snapshot.externalCharging

  const motorLinePower = motorDriving ? snapshot.flows.motorFromDcKw : motorRegen ? snapshot.flows.regenToDcKw : 0
  const motorLineDir: 1 | -1 = motorRegen ? -1 : 1
  const motorLineColor = motorRegen ? '#3b9be8' : '#25c29d'
  const motorLineEmissive = motorRegen ? '#1c6ab5' : '#0f8c6e'

  const battLinePower = battDischarging ? snapshot.flows.battToDcKw : battCharging ? snapshot.flows.dcToBattKw : 0
  const battLineDir: 1 | -1 = battDischarging ? 1 : -1
  const battLineColor = battDischarging ? '#7ad83b' : '#3896e4'
  const battLineEmissive = battDischarging ? '#3d8f12' : '#1b66b0'

  const socRatio = Math.max(0.04, Math.min(1, snapshot.batterySoc))
  const explodeShift = exploded ? 0.52 : 0

  return (
    <group position={[0.08, 0.16, 0]} rotation={[0.14, 0.36, 0]}>
      {/* =====================================================================
          1. MAZDA 8C-PH SINGLE-ROTOR ROTARY ENGINE (Hero Cutaway Foreground)
          Oriented so local +Z faces -X (straight toward the viewer on the left)
          while its eccentric shaft extends along +X into the coaxial Generator!
      ===================================================================== */}
      <group position={[-2.25 - explodeShift * 0.8, 0.22, 0]} rotation={[0, -Math.PI / 2, 0]}>
        {/* Semi-transparent 2-lobe epitrochoid housing wall */}
        <mesh geometry={housingGeometry} castShadow receiveShadow>
          <meshPhysicalMaterial
            color="#d8e3df"
            metalness={0.35}
            roughness={0.22}
            transparent
            opacity={0.78}
            clearcoat={0.4}
          />
        </mesh>

        {/* Back side housing plate (toward generator) */}
        <mesh geometry={backPlateGeometry} position={[0, 0, -HOUSING_DEPTH * 0.54]}>
          <meshStandardMaterial color="#8f9e99" metalness={0.55} roughness={0.35} />
        </mesh>

        {/* Side Intake Port (bottom-right quadrant, cool blue) */}
        <group position={[0.48, -0.44, -HOUSING_DEPTH * 0.45]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.19, 0.24, 18]} />
            <meshStandardMaterial
              color="#2ea3f2"
              emissive="#146ec2"
              emissiveIntensity={snapshot.engineFiring ? 0.5 : 0.1}
              metalness={0.4}
              roughness={0.3}
            />
          </mesh>
        </group>

        {/* Side Exhaust Port (bottom-left quadrant, warm red-steel) */}
        <group position={[-0.48, -0.44, -HOUSING_DEPTH * 0.45]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.19, 0.24, 18]} />
            <meshStandardMaterial
              color="#c8594e"
              emissive="#9c2c20"
              emissiveIntensity={snapshot.engineFiring ? 0.55 : 0.1}
              metalness={0.45}
              roughness={0.32}
            />
          </mesh>
        </group>

        {/* Twin Spark Plugs + Direct Injection Nozzle at Top Pinched Waist (+Y) */}
        {[-0.14, 0.14].map((sx, idx) => (
          <group key={idx} position={[sx, 1.18, 0]}>
            <mesh>
              <cylinderGeometry args={[0.045, 0.045, 0.34, 12]} />
              <meshStandardMaterial color="#e8eef0" metalness={0.3} roughness={0.25} />
            </mesh>
            <mesh position={[0, 0.16, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 0.08, 10]} />
              <meshStandardMaterial color="#e06038" metalness={0.5} roughness={0.3} />
            </mesh>
          </group>
        ))}

        {/* Synchronized Ignition Spark Flash at Top TDC (ONLY when firing!) */}
        <mesh ref={sparkFlashRef} position={[0, 0.89, 0]} visible={false}>
          <sphereGeometry args={[0.16, 14, 14]} />
          <meshStandardMaterial
            color="#fff6a8"
            emissive="#ff7b1c"
            emissiveIntensity={2.2}
            transparent
            opacity={0.92}
          />
        </mesh>

        {/* 3 Live Morphing Combustion Chambers (exact space between rotor flanks & epitrochoid) */}
        {chamberGeometries.map((geo, idx) => (
          <mesh key={idx} geometry={geo}>
            <meshStandardMaterial
              ref={(el) => {
                chamberMatRefs.current[idx] = el
              }}
              color="#b6c6c1"
              transparent
              opacity={0.2}
              roughness={0.28}
              metalness={0.05}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ))}

        {/* Fixed Stationary Phasing Gear (centered on housing origin) */}
        <mesh position={[0, 0, -0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.21, 0.21, 0.24, 24]} />
          <meshStandardMaterial color="#4b5a57" metalness={0.72} roughness={0.28} />
        </mesh>

        {/* Orbiting & Self-Rotating Triangular Rotor (C(theta), phi = theta/3) */}
        <group ref={rotorGroupRef}>
          <mesh geometry={rotorGeometry} castShadow receiveShadow>
            <meshStandardMaterial color="#3c4b49" metalness={0.68} roughness={0.26} />
          </mesh>
          {/* Rotor face index & metallic trim ring */}
          <mesh position={[0, 0, ROTOR_DEPTH * 0.48]}>
            <ringGeometry args={[0.35, 0.42, 32]} />
            <meshStandardMaterial color="#ff7a48" metalness={0.55} roughness={0.25} side={THREE.DoubleSide} />
          </mesh>
          {/* Three Apex Seals (2.5 mm proportional tips riding H(t) with zero separation) */}
          {localApexes.map((ap, i) => (
            <mesh
              key={i}
              position={[ap.x, ap.y, 0]}
              rotation={[0, 0, ap.angle]}
              castShadow
            >
              <boxGeometry args={[0.075, 0.042, ROTOR_DEPTH * 0.99]} />
              <meshStandardMaterial
                color={i === 0 ? '#caff45' : '#ff8c42'}
                emissive={i === 0 ? '#688500' : '#a83c0c'}
                emissiveIntensity={0.6}
                metalness={0.45}
                roughness={0.22}
              />
            </mesh>
          ))}
        </group>

        {/* Eccentric Shaft + Eccentric Lobe (rotates at exact shaft angle theta = 3 * phi) */}
        <group ref={eccShaftRef}>
          {/* Main shaft journal */}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.11, 0.11, 1.35, 20]} />
            <meshStandardMaterial color="#ff7048" metalness={0.65} roughness={0.24} />
          </mesh>
          {/* Visible eccentric lobe offset by exact e = 17.5 mm along +X in shaft local frame */}
          <mesh position={[ROTARY_GEOMETRY.E_MM * MM_TO_3D, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.27, 0.27, ROTOR_DEPTH * 0.72, 24]} />
            <meshStandardMaterial color="#d85b34" metalness={0.62} roughness={0.26} />
          </mesh>
          {/* Phase pointer bar on front nose of eccentric shaft */}
          <mesh position={[0.11, 0, 0.69]}>
            <boxGeometry args={[0.24, 0.045, 0.04]} />
            <meshStandardMaterial color="#caff45" emissive="#5f7a00" emissiveIntensity={0.6} />
          </mesh>
        </group>

        {/* Subtle stroke zone indicator dots around housing (not color-only!) */}
        <Html position={[0, 1.48, 0.1]} center distanceFactor={11}>
          <span className="rotary-zone-tag spark-zone">⚡ TDC</span>
        </Html>
        <Html position={[1.38, -0.58, 0.1]} center distanceFactor={11}>
          <span className="rotary-zone-tag intake-zone">IN</span>
        </Html>
        <Html position={[-1.38, -0.58, 0.1]} center distanceFactor={11}>
          <span className="rotary-zone-tag exhaust-zone">EXH</span>
        </Html>
      </group>

      {/* =====================================================================
          2. COAXIAL GENERATOR (Direct 1:1 Coupling to 8C Eccentric Shaft)
      ===================================================================== */}
      {/* Generation shaft bridge (8C -> Generator ONLY; stops before DC bus gap!) */}
      <mesh position={[-1.56 - explodeShift * 0.4, 0.22, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.095, 0.095, 0.9 + explodeShift * 0.6, 18]} />
        <meshStandardMaterial color="#e86840" metalness={0.68} roughness={0.24} />
      </mesh>

      <group position={[-0.86 - explodeShift * 0.25, 0.22, 0]}>
        {/* Cutaway Generator Stator */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.62, 0.62, 0.92, 28, 1, true, Math.PI * 0.25, Math.PI * 1.42]} />
          <meshStandardMaterial color="#5c6edd" metalness={0.52} roughness={0.28} side={THREE.DoubleSide} />
        </mesh>
        {[-0.4, 0.4].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.52, 0.065, 12, 32]} />
            <meshStandardMaterial
              color="#d47d42"
              emissive={genActive ? '#7f44ff' : '#000000'}
              emissiveIntensity={genActive ? 0.6 : 0}
              metalness={0.62}
              roughness={0.3}
            />
          </mesh>
        ))}
        {/* Spinning Generator Rotor (locked 1:1 to eccentric shaft) */}
        <group ref={genRotorRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.37, 0.37, 0.82, 24]} />
            <meshStandardMaterial color="#8796f8" metalness={0.6} roughness={0.22} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2
            return (
              <mesh key={i} position={[0, Math.cos(a) * 0.38, Math.sin(a) * 0.38]} rotation={[a, 0, 0]}>
                <boxGeometry args={[0.78, 0.055, 0.058]} />
                <meshStandardMaterial
                  color={i === 0 ? '#ff7048' : '#d2ff4d'}
                  emissive={i === 0 ? '#a8290b' : '#4a6b00'}
                  emissiveIntensity={0.45}
                />
              </mesh>
            )
          })}
        </group>
      </group>

      {/* =====================================================================
          3. MECHANICAL ISOLATION GAP & INVERTER / DC BUS (NO RIGID SHAFT!)
      ===================================================================== */}
      <group position={[0.32, 0.22, 0]}>
        {/* Translucent isolation bulkhead ring emphasizing zero shaft coupling */}
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.68, 0.028, 12, 36]} />
          <meshStandardMaterial color="#6e8680" metalness={0.4} roughness={0.4} transparent opacity={0.65} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <ringGeometry args={[0.14, 0.66, 28]} />
          <meshPhysicalMaterial color="#d8eee6" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>

      {/* Inverter / 355V DC Bus Module sitting above the coaxial gap */}
      <group position={[0.36, 1.18, 0.2]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.05, 0.44, 0.64]} />
          <meshStandardMaterial color="#1b2d2d" metalness={0.55} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.33]}>
          <boxGeometry args={[0.84, 0.1, 0.03]} />
          <meshStandardMaterial
            color={extCharging ? '#38d9f5' : genActive || motorDriving || motorRegen ? '#3ae0b4' : '#7a8e88'}
            emissive={extCharging ? '#0ea5c6' : motorRegen ? '#2f89df' : genActive || motorDriving ? '#1bb88e' : '#000000'}
            emissiveIntensity={extCharging || genActive || motorDriving || motorRegen ? 0.95 : 0}
          />
        </mesh>
      </group>

      {/* =====================================================================
          4. COAXIAL 125 kW DRIVE MOTOR (Mechanically Independent Axis!)
      ===================================================================== */}
      <group position={[1.48 + explodeShift * 0.25, 0.22, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.66, 0.66, 1.12, 32, 1, true, Math.PI * 0.22, Math.PI * 1.44]} />
          <meshStandardMaterial color="#25ab8d" metalness={0.52} roughness={0.24} side={THREE.DoubleSide} />
        </mesh>
        {[-0.49, 0.49].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.55, 0.07, 12, 32]} />
            <meshStandardMaterial
              color="#d47d42"
              emissive={motorRegen ? '#2d8be6' : motorDriving ? '#1fd6a3' : '#000000'}
              emissiveIntensity={motorDriving || motorRegen ? 0.62 : 0}
              metalness={0.62}
              roughness={0.28}
            />
          </mesh>
        ))}
        {/* Spinning Drive Motor Rotor */}
        <group ref={motorRotorRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.41, 0.41, 0.96, 24]} />
            <meshStandardMaterial color="#4fd4b5" metalness={0.58} roughness={0.22} />
          </mesh>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = (i / 8) * Math.PI * 2
            return (
              <mesh key={i} position={[0, Math.cos(a) * 0.42, Math.sin(a) * 0.42]} rotation={[a, 0, 0]}>
                <boxGeometry args={[0.92, 0.055, 0.06]} />
                <meshStandardMaterial
                  color={i === 0 ? '#ff643c' : '#caff45'}
                  emissive={i === 0 ? '#9c2309' : '#3d6300'}
                  emissiveIntensity={0.5}
                />
              </mesh>
            )
          })}
        </group>
        {/* Independent motor output shaft to 11.236 reducer */}
        <mesh position={[0.76, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.56, 16]} />
          <meshStandardMaterial color="#2ba88c" metalness={0.65} roughness={0.25} />
        </mesh>
      </group>

      {/* =====================================================================
          5. 11.236:1 REDUCTION GEARSET & FRONT WHEEL HUB
      ===================================================================== */}
      <group position={[2.46 + explodeShift * 0.5, 0.22, 0]}>
        <group ref={redPinionRef}>
          <SpurGear teeth={10} radius={0.23} depth={0.055} color="#27b896" markerColor="#caff45" />
        </group>
        <group ref={redWheelRef} position={[0, -0.78, -0.22]}>
          <SpurGear teeth={28} radius={0.62} depth={0.07} color="#2c4a45" markerColor="#ff7048" />
        </group>
        <mesh position={[0.46, -0.78, -0.22]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.095, 0.095, 0.96, 18]} />
          <meshStandardMaterial color="#3c5450" metalness={0.72} roughness={0.25} />
        </mesh>
      </group>

      {/* Wheel & Friction Brake Disc */}
      <group position={[3.42 + explodeShift * 0.65, -0.56, -0.22]}>
        <group ref={wheelHubRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.68, 0.68, 0.11, 32]} />
            <meshStandardMaterial color="#d4deda" metalness={0.7} roughness={0.22} />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.7, 0.11, 14, 36]} />
            <meshStandardMaterial color="#233231" metalness={0.25} roughness={0.72} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2
            return (
              <mesh key={i} position={[0.06, Math.cos(a) * 0.32, Math.sin(a) * 0.32]} rotation={[a, 0, 0]}>
                <boxGeometry args={[0.04, 0.52, 0.075]} />
                <meshStandardMaterial color={i === 0 ? '#ff7048' : '#506460'} metalness={0.5} roughness={0.3} />
              </mesh>
            )
          })}
        </group>
        <mesh position={[0, 0.59, 0.11]}>
          <boxGeometry args={[0.22, 0.22, 0.28]} />
          <meshStandardMaterial
            color={frictionActive ? '#ff5930' : '#4a5a57'}
            emissive={frictionActive ? '#e0340b' : '#000000'}
            emissiveIntensity={frictionActive ? 0.95 : 0}
            metalness={0.45}
            roughness={0.3}
          />
        </mesh>
      </group>

      {/* =====================================================================
          6. LARGE 17.8 kWh PHEV HV BATTERY PACK + EXTERNAL PLUG-IN PORT
      ===================================================================== */}
      <group position={[0.25, -1.52, 0.25]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.35, 0.56, 1.18]} />
          <meshPhysicalMaterial color="#e0f2ec" transparent opacity={0.36} roughness={0.18} />
        </mesh>
        <lineSegments geometry={frameGeometries.battery}>
          <lineBasicMaterial color="#3c7765" transparent opacity={0.68} />
        </lineSegments>
        {/* Dynamic SOC Fill Core */}
        <mesh position={[-1.08 + 1.08 * socRatio, 0, 0]}>
          <boxGeometry args={[2.16 * socRatio, 0.38, 0.94]} />
          <meshStandardMaterial
            color={extCharging ? '#2ac4ea' : snapshot.batterySoc < 0.25 ? '#ff8b47' : '#2ec293'}
            emissive={extCharging ? '#0c88a8' : battDischarging ? '#4da823' : battCharging ? '#1e75c7' : '#125946'}
            emissiveIntensity={extCharging || battDischarging || battCharging ? 0.6 : 0.2}
            roughness={0.3}
          />
        </mesh>
      </group>

      {/* External CHAdeMO Plug-In Charger Post (visible left-bottom when plugged in or standby) */}
      <group position={[-2.78, -1.52, 0.42]}>
        <mesh castShadow>
          <boxGeometry args={[0.38, 0.72, 0.36]} />
          <meshStandardMaterial
            color={extCharging ? '#14343b' : '#dce4e1'}
            metalness={0.4}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[0, 0.16, 0.19]}>
          <boxGeometry args={[0.24, 0.14, 0.02]} />
          <meshStandardMaterial
            color={extCharging ? '#3be6ff' : '#9aa8a4'}
            emissive={extCharging ? '#14b8d4' : '#000000'}
            emissiveIntensity={extCharging ? 1.1 : 0}
          />
        </mesh>
      </group>

      {/* =====================================================================
          7. DIRECTIONAL 3D ELECTRICAL POWER PULSE STREAMS
      ===================================================================== */}
      <PowerPulseStream
        points={GEN_TO_DC_POINTS}
        powerKw={snapshot.flows.genToDcKw}
        direction={1}
        maxPowerKw={50}
        color="#816bf5"
        emissive="#5842d9"
      />
      <PowerPulseStream
        points={DC_TO_MOTOR_POINTS}
        powerKw={motorLinePower}
        direction={motorLineDir}
        maxPowerKw={125}
        color={motorLineColor}
        emissive={motorLineEmissive}
      />
      <PowerPulseStream
        points={BATT_TO_DC_POINTS}
        powerKw={battLinePower}
        direction={battLineDir}
        maxPowerKw={125}
        color={battLineColor}
        emissive={battLineEmissive}
      />
      {extCharging && (
        <PowerPulseStream
          points={EXT_TO_DC_POINTS}
          powerKw={snapshot.externalChargeKw}
          direction={1}
          maxPowerKw={36}
          color="#28d4f0"
          emissive="#0c95b0"
        />
      )}

      {/* =====================================================================
          8. FLOATING LABELS
      ===================================================================== */}
      <Html position={[-2.35 - explodeShift * 0.8, 1.98, 0.25]} center distanceFactor={11}>
        <span className="three-label engine-label">8C-PH · 830cc (3:1)</span>
      </Html>
      <Html position={[-0.86 - explodeShift * 0.25, -0.78, 0.45]} center distanceFactor={11}>
        <span className="three-label mg1-label">{t('epGeneratorShort')} · 1:1</span>
      </Html>
      <Html position={[0.36, 1.72, 0.35]} center distanceFactor={11}>
        <span className="three-label dcbus-label">{t('rotCoaxialGap')} · 355V</span>
      </Html>
      <Html position={[1.6 + explodeShift * 0.25, -0.82, 0.35]} center distanceFactor={11}>
        <span className="three-label mg2-label">{t('epMotorShort')} · 125 kW</span>
      </Html>
      <Html position={[0.25, -2.14, 0.45]} center distanceFactor={11}>
        <span className="three-label batt-label">{t('battery')} · 17.8 kWh</span>
      </Html>
      {extCharging && (
        <Html position={[-2.78, -2.14, 0.5]} center distanceFactor={11}>
          <span className="three-label ext-label">⚡ PLUG-IN {snapshot.externalChargeKw.toFixed(0)} kW</span>
        </Html>
      )}
    </group>
  )
}

export function Rotary3D({
  snapshot,
  liveAnglesRef,
  t,
}: {
  snapshot: RotarySnapshot
  liveAnglesRef?: RefObject<RotaryLiveAngles>
  t: TFunction
}) {
  const [exploded, setExploded] = useState(false)

  return (
    <div className="three-wrap">
      <Canvas
        key="rotary-3d-canvas"
        camera={{ position: [-3.9, 1.55, 8.8], fov: 38 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.38} />
        <directionalLight position={[4, 6, 8]} intensity={2.15} castShadow />
        <pointLight position={[-6, 1, 5]} intensity={16} color="#fff2e6" />
        <pointLight position={[5, -2, 5]} intensity={12} color="#d4fff2" />
        <RotaryPowertrainAssembly
          snapshot={snapshot}
          liveAnglesRef={liveAnglesRef}
          exploded={exploded}
          t={t}
        />
        <ContactShadows position={[0, -2.42, 0]} opacity={0.24} scale={12} blur={2.6} />
        <Environment preset="studio" />
        <OrbitControls enablePan={false} minDistance={5.2} maxDistance={14.5} autoRotate={false} />
      </Canvas>
      <div className="three-view-toggle">
        <button
          type="button"
          className={!exploded ? 'active' : ''}
          onClick={() => setExploded(false)}
        >
          {t('rotViewCutaway')}
        </button>
        <button
          type="button"
          className={exploded ? 'active' : ''}
          onClick={() => setExploded(true)}
        >
          {t('rotViewExploded')}
        </button>
      </div>
      <div className="drag-hint">{t('rotVisualScaleHint')} · {t('dragHint')}</div>
    </div>
  )
}
