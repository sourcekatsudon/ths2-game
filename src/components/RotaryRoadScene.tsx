import { useEffect, useRef, useState } from 'react'
import { CloudSun, Flag, MapPin, Mountain, PlugZap, Route } from 'lucide-react'
import { roadGradeAt, terrainAt, ROAD_SEGMENT_M } from '../simulation/model'
import { ROTARY_EV, type RotarySnapshot } from '../simulation/rotaryModel'
import { rotaryModeTranslationKey, terrainTranslationKey, type TFunction } from '../i18n'

const PX_PER_M = 4.1
const Y_PER_M = 6.2

interface RoadPoint {
  x: number
  y: number
  distance: number
}

function buildRoad(distance: number, viewWidth: number, carX: number) {
  const startDistance = distance - carX / PX_PER_M
  const points: RoadPoint[] = []
  let y = 112
  const stepM = 3
  for (let d = startDistance, x = 0; x <= viewWidth + 20; d += stepM, x += stepM * PX_PER_M) {
    points.push({ x, y, distance: d })
    y -= roadGradeAt(d) * stepM * Y_PER_M
  }
  const carIndex = points.reduce(
    (best, point, i) => (Math.abs(point.distance - distance) < Math.abs(points[best].distance - distance) ? i : best),
    0,
  )
  const offset = 123 - points[carIndex].y
  points.forEach((point) => {
    point.y += offset
  })
  return points
}

function Mx30RotaryCoupeSuv({
  x,
  y,
  angle,
  wheelAngle,
  braking,
  generating,
  externalCharging,
}: {
  x: number
  y: number
  angle: number
  wheelAngle: number
  braking: boolean
  generating: boolean
  externalCharging: boolean
}) {
  return (
    <g className="road-car" transform={`translate(${x - 78} ${y - 65}) rotate(${-angle} 78 65)`}>
      <ellipse cx="77" cy="68" rx="76" ry="8" fill="rgba(11,23,24,.14)" />
      {/* MX-30 fastback coupe-SUV body silhouette with framed roof arch */}
      <path
        d="M11 43 L22 25 C34 15 55 11 82 11 L107 14 C121 17 131 24 138 34 L151 39 C155 42 156 49 153 56 L146 59 L9 59 C6 53 7 47 11 43Z"
        fill="#fafbfa"
        stroke="#152325"
        strokeWidth="2.3"
      />
      {/* Signature MX-30 silver-metallic roof arch & freestyle-door greenhouse */}
      <path d="M23 26 C35 16 55 13 82 13 L106 15 C118 18 126 24 133 34 L28 34 Z" fill="#212d31" />
      <path d="M21 26 C34 14 55 11 83 11 L108 14" fill="none" stroke="#c73c32" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M31 26 C41 17 57 15 76 15 L76 32 L33 32 Z" fill="#b4dce4" opacity=".68" />
      <path d="M80 15 L104 17 C114 19 122 24 129 32 L80 32 Z" fill="#9bcad4" opacity=".62" />
      {/* Freestyle rear-hinged door seam */}
      <path d="M78 15 L78 55" stroke="#768784" strokeWidth="1.2" strokeDasharray="2 1.5" />
      {/* Lower SUV cladding */}
      <path d="M16 56.5 L143 56.5" stroke="#1f2e30" strokeWidth="3.5" strokeLinecap="round" />
      {/* Round-pod MX-30 LED tail lamp */}
      <circle cx="14" cy="43" r={braking ? 4.3 : 3.2} fill={braking ? '#ff311e' : '#e05338'} />
      {/* Sharp Kodo front headlamp */}
      <path d="M139 40 L153 43" stroke="#28d4f0" strokeWidth="3.4" strokeLinecap="round" />
      {/* Rotary engine firing pulse in nose */}
      {generating && <circle cx="130" cy="45" r="3.4" fill="#ff7048" opacity="0.92" />}
      {/* External plug-in charging cable arc at rear-right charge port */}
      {externalCharging && (
        <g>
          <path d="M-8 56 C-4 38 6 36 22 40" fill="none" stroke="#14b8d4" strokeWidth="2.4" strokeDasharray="4 2" />
          <circle cx="22" cy="40" r="3.4" fill="#28d4f0" stroke="#fff" strokeWidth="1" />
        </g>
      )}
      {/* 18-inch wheels */}
      {[36, 122].map((cx) => (
        <g key={cx} transform={`translate(${cx} 59) rotate(${wheelAngle})`}>
          <circle r="14.5" fill="#162426" stroke="#fff" strokeWidth="2.6" />
          <circle r="8.2" fill="#81928e" />
          <path d="M0-7V7M-7 0H7M-5-5L5 5M5-5L-5 5" stroke="#e4ecea" strokeWidth="1.1" />
        </g>
      ))}
      <rect x="52" y="43" width="52" height="9" rx="4.5" fill="#192627" />
      <text x="78" y="49.7" textAnchor="middle" fontSize="5.2" fontWeight="800" fill="#ff8a5b">ROTARY-EV</text>
    </g>
  )
}

export function RotaryRoadScene({ snapshot, t }: { snapshot: RotarySnapshot; t: TFunction }) {
  const stageRef = useRef<HTMLElement>(null)
  const [viewWidth, setViewWidth] = useState(1200)

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      setViewWidth(Math.max(420, (rect.width / Math.max(1, rect.height)) * 220))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const carX = viewWidth * 0.23
  const points = buildRoad(snapshot.distance, viewWidth, carX)
  const roadLine = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const ground = `M ${points[0].x},${points[0].y} L ${points
    .slice(1)
    .map((point) => `${point.x},${point.y}`)
    .join(' L ')} L ${viewWidth},220 L 0,220 Z`
  const carPoint = points.reduce(
    (best, point) => (Math.abs(point.x - carX) < Math.abs(points[best].x - carX) ? points.indexOf(point) : best),
    0,
  )
  const carY = points[carPoint]?.y ?? 123
  const roadAngle = (Math.atan(snapshot.grade) * 180) / Math.PI
  const wheelAngle = ((snapshot.distance / (2 * Math.PI * ROTARY_EV.wheelRadiusM)) * 360) % 360
  const currentSegment = Math.floor(snapshot.distance / ROAD_SEGMENT_M)
  const boundaryDistance = (currentSegment + 1) * ROAD_SEGMENT_M
  const boundaryX = carX + (boundaryDistance - snapshot.distance) * PX_PER_M
  const boundaryPoint = points.reduce(
    (best, point) => (Math.abs(point.x - boundaryX) < Math.abs(points[best].x - boundaryX) ? points.indexOf(point) : best),
    0,
  )
  const boundaryY = points[boundaryPoint]?.y ?? 100
  const nextKind = terrainAt(boundaryDistance + 0.1)

  const braking = snapshot.regenKw > 0.5 || snapshot.frictionBrakeKw > 0.5

  return (
    <section ref={stageRef} className="road-stage" aria-label={t('rotRoadAria')}>
      <div className="stage-chrome">
        <div className="drive-mode">
          <span className={`status-pulse ${snapshot.externalCharging ? 'ext' : snapshot.engineOn ? 'hot' : ''}`} />
          {t(rotaryModeTranslationKey[snapshot.mode])}
        </div>
        <div className="terrain-chip">
          <Mountain size={13} /> {t(terrainTranslationKey[snapshot.terrain])}{' '}
          <b>
            {snapshot.grade >= 0 ? '+' : ''}
            {(snapshot.grade * 100).toFixed(1)}%
          </b>
        </div>
        {snapshot.externalCharging && (
          <div className="terrain-chip ext-chip">
            <PlugZap size={13} /> <b>{snapshot.externalChargeKw.toFixed(0)} kW</b>
          </div>
        )}
      </div>
      <svg className="road-svg" viewBox={`0 0 ${viewWidth} 220`} preserveAspectRatio="none" role="img" aria-label={t(terrainTranslationKey[snapshot.terrain])}>
        <defs>
          <linearGradient id="rotGroundFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d8e3dd" />
            <stop offset="1" stopColor="#a9bbb2" />
          </linearGradient>
          <pattern id="rotRoughPattern" width="16" height="12" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="3" r="1" fill="#71847b" opacity=".25" />
            <circle cx="12" cy="8" r="1.4" fill="#71847b" opacity=".2" />
          </pattern>
        </defs>
        <path
          d={`M0 78 C${viewWidth * 0.14} 25 ${viewWidth * 0.23} 70 ${viewWidth * 0.35} 47 S${viewWidth * 0.6} 74 ${viewWidth * 0.72} 40 S${viewWidth * 0.9} 55 ${viewWidth} 24 L${viewWidth} 160 L0 160Z`}
          fill="#d8e6df"
          opacity=".58"
        />
        <path
          d={`M0 92 C${viewWidth * 0.16} 55 ${viewWidth * 0.3} 89 ${viewWidth * 0.44} 60 S${viewWidth * 0.72} 100 ${viewWidth} 54 L${viewWidth} 180 L0 180Z`}
          fill="#c2d2ca"
          opacity=".75"
        />
        <path d={ground} fill="url(#rotGroundFill)" />
        <path d={ground} fill="url(#rotRoughPattern)" />
        <polyline points={roadLine} fill="none" stroke="#243536" strokeWidth="14" strokeLinejoin="round" />
        <polyline points={roadLine} fill="none" stroke="#f7f9f7" strokeWidth="8" strokeLinejoin="round" />
        <polyline points={roadLine} fill="none" stroke="#bcc9c4" strokeWidth="1.2" strokeDasharray="18 15" />
        {boundaryX > carX + 80 && boundaryX < viewWidth - 45 && (
          <g transform={`translate(${boundaryX} ${boundaryY - 31})`}>
            <line y1="0" y2="29" stroke="#364745" strokeWidth="1" strokeDasharray="3 3" />
            <rect x="-34" y="-18" width="68" height="19" rx="9.5" fill="#172727" />
            <text x="0" y="-5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">
              {t(terrainTranslationKey[nextKind])}
            </text>
          </g>
        )}
        <Mx30RotaryCoupeSuv
          x={carX}
          y={carY}
          angle={roadAngle}
          wheelAngle={wheelAngle}
          braking={braking}
          generating={snapshot.engineFiring}
          externalCharging={snapshot.externalCharging}
        />
      </svg>
      <div className="speed-readout">
        <span>{snapshot.speedKph.toFixed(0)}</span>
        <small>km/h</small>
        <div className="speed-bar">
          <i style={{ width: `${Math.min(100, (snapshot.speedKph / ROTARY_EV.maxSpeedKph) * 100)}%` }} />
        </div>
      </div>
      <div className="route-readout">
        <div>
          <Route size={15} />
          <span>
            <b>{(snapshot.distance / 1000).toFixed(2)}</b> km
          </span>
        </div>
        <div>
          <Flag size={15} />
          <span>
            {t('nextSurfaceIn')} <b>{snapshot.nextTerrainDistance.toFixed(0)}</b> m
          </span>
        </div>
      </div>
      <div className="weather-mark">
        <CloudSun size={17} />
        <span>{t('dry')} · 22°C</span>
      </div>
      <div className="location-mark">
        <MapPin size={12} /> {t('testCourse')}
      </div>
    </section>
  )
}
