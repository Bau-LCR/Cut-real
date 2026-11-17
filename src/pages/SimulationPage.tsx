import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { Sidebar } from '../components/Sidebar'

const G = 6.6743e-11
const C = 299792458
const EARTH_MASS = 5.9722e24
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const fmt = (value: number, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString('es-AR', { maximumFractionDigits: digits })
  : '—'

type Vector3 = { x: number; y: number; z: number }
type CelestialBody = { id: string; name: string; mass: number; radiusKm: number; x: number; y: number; z: number; color: string }
type CameraState = { yaw: number; pitch: number; distance: number; target: Vector3 }
type CameraFrame = { position: Vector3; forward: Vector3; right: Vector3; up: Vector3 }

const PRESETS: Record<string, Omit<CelestialBody, 'id' | 'x' | 'y' | 'z'>> = {
  'Cuerpo nuevo': { name: 'Cuerpo nuevo', mass: 1, radiusKm: 6371, color: '#70aaff' },
  Tierra: { name: 'Tierra', mass: 1, radiusKm: 6371, color: '#63a8ff' },
  Luna: { name: 'Luna', mass: 0.0123, radiusKm: 1737, color: '#c4cbd6' },
  Júpiter: { name: 'Júpiter', mass: 317.8, radiusKm: 69911, color: '#d5a46c' },
  'Masa compacta': { name: 'Masa compacta', mass: 1000, radiusKm: 1000, color: '#d28cff' },
}

function normalize(v: Vector3): Vector3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}
function dot(a: Vector3, b: Vector3) { return a.x * b.x + a.y * b.y + a.z * b.z }
function cross(a: Vector3, b: Vector3): Vector3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}
function cameraFrame(camera: CameraState): CameraFrame {
  const position = {
    x: camera.target.x + camera.distance * Math.cos(camera.pitch) * Math.sin(camera.yaw),
    y: camera.target.y + camera.distance * Math.sin(camera.pitch),
    z: camera.target.z + camera.distance * Math.cos(camera.pitch) * Math.cos(camera.yaw),
  }
  const forward = normalize({ x: camera.target.x - position.x, y: camera.target.y - position.y, z: camera.target.z - position.z })
  let right = normalize(cross(forward, { x: 0, y: 1, z: 0 }))
  if (Math.hypot(right.x, right.y, right.z) < 0.001) right = { x: 1, y: 0, z: 0 }
  const up = normalize(cross(right, forward))
  return { position, forward, right, up }
}
function projectPoint(point: Vector3, frame: CameraFrame, width: number, height: number) {
  const relative = { x: point.x - frame.position.x, y: point.y - frame.position.y, z: point.z - frame.position.z }
  const depth = dot(relative, frame.forward)
  if (depth <= 0.2) return null
  const focal = Math.min(width, height) * 0.95
  const factor = focal / depth
  return {
    x: width * 0.5 + dot(relative, frame.right) * factor,
    y: height * 0.5 - dot(relative, frame.up) * factor,
    depth,
    factor,
  }
}
function screenRay(x: number, y: number, camera: CameraState, width: number, height: number) {
  const frame = cameraFrame(camera)
  const focal = Math.min(width, height) * 0.95
  const nx = (x - width * 0.5) / focal
  const ny = (height * 0.5 - y) / focal
  const direction = normalize({
    x: frame.forward.x + frame.right.x * nx + frame.up.x * ny,
    y: frame.forward.y + frame.right.y * nx + frame.up.y * ny,
    z: frame.forward.z + frame.right.z * nx + frame.up.z * ny,
  })
  return { origin: frame.position, direction }
}
function intersectHorizontalPlane(ray: { origin: Vector3; direction: Vector3 }, y: number) {
  if (Math.abs(ray.direction.y) < 0.0001) return null
  const t = (y - ray.origin.y) / ray.direction.y
  if (t < 0) return null
  return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t }
}
function bodyId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'body-' + Date.now() + '-' + Math.floor(Math.random() * 100000)
}

export function SimulationPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const interactionRef = useRef<{ mode: 'rotate' | 'pan' | 'move'; id?: string; pointerId: number; lastX: number; lastY: number } | null>(null)
  const cameraRef = useRef<CameraState>({ yaw: 0.72, pitch: 0.62, distance: 34, target: { x: 0, y: -0.3, z: 0 } })
  const bodiesRef = useRef<CelestialBody[]>([])
  const [bodies, setBodies] = useState<CelestialBody[]>([
    { id: 'earth', name: 'Tierra', mass: 1, radiusKm: 6371, x: 0, y: 0, z: 0, color: '#63a8ff' },
  ])
  const [selectedId, setSelectedId] = useState<string | null>('earth')
  const [camera, setCamera] = useState<CameraState>(cameraRef.current)
  const [layerCount, setLayerCount] = useState(7)
  const [showVectors, setShowVectors] = useState(true)
  cameraRef.current = camera
  bodiesRef.current = bodies

  const selectedBody = useMemo(() => bodies.find((body) => body.id === selectedId) ?? null, [bodies, selectedId])
  const physics = useMemo(() => {
    if (!selectedBody) return null
    const kg = selectedBody.mass * EARTH_MASS
    const metres = selectedBody.radiusKm * 1000
    const gravity = G * kg / (metres * metres)
    const escape = Math.sqrt(2 * G * kg / metres)
    const schwarzschildKm = 2 * G * kg / (C * C) / 1000
    return { gravity, escape, schwarzschildKm, earthGravity: gravity / 9.80665 }
  }, [selectedBody])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const background = ctx.createLinearGradient(0, 0, width, height)
      background.addColorStop(0, '#081322')
      background.addColorStop(0.55, '#0b1930')
      background.addColorStop(1, '#070e1b')
      ctx.fillStyle = background
      ctx.fillRect(0, 0, width, height)

      for (let i = 0; i < 72; i++) {
        const x = (i * 137.5 + 23) % width
        const y = (i * 71.7 + 11) % height
        ctx.fillStyle = 'rgba(190,218,255,' + (0.12 + (i % 4) * 0.06) + ')'
        ctx.fillRect(x, y, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1)
      }

      const frame = cameraFrame(camera)
      const fieldBodies = bodies.map((body) => ({
        ...body,
        spread: clamp(2.4 + Math.log10(Math.max(1, body.radiusKm)) * 0.42, 2.8, 7),
        strength: Math.min(5.2, 0.75 + Math.log10(body.mass + 1) * 1.2),
      }))
      const curvedHeight = (x: number, z: number, layerY: number) => {
        let displacement = 0
        for (const body of fieldBodies) {
          const dx = x - body.x
          const dy = layerY - body.y
          const dz = z - body.z
          const distanceSquared = dx * dx + dy * dy + dz * dz
          displacement -= body.strength * Math.exp(-distanceSquared / (body.spread * body.spread))
        }
        return layerY + displacement
      }

      const range = 10
      const samples = 32
      for (let layer = 0; layer < layerCount; layer++) {
        const layerY = (layer - (layerCount - 1) / 2) * 1.25
        const middle = Math.abs(layer - (layerCount - 1) / 2) < 0.51
        ctx.strokeStyle = middle ? 'rgba(106,183,255,.64)' : 'rgba(94,151,220,.25)'
        ctx.lineWidth = middle ? 1.15 : 0.8

        for (let fixed = -range; fixed <= range; fixed += 1) {
          for (let axis = 0; axis < 2; axis++) {
            ctx.beginPath()
            let started = false
            for (let step = 0; step <= samples; step++) {
              const moving = -range + (step / samples) * range * 2
              const x = axis === 0 ? moving : fixed
              const z = axis === 0 ? fixed : moving
              const point = projectPoint({ x, y: curvedHeight(x, z, layerY), z }, frame, width, height)
              if (!point) { started = false; continue }
              if (!started) { ctx.moveTo(point.x, point.y); started = true }
              else ctx.lineTo(point.x, point.y)
            }
            ctx.stroke()
          }
        }
      }

      // Uniones verticales entre las superficies: permiten leer el campo como un volumen, no como una sola lámina.
      ctx.save()
      ctx.setLineDash([2, 5])
      ctx.strokeStyle = 'rgba(115,173,239,.22)'
      ctx.lineWidth = 0.8
      for (const x of [-8, 0, 8]) for (const z of [-8, 0, 8]) {
        ctx.beginPath()
        let started = false
        for (let layer = 0; layer < layerCount; layer++) {
          const layerY = (layer - (layerCount - 1) / 2) * 1.25
          const point = projectPoint({ x, y: curvedHeight(x, z, layerY), z }, frame, width, height)
          if (!point) continue
          if (!started) { ctx.moveTo(point.x, point.y); started = true }
          else ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
      }
      ctx.restore()

      if (showVectors) {
        ctx.strokeStyle = 'rgba(255,190,120,.72)'
        ctx.fillStyle = 'rgba(255,190,120,.86)'
        ctx.lineWidth = 1.2
        for (const body of bodies) {
          for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI / 4
            const start = projectPoint({ x: body.x + Math.cos(angle) * 3.1, y: body.y, z: body.z + Math.sin(angle) * 3.1 }, frame, width, height)
            const end = projectPoint({ x: body.x + Math.cos(angle) * 1.8, y: body.y, z: body.z + Math.sin(angle) * 1.8 }, frame, width, height)
            if (!start || !end) continue
            ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke()
            const a = Math.atan2(end.y - start.y, end.x - start.x)
            ctx.beginPath(); ctx.moveTo(end.x, end.y)
            ctx.lineTo(end.x - 5 * Math.cos(a - 0.45), end.y - 5 * Math.sin(a - 0.45))
            ctx.lineTo(end.x - 5 * Math.cos(a + 0.45), end.y - 5 * Math.sin(a + 0.45))
            ctx.closePath(); ctx.fill()
          }
        }
      }

      const rendered = bodies.map((body) => ({ body, point: projectPoint({ x: body.x, y: body.y, z: body.z }, frame, width, height) }))
        .filter((item): item is { body: CelestialBody; point: NonNullable<ReturnType<typeof projectPoint>> } => !!item.point)
        .sort((a, b) => b.point.depth - a.point.depth)
      for (const item of rendered) {
        const { body, point } = item
        const radius = clamp(7, 29, (7 + Math.log10(body.mass + 1) * 3) * Math.max(0.55, point.factor / 14))
        const glow = ctx.createRadialGradient(point.x, point.y, radius * 0.3, point.x, point.y, radius * 3)
        glow.addColorStop(0, body.color + '70')
        glow.addColorStop(1, body.color + '00')
        ctx.fillStyle = glow
        ctx.beginPath(); ctx.arc(point.x, point.y, radius * 3, 0, Math.PI * 2); ctx.fill()

        const sphere = ctx.createRadialGradient(point.x - radius * 0.34, point.y - radius * 0.42, 1, point.x, point.y, radius)
        sphere.addColorStop(0, '#ffffff')
        sphere.addColorStop(0.2, body.color)
        sphere.addColorStop(1, '#101827')
        ctx.fillStyle = sphere
        ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill()

        if (body.id === selectedId) {
          ctx.strokeStyle = 'rgba(225,242,255,.95)'
          ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.arc(point.x, point.y, radius + 5, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.fillStyle = 'rgba(233,242,255,.94)'
        ctx.font = '600 12px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(body.name, point.x, point.y - radius - 10)
      }

      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(215,231,255,.82)'
      ctx.font = '12px system-ui'
      ctx.fillText('ESPACIO 3D · ' + layerCount + ' CAPAS DE CURVATURA', 16, 24)
      ctx.fillStyle = 'rgba(174,196,229,.65)'
      ctx.font = '11px system-ui'
      ctx.fillText('La deformación se calcula sumando la influencia visual de cada masa', 16, 42)
    }

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null
    observer?.observe(canvas)
    window.addEventListener('resize', draw)
    draw()
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', draw)
    }
  }, [bodies, camera, selectedId, layerCount, showVectors])

  function addBody(presetName = 'Cuerpo nuevo') {
    const preset = PRESETS[presetName] ?? PRESETS['Cuerpo nuevo']
    const count = bodiesRef.current.length
    const body: CelestialBody = {
      ...preset,
      id: bodyId(),
      name: count === 0 ? preset.name : preset.name + ' ' + (count + 1),
      x: ((count % 3) - 1) * 4,
      y: 0,
      z: Math.floor(count / 3) * 3,
    }
    setBodies((current) => [...current, body])
    setSelectedId(body.id)
  }

  function updateSelected(patch: Partial<CelestialBody>) {
    if (!selectedId) return
    setBodies((current) => current.map((body) => body.id === selectedId ? { ...body, ...patch } : body))
  }

  function removeSelected() {
    if (!selectedBody) return
    const remaining = bodies.filter((body) => body.id !== selectedBody.id)
    setBodies(remaining)
    setSelectedId(remaining[0]?.id ?? null)
  }

  function resetCamera() {
    setCamera({ yaw: 0.72, pitch: 0.62, distance: 34, target: { x: 0, y: -0.3, z: 0 } })
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const frame = cameraFrame(cameraRef.current)
    let hit: { id: string; distance: number } | null = null
    for (const body of bodiesRef.current) {
      const point = projectPoint({ x: body.x, y: body.y, z: body.z }, frame, rect.width, rect.height)
      if (!point) continue
      const radius = clamp(7, 29, (7 + Math.log10(body.mass + 1) * 3) * Math.max(0.55, point.factor / 14))
      const distance = Math.hypot(point.x - x, point.y - y)
      if (distance <= radius + 9 && (!hit || distance < hit.distance)) hit = { id: body.id, distance }
    }
    if (hit) {
      setSelectedId(hit.id)
      interactionRef.current = { mode: 'move', id: hit.id, pointerId: event.pointerId, lastX: x, lastY: y }
    } else {
      interactionRef.current = {
        mode: event.shiftKey || event.button === 1 || event.button === 2 ? 'pan' : 'rotate',
        pointerId: event.pointerId,
        lastX: x,
        lastY: y,
      }
    }
    canvas.setPointerCapture(event.pointerId)
    canvas.style.cursor = 'grabbing'
    event.preventDefault()
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const interaction = interactionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const dx = x - interaction.lastX
    const dy = y - interaction.lastY
    interaction.lastX = x
    interaction.lastY = y

    if (interaction.mode === 'rotate') {
      const current = cameraRef.current
      setCamera({ ...current, yaw: current.yaw - dx * 0.008, pitch: clamp(current.pitch + dy * 0.008, 0.12, 1.45) })
    } else if (interaction.mode === 'pan') {
      const current = cameraRef.current
      const frame = cameraFrame(current)
      const factor = current.distance / Math.max(1, Math.min(rect.width, rect.height)) * 1.45
      setCamera({
        ...current,
        target: {
          x: current.target.x - (frame.right.x * dx + frame.up.x * dy) * factor,
          y: current.target.y - (frame.right.y * dx + frame.up.y * dy) * factor,
          z: current.target.z - (frame.right.z * dx + frame.up.z * dy) * factor,
        },
      })
    } else if (interaction.id) {
      const body = bodiesRef.current.find((item) => item.id === interaction.id)
      if (!body) return
      const ray = screenRay(x, y, cameraRef.current, rect.width, rect.height)
      const point = intersectHorizontalPlane(ray, body.y)
      if (point) setBodies((current) => current.map((item) => item.id === interaction.id
        ? { ...item, x: clamp(point.x, -12, 12), z: clamp(point.z, -12, 12) }
        : item))
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (interactionRef.current?.pointerId === event.pointerId) interactionRef.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* el puntero ya se liberó */ }
    event.currentTarget.style.cursor = 'grab'
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault()
    const current = cameraRef.current
    setCamera({ ...current, distance: clamp(current.distance * (event.deltaY > 0 ? 1.09 : 0.92), 15, 90) })
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="simulation-page">
        <header className="simulation-header">
          <div>
            <span className="studio-kicker">LABORATORIO INTERACTIVO</span>
            <h1>Simulación gravitatoria 3D</h1>
            <p>Agregá cuerpos, cambiá sus propiedades y observá cómo cada masa modifica las distintas capas del espacio.</p>
          </div>
        </header>

        <div className="simulation-layout sim3d-layout">
          <section className="simulation-visual sim3d-visual">
            <div className="sim3d-stage-head">
              <div><b>Espacio interactivo</b><span>Arrastrá un cuerpo para moverlo</span></div>
              <button className="btn sm" onClick={resetCamera}>Recentrar cámara</button>
            </div>
            <canvas
              ref={canvasRef}
              className="gravity-canvas sim3d-canvas"
              aria-label="Espacio tridimensional interactivo con varias capas de curvatura gravitatoria"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              onContextMenu={(event) => event.preventDefault()}
            />
            <div className="sim3d-camera-help">
              <span><b>Girar:</b> arrastrar el fondo</span>
              <span><b>Desplazar:</b> Mayús + arrastrar o botón derecho</span>
              <span><b>Zoom:</b> rueda del mouse</span>
              <span><b>Mover cuerpo:</b> arrastrar el objeto</span>
            </div>
            <div className="simulation-visual-controls sim3d-visual-controls">
              <label>Capas de espacio <b>{layerCount}</b><input type="range" min="3" max="11" step="2" value={layerCount} onChange={(event) => setLayerCount(Number(event.target.value))} /></label>
              <label className="simulation-check"><input type="checkbox" checked={showVectors} onChange={(event) => setShowVectors(event.target.checked)} /> Vectores gravitatorios</label>
            </div>
          </section>

          <aside className="simulation-controls sim3d-controls">
            <div className="simulation-card sim3d-card">
              <div className="sim3d-card-title"><div><span className="section-eyebrow">OBJETOS DEL ESPACIO</span><h2>Escena</h2></div><button className="btn primary sm" onClick={() => addBody()}>＋ Agregar</button></div>
              <div className="sim3d-object-list">
                {bodies.map((body) => (
                  <button key={body.id} className={'sim3d-object' + (body.id === selectedId ? ' active' : '')} onClick={() => setSelectedId(body.id)}>
                    <i style={{ background: body.color }} />
                    <span><b>{body.name}</b><small>{fmt(body.mass, 2)} masas terrestres</small></span>
                    <small>Editar</small>
                  </button>
                ))}
                {!bodies.length && <p className="hint">La escena está vacía. Agregá un cuerpo para empezar.</p>}
              </div>
              <div className="sim3d-presets">
                <span>Agregar modelo</span>
                {['Tierra', 'Luna', 'Júpiter', 'Masa compacta'].map((preset) => <button key={preset} className="btn sm" onClick={() => addBody(preset)}>{preset}</button>)}
              </div>
            </div>

            <div className="simulation-card sim3d-card">
              <div className="sim3d-card-title"><div><span className="section-eyebrow">PROPIEDADES INDIVIDUALES</span><h2>Objeto seleccionado</h2></div>{selectedBody && <button className="btn danger sm" onClick={removeSelected}>Quitar</button>}</div>
              {selectedBody ? <>
                <label className="lbl" htmlFor="sim-body-name">Nombre</label>
                <input id="sim-body-name" className="field sim3d-name" value={selectedBody.name} onChange={(event) => updateSelected({ name: event.target.value })} />
                <div className="sim3d-property">
                  <label htmlFor="sim-body-mass">Masa</label><b>{fmt(selectedBody.mass, 2)} M⊕</b>
                  <input id="sim-body-mass" className="simulation-slider" type="range" min="0.1" max="1000" step="0.1" value={selectedBody.mass} onChange={(event) => updateSelected({ mass: Number(event.target.value) })} />
                </div>
                <div className="sim3d-property">
                  <label htmlFor="sim-body-radius">Radio</label><b>{fmt(selectedBody.radiusKm, 0)} km</b>
                  <input id="sim-body-radius" className="simulation-slider" type="range" min="100" max="100000" step="100" value={selectedBody.radiusKm} onChange={(event) => updateSelected({ radiusKm: Number(event.target.value) })} />
                </div>
                <div className="sim3d-position-head"><b>Posición espacial</b><small>También podés arrastrar el cuerpo</small></div>
                <div className="sim3d-position-grid">
                  <label>X <input type="number" min="-12" max="12" step="0.1" value={selectedBody.x} onChange={(event) => updateSelected({ x: clamp(Number(event.target.value), -12, 12) })} /></label>
                  <label>Y <input type="number" min="-8" max="8" step="0.1" value={selectedBody.y} onChange={(event) => updateSelected({ y: clamp(Number(event.target.value), -8, 8) })} /></label>
                  <label>Z <input type="number" min="-12" max="12" step="0.1" value={selectedBody.z} onChange={(event) => updateSelected({ z: clamp(Number(event.target.value), -12, 12) })} /></label>
                </div>
                <label className="sim3d-color-label">Color del objeto <input type="color" value={selectedBody.color} onChange={(event) => updateSelected({ color: event.target.value })} /></label>
              </> : <p className="hint">Seleccioná un cuerpo o agregá uno nuevo para editar sus propiedades.</p>}
            </div>

            <div className="simulation-card sim3d-card">
              <span className="section-eyebrow">RESULTADOS CALCULADOS</span><h2>Magnitudes físicas</h2>
              {selectedBody && physics ? <>
                <div className="simulation-metric"><span>Gravedad superficial</span><b>{fmt(physics.gravity, 3)} m/s²</b></div>
                <div className="simulation-metric"><span>Respecto a la Tierra</span><b>{fmt(physics.earthGravity, 2)} g</b></div>
                <div className="simulation-metric"><span>Velocidad de escape</span><b>{fmt(physics.escape / 1000, 2)} km/s</b></div>
                <div className="simulation-metric"><span>Radio de Schwarzschild</span><b>{fmt(physics.schwarzschildKm, 6)} km</b></div>
              </> : <p className="hint">No hay un objeto seleccionado.</p>}
              <p className="simulation-note">La escena suma la influencia visual de las masas sobre varias superficies tridimensionales. Las magnitudes físicas se calculan con gravedad newtoniana; la malla es un modelo didáctico normalizado, no una solución numérica completa de las ecuaciones de Einstein.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
