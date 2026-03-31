'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { playDistractionBeep, playRefocusBeep } from '../lib/audio'

const API_BASE = 'http://localhost:5000'
const SAMPLE_INTERVAL_MS = 2000

export default function WebcamPreview({ active, onScoreUpdate }) {
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const samplerRef = useRef(null)
  const prevDistractedRef = useRef(null)

  const [hasCamera,  setHasCamera]  = useState(null)
  const [error,      setError]      = useState(null)
  const [apiOnline,  setApiOnline]  = useState(false)
  const [gaze,       setGaze]       = useState(null)
  const [focusScore, setFocusScore] = useState(null)

  const checkApi = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) })
      setApiOnline(res.ok)
    } catch { setApiOnline(false) }
  }, [])

  useEffect(() => {
    checkApi()
    const id = setInterval(checkApi, 10000)
    return () => clearInterval(id)
  }, [checkApi])

  useEffect(() => {
    if (!active) { stopCamera(); stopSampler(); return }
    startCamera()
    return () => { stopCamera(); stopSampler() }
  }, [active])

  useEffect(() => {
    if (active && hasCamera && apiOnline) startSampler()
    else stopSampler()
    return () => stopSampler()
  }, [active, hasCamera, apiOnline])

  function startCamera() {
    navigator.mediaDevices
      .getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } })
      .then(stream => {
        setHasCamera(true); setError(null)
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(err => {
        setHasCamera(false)
        setError(err.name === 'NotAllowedError' ? 'Camera access denied' : 'No camera found')
      })
  }

  function stopCamera() {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    setHasCamera(null)
  }

  function captureFrame() {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return null
    const ctx = canvas.getContext('2d')
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 240
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.7)
  }

  function startSampler() {
    stopSampler()
    samplerRef.current = setInterval(async () => {
      const frame = captureFrame()
      if (!frame) return
      try {
        const res = await fetch(`${API_BASE}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frame }),
          signal: AbortSignal.timeout(3000),
        })
        if (!res.ok) return
        const data = await res.json()
        setGaze(data)
        setFocusScore(data.focus_score ?? null)
        onScoreUpdate && onScoreUpdate(data)

        const isDistracted = !data.face_detected || data.looking_away
        if (prevDistractedRef.current !== null) {
          if (isDistracted && !prevDistractedRef.current) {
            playDistractionBeep()
            if (window.electronAPI?.notifyDistraction) {
              window.electronAPI.notifyDistraction("You drifted — come back!")
            }
          } else if (!isDistracted && prevDistractedRef.current) {
            playRefocusBeep()
            if (window.electronAPI?.notifyRefocus) {
              window.electronAPI.notifyRefocus("Back in focus — keep going.")
            }
          }
        }
        prevDistractedRef.current = isDistracted

      } catch { /* API timeout — skip */ }
    }, SAMPLE_INTERVAL_MS)
  }

  function stopSampler() {
    if (samplerRef.current) { clearInterval(samplerRef.current); samplerRef.current = null }
    prevDistractedRef.current = null
  }

  const scoreColor = focusScore === null ? 'var(--border-3)'
    : focusScore >= 80 ? 'var(--accent)'
    : focusScore >= 50 ? 'var(--yellow)'
    : 'var(--red)'

  const statusLabel = () => {
    if (!active)             return 'OFF'
    if (error)               return 'ERROR'
    if (!hasCamera)          return 'CONNECTING'
    if (!apiOnline)          return 'AI OFFLINE'
    if (!gaze)               return 'ANALYZING'
    if (!gaze.face_detected) return 'NO FACE'
    if (gaze.looking_away)   return 'AWAY'
    return 'FOCUSED'
  }

  const statusColor = () => {
    if (!active || !gaze)    return 'var(--text-4)'
    if (!gaze.face_detected) return 'var(--red)'
    if (gaze.looking_away)   return 'var(--yellow)'
    return 'var(--accent)'
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono" style={{ color: 'var(--text-4)', letterSpacing: '0.15em' }}>CAMERA</span>
        {active && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full transition-all duration-500"
              style={{ background: statusColor(), boxShadow: `0 0 4px ${statusColor()}` }}/>
            <span className="text-xs font-mono" style={{ color: statusColor(), letterSpacing: '0.1em', fontSize: 14 }}>
              {statusLabel()}
            </span>
          </div>
        )}
      </div>

      {/* Video box */}
      <div className="relative overflow-hidden rounded-xl" style={{
        width: '100%', aspectRatio: '4/3',
        background: 'var(--bg-3)', border: `1px solid ${active && hasCamera ? statusColor() : 'var(--border-2)'}`,
        transition: 'border-color 0.5s',
      }}>
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"
          style={{ width: '-webkit-fill-available' ,display: hasCamera ? 'block' : 'none', transform: 'scaleX(-1)', filter: 'brightness(0.88)' }}/>
        <canvas ref={canvasRef} style={{ display: 'none' }}/>

        {(!active || !hasCamera) && (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center gap-2" 
            style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', height: '100%', width: '100%', justifyContent: 'center' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1" style={{display: 'block' }}>
              <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
            <span className="text-xs font-mono" style={{ color: 'var(--text-3)', letterSpacing: '0.1em', fontSize: 12 }}>
              {error ? error.toUpperCase() : 'STARTS WITH TIMER'}
            </span>
          </div>
        )}

        {/* Corner brackets */}
        {active && hasCamera && (
          ['top-2 left-2','top-2 right-2','bottom-2 left-2','bottom-2 right-2'].map(pos => (
            <div key={pos} className={`absolute ${pos} w-3 h-3 transition-all duration-500`} style={{
              borderTop:    pos.includes('top')    ? `1px solid ${statusColor()}` : 'none',
              borderBottom: pos.includes('bottom') ? `1px solid ${statusColor()}` : 'none',
              borderLeft:   pos.includes('left')   ? `1px solid ${statusColor()}` : 'none',
              borderRight:  pos.includes('right')  ? `1px solid ${statusColor()}` : 'none',
            }}/>
          ))
        )}

        {/* Gaze overlay */}
        {active && hasCamera && gaze && (
          <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 flex items-center justify-between"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <span className="font-mono" style={{ color: '#e8e8e8', fontSize: 12, letterSpacing: '0.06em' }}>
              Y{gaze.yaw > 0 ? '+' : ''}{Math.round(gaze.yaw)}° P{gaze.pitch > 0 ? '+' : ''}{Math.round(gaze.pitch)}°
            </span>
          </div>
        )}
      </div>

      {/* Focus score bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono" style={{ color: 'var(--text-4)', letterSpacing: '0.12em', fontSize: 12 }}>FOCUS SCORE</span>
          <span className="font-mono" style={{ color: focusScore !== null ? scoreColor : 'var(--text-4)', fontSize: 12 }}>
            {focusScore !== null ? `${focusScore}%` : '—'}
          </span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 2, background: 'var(--border)' }}>
          <div className="h-full rounded-full transition-all duration-700" style={{
            width: focusScore !== null ? `${focusScore}%` : '0%',
            background: scoreColor,
          }}/>
        </div>
      </div>

      {/* FACE / EYES / GAZE pills */}
      {gaze && active && (
        <div className="grid grid-cols-3 gap-1 pt-3">
          {[
            { label: 'FACE', value: gaze.face_detected ? 'YES' : 'NO',    color: gaze.face_detected ? 'var(--accent)' : 'var(--red)' },
            { label: 'EYES', value: gaze.eyes_closed   ? 'CLOSED' : 'OPEN', color: gaze.eyes_closed ? 'var(--yellow)' : 'var(--text-3)' },
            { label: 'GAZE', value: gaze.looking_away  ? 'AWAY' : 'ON',   color: gaze.looking_away  ? 'var(--red)' : 'var(--accent)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-1.5 text-center" style={{ background: 'var(--bg-3)', border: '1px solid var(--border)' }}>
              <div className="font-mono mb-0.5" style={{ color: 'var(--text-4)', fontSize: 8, letterSpacing: '0.1em' }}>{label}</div>
              <div className="font-mono" style={{ color, fontSize: 12 }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}