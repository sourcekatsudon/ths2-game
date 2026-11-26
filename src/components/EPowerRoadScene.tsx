import { useEffect, useRef, useState } from 'react'
import { CloudSun, Flag, MapPin, Mountain, Route } from 'lucide-react'
import { roadGradeAt, terrainAt, ROAD_SEGMENT_M } from '../simulation/model'
import { EPOWER, type EPowerSnapshot } from '../simulation/epowerModel'
import { epowerModeTranslationKey, terrainTranslationKey, type TFunction } from '../i18n'

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

function QashqaiCrossover({
  x,
  y,
  angle,
  wheelAngle,
  braking,
  generating,
}: {
  x: number
  y: number
  angle: number
  wheelAngle: number
  braking: boolean
  generating: boolean
}) {
  return (
    <g className="road-car" transform={`translate(${x - 78} ${y - 65}) rotate(${-angle} 78 65)`}>
      <ellipse cx="77" cy="68" rx="76" ry="8" fill="rgba(11,23,24,.14)" />
      {/* Modern crossover SUV body silhouette (Qashqai-inspired) */}
      <path
        d="M12 41 L20 26 C30 16 48 11 72 11 L106 13 C121 15 130 22 137 33 L150 38 C154 41 155 48 153 55 L146 59 L9 59 C6 53 7 45 12 41Z"
        fill="#f9fbfa"
        stroke="#132224"
        strokeWidth="2.3"
      />
      {/* Dark floating roof & window beltline */}
      <path d="M23 26 C34 16 52 13 74 13 L105 15 C117 17 125 23 132 33 L27 34 Z" fill="#1e3136" />
      <path d="M26 25 C37 16 52 14 73 14 L73 32 L30 32 Z" fill="#b4e6db" opacity=".68" />
      <path d="M77 14 L103 16 C114 18 121 23 128 32 L77 32 Z" fill="#9bd8cc" opacity=".6" />
      <path d="M75 13 L75 33" stroke="#859a97" strokeWidth="1.6" />
      {/* Sculpted shoulder crease & lower cladding */}
      <path d="M15 41 L142 39" fill="none" stroke="#c0ceca" strokeWidth="1.3" />
      <path d="M18 57 L142 57" stroke="#223436" strokeWidth="3.2" strokeLinecap="round" />
      {/* Rear LED tail light (brightens on braking/regen) */}
      <path d="M9 44 L22 43" stroke={braking ? '#ff3b24' : '#ff7048'} strokeWidth={braking ? '5' : '3.6'} strokeLinecap="round" />
      {/* Front sharp DRL headlamp */}
      <path d="M137 40 L152 43" stroke="#3be2b5" strokeWidth="3.6" strokeLinecap="round" />
      {/* Subtle hood generator pulse indicator */}
      {generating && <circle cx="132" cy="46" r="3" fill="#ff7048" opacity="0.85" />}
      {/* Larger SUV wheels */}
      {[36, 122].map((cx) => (
        <g key={cx} transform={`translate(${cx} 59) rotate(${wheelAngle})`}>
          <circle r="14.5" fill="#162426" stroke="#fff" strokeWidth="2.6" />
          <circle r="8.2" fill="#829490" />
          <path d="M0-7V7M-7 0H7M-5-5L5 5M5-5L-5 5" stroke="#e4ecea" strokeWidth="1.1" />
        </g>
      ))}
      <rect x="58" y="43" width="42" height="9" rx="4.5" fill="#172827" />
      <text x="79" y="49.7" textAnchor="middle" fontSize="5.4" fontWeight="800" fill="#caff45">e-POWER</text>
    </g>
  )
}

export function EPowerRoadScene({ snapshot, t }: { snapshot: EPowerSnapshot; t: TFunction }) {
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
  const wheelAngle = ((snapshot.distance / (2 * Math.PI * EPOWER.wheelRadiusM)) * 360) % 360
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
    <section ref={stageRef} className="road-stage" aria-label={t('epRoadAria')}>
      <div className="stage-chrome">
        <div className="drive-mode">
          <span className={`status-pulse ${snapshot.engineOn ? 'hot' : ''}`} />
          {t(epowerModeTranslationKey[snapshot.mode])}
        </div>
        <div className="terrain-chip">
          <Mountain size={13} /> {t(terrainTranslationKey[snapshot.terrain])}{' '}
          <b>
            {snapshot.grade >= 0 ? '+' : ''}
            {(snapshot.grade * 100).toFixed(1)}%
          </b>
        </div>
      </div>
      <svg className="road-svg" viewBox={`0 0 ${viewWidth} 220`} preserveAspectRatio="none" role="img" aria-label={t(terrainTranslationKey[snapshot.terrain])}>
        <defs>
          <linearGradient id="epGroundFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d8e3dd" />
            <stop offset="1" stopColor="#a9bbb2" />
          </linearGradient>
          <pattern id="epRoughPattern" width="16" height="12" patternUnits="userSpaceOnUse">
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
        <path d={ground} fill="url(#epGroundFill)" />
        <path d={ground} fill="url(#epRoughPattern)" />
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
        <QashqaiCrossover
          x={carX}
          y={carY}
          angle={roadAngle}
          wheelAngle={wheelAngle}
          braking={braking}
          generating={snapshot.flows.genToDcKw > 0.3}
        />
      </svg>
      <div className="speed-readout">
        <span>{snapshot.speedKph.toFixed(0)}</span>
        <small>km/h</small>
        <div className="speed-bar">
          <i style={{ width: `${Math.min(100, snapshot.speedKph / 1.8)}%` }} />
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
