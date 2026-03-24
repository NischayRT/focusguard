'use client'

import { useState, useEffect, useRef } from 'react'
import { playSessionChime } from '../lib/audio'

const FOCUS_COLOR    = 'var(--accent)'
const DEFAULT_FOCUS  = 25 * 60
const BREAK_DEFAULTS = { short: 5 * 60, long: 15 * 60 }
const BREAK_COLORS   = { short: 'var(--teal)', long: 'var(--red)' }
const BREAK_LABELS   = { short: 'SHORT BREAK', long: 'LONG BREAK' }

let _mainInterval  = null
let _breakInterval = null
let _alertInterval = null

function clearMain()  { if (_mainInterval)  { clearInterval(_mainInterval);  _mainInterval  = null } }
function clearBreak() { if (_breakInterval) { clearInterval(_breakInterval); _breakInterval = null } }
function clearAlert() { if (_alertInterval) { clearInterval(_alertInterval); _alertInterval = null } }

function fmt(sec) {
  return {
    h: Math.floor(sec / 3600).toString().padStart(2, '0'),
    m: Math.floor((sec % 3600) / 60).toString().padStart(2, '0'),
    s: (sec % 60).toString().padStart(2, '0'),
  }
}
function fmtFocus(sec) {
  if (!sec) return '0s'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const parts = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

function playAlertBeep(actx) {
  try {
    const osc = actx.createOscillator()
    const gain = actx.createGain()
    osc.connect(gain); gain.connect(actx.destination)
    osc.type = 'sine'; osc.frequency.value = 520
    gain.gain.setValueAtTime(0.22, actx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.35)
    osc.start(actx.currentTime); osc.stop(actx.currentTime + 0.4)
  } catch (_) {}
}

// ── Break sub-timer ──────────────────────────────────────────────────────────
function BreakTimer({ type, onDone, onDismiss }) {
  const [duration,  setDuration]  = useState(BREAK_DEFAULTS[type])
  const [timeLeft,  setTimeLeft]  = useState(BREAK_DEFAULTS[type])
  const [running,   setRunning]   = useState(false)
  const [alerting,  setAlerting]  = useState(false)
  const [alertSecs, setAlertSecs] = useState(10)
  const [tick,      setTick]      = useState(true)
  const [editing,   setEditing]   = useState(null)
  
  const [editHr,    setEditHr]    = useState('')
  const [editMin,   setEditMin]   = useState('')
  const [editSec,   setEditSec]   = useState('')

  const audioCtxRef = useRef(null)
  const hrRef  = useRef(null)
  const minRef = useRef(null)
  const secRef = useRef(null)
  const doneCalledRef = useRef(false)

  const color    = BREAK_COLORS[type]
  const progress = Math.max(0, Math.min(1, (duration - timeLeft) / duration))
  const { h, m, s } = fmt(timeLeft)
  const SIZE = 160, CX = 80, R = 64
  const CIRC = 2 * Math.PI * R
  const offset = CIRC * (1 - progress)
  const canEdit = !running && timeLeft === duration

  useEffect(() => { if (editing === 'hr'  && hrRef.current)  hrRef.current.focus() }, [editing])
  useEffect(() => { if (editing === 'min' && minRef.current) minRef.current.focus() }, [editing])
  useEffect(() => { if (editing === 'sec' && secRef.current) secRef.current.focus() }, [editing])

  useEffect(() => {
    if (!running) { clearBreak(); return }
    if (_breakInterval) return

    _breakInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearBreak(); setRunning(false); startAlert(); return 0
        }
        setTick(t => !t)
        return prev - 1
      })
    }, 1000)
    return () => clearBreak()
  }, [running])

  useEffect(() => () => { clearBreak(); clearAlert(); try { audioCtxRef.current?.close() } catch (_) {} }, [])

  function startAlert() {
    setAlerting(true); setAlertSecs(10)
    try { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)() } catch (_) {}
    playAlertBeep(audioCtxRef.current)

    let rem = 9; clearAlert()
    _alertInterval = setInterval(() => {
      playAlertBeep(audioCtxRef.current); setAlertSecs(rem); rem--
      if (rem < 0) {
        clearAlert(); try { audioCtxRef.current?.close() } catch (_) {}
        setAlerting(false); if (!doneCalledRef.current) { doneCalledRef.current = true; onDone() }
      }
    }, 1000)
  }

  function dismissAlert() {
    clearAlert(); try { audioCtxRef.current?.close() } catch (_) {}
    setAlerting(false); if (!doneCalledRef.current) { doneCalledRef.current = true; onDone() }
  }

  function commitEdit(field, val) {
    const parsed = parseInt(val, 10)
    let newTime = timeLeft
    const currH = Math.floor(timeLeft / 3600)
    const currM = Math.floor((timeLeft % 3600) / 60)
    const currS = timeLeft % 60

    if (field === 'hr') {
      const hh = isNaN(parsed) ? currH : Math.max(0, parsed)
      newTime = hh * 3600 + currM * 60 + currS
    } else if (field === 'min') {
      const mm = isNaN(parsed) ? currM : Math.max(0, Math.min(59, parsed))
      newTime = currH * 3600 + mm * 60 + currS
    } else {
      const ss = isNaN(parsed) ? currS : Math.max(0, Math.min(59, parsed))
      newTime = currH * 3600 + currM * 60 + ss
    }
    if (newTime < 1) newTime = 60
    setDuration(newTime); setTimeLeft(newTime); setEditing(null)
  }

  function handleKey(e, field, val) {
    if (e.key === 'Enter') commitEdit(field, val)
    if (e.key === 'Escape') setEditing(null)
    if (e.key === 'Tab') {
      e.preventDefault(); commitEdit(field, val)
      if (field === 'hr') {
        setEditing('min'); setEditMin(Math.floor((timeLeft%3600)/60).toString())
      } else if (field === 'min') {
        setEditing('sec'); setEditSec((timeLeft%60).toString())
      } else {
        setEditing('hr'); setEditHr(Math.floor(timeLeft/3600).toString())
      }
    }
  }

  const digitInput = (ref, val, onChange, onBlur, onKeyDown) => ({
    ref, value: val,
    onChange: e => onChange(e.target.value.replace(/\D/g, '').slice(0, 2)),
    onBlur, onKeyDown,
    style: {
      width: 32, fontSize: 24, fontWeight: 300, color,
      background: 'transparent', border: 'none',
      borderBottom: `1px solid var(--border-3)`, textAlign: 'center',
      fontFamily: 'inherit', outline: 'none', letterSpacing: '-0.03em', lineHeight: 1,
    }
  })

  const clickProps = (field) => ({
    onClick: () => {
      if (!canEdit) return
      if (field === 'hr') setEditHr(Math.floor(timeLeft/3600).toString())
      if (field === 'min') setEditMin(Math.floor((timeLeft%3600)/60).toString())
      if (field === 'sec') setEditSec((timeLeft%60).toString())
      setEditing(field)
    },
    style: { fontSize: 24, fontWeight: 300, color: 'var(--text)', letterSpacing: '-0.03em', cursor: canEdit ? 'pointer' : 'default' }
  })

  const headAngle = (progress * 360 - 90) * Math.PI / 180
  const headX = CX + R * Math.cos(headAngle)
  const headY = CX + R * Math.sin(headAngle)

  if (alerting) {
    return (
      <div style={{
        padding: '20px 28px', borderRadius: 16,
        background: 'var(--bg-3)', border: `1px solid var(--border)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        animation: 'breakIn 0.3s ease',
      }}>
        <div style={{ fontSize: 12, color, letterSpacing: '0.18em' }}>BREAK OVER</div>
        <div style={{ fontSize: 40, color, fontWeight: 300 }}>{alertSecs}s</div>
        <button onClick={dismissAlert} style={{
          marginTop: 4, padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
          background: color, color: 'var(--bg)', border: 'none',
          fontSize: 14, fontFamily: 'inherit', letterSpacing: '0.12em',
        }}>
          START NOW
        </button>
      </div>
    )
  }

  const colon = <span style={{ fontSize: 20, color, margin: '0 2px', opacity: running ? (tick ? 1 : 0.1) : 0.5, transition: 'opacity 0.1s' }}>:</span>

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      padding: '20px 28px', borderRadius: 16,
      background: 'var(--bg-3)', border: `1px solid var(--border)`,
      animation: 'breakIn 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontSize: 12, color, letterSpacing: '0.18em' }}>{BREAK_LABELS[type]}</span>
        <button onClick={onDismiss} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-4)', fontSize: 16, lineHeight: 1, padding: 2,
        }}>×</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
          <svg width={SIZE} height={SIZE} style={{ position: 'absolute', top: 0, left: 0 }}>
            <circle cx={CX} cy={CX} r={R} fill="none" stroke="var(--border-2)" strokeWidth="2"/>
            {progress > 0.005 && (
              <circle cx={CX} cy={CX} r={R} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={offset} transform={`rotate(-90 ${CX} ${CX})`} style={{ transition: 'stroke-dashoffset 1s linear' }}/>
            )}
            {progress > 0.01 && <circle cx={headX} cy={headY} r="3.5" fill={color}/>}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', userSelect: 'none' }}>
              {editing === 'hr' ? <input {...digitInput(hrRef, editHr, setEditHr, () => commitEdit('hr', editHr), e => handleKey(e, 'hr', editHr))}/> : <span {...clickProps('hr')}>{h}</span>}
              {colon}
              {editing === 'min' ? <input {...digitInput(minRef, editMin, setEditMin, () => commitEdit('min', editMin), e => handleKey(e, 'min', editMin))}/> : <span {...clickProps('min')}>{m}</span>}
              {colon}
              {editing === 'sec' ? <input {...digitInput(secRef, editSec, setEditSec, () => commitEdit('sec', editSec), e => handleKey(e, 'sec', editSec))}/> : <span {...clickProps('sec')}>{s}</span>}
            </div>
          </div>
        </div>

        <button onClick={() => { setEditing(null); setRunning(r => !r) }} style={{
          width: 44, height: 44, borderRadius: '50%', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: running ? 'var(--bg-2)' : color,
          color: running ? color : 'var(--bg)',
          border: running ? `1px solid var(--border)` : 'none',
          boxShadow: running ? 'none' : '0 0 20px var(--accent-dim)',
          transition: 'all 0.2s', flexShrink: 0,
        }}>
          {running
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 1 }}><path d="M5 3l14 9-14 9V3z"/></svg>
          }
        </button>
      </div>
    </div>
  )
}

// ── Main Timer ───────────────────────────────────────────────────────────────
export default function Timer({ onSessionComplete, onRunningChange, focusScore, isDistracted }) {
  const [focusDuration, setFocusDuration] = useState(DEFAULT_FOCUS)
  const [timeLeft,      setTimeLeft]      = useState(DEFAULT_FOCUS)
  const [running,       setRunning]       = useState(false)
  const [tick,          setTick]          = useState(true)
  const [focusTime,     setFocusTime]     = useState(0)
  const [extended,      setExtended]      = useState(0)
  const [breakType,     setBreakType]     = useState(null)
  const [breaksTaken,   setBreaksTaken]   = useState(0)
  
  const [editing,       setEditing]       = useState(null)
  const [editHr,        setEditHr]        = useState('')
  const [editMin,       setEditMin]       = useState('')
  const [editSec,       setEditSec]       = useState('')

  const hrRef  = useRef(null)
  const minRef = useRef(null)
  const secRef = useRef(null)

  const focusRef        = useRef(false)
  const focusScoreRef   = useRef(focusScore) 
  const awayCountRef    = useRef(0)      
  const elapsedRef      = useRef(0)      
  const extRef          = useRef(0)
  const durRef          = useRef(DEFAULT_FOCUS)
  const breaksRef       = useRef(0)
  const completedRef    = useRef(false)
  const timeLeftRef     = useRef(DEFAULT_FOCUS)

  const color         = FOCUS_COLOR
  const totalDuration = focusDuration + extended * 60
  const progress      = Math.max(0, Math.min(1, (totalDuration - timeLeft) / totalDuration))
  const { h, m, s }   = fmt(timeLeft)
  const SIZE = 280, CX = 140, R = 140
  const CIRC = 2 * Math.PI * R
  const offset = CIRC * (1 - progress)

  const isTrulyFocused = running && !isDistracted && focusScore !== null
  const isPaused       = !running && timeLeft > 0 && timeLeft < totalDuration
  const canEdit        = !running && timeLeft === totalDuration

  useEffect(() => { focusRef.current  = !isDistracted && focusScore !== null }, [isDistracted, focusScore])
  useEffect(() => { focusScoreRef.current = focusScore }, [focusScore])
  useEffect(() => { extRef.current    = extended },      [extended])
  useEffect(() => { durRef.current    = focusDuration }, [focusDuration])
  useEffect(() => { breaksRef.current = breaksTaken },   [breaksTaken])
  useEffect(() => { timeLeftRef.current = timeLeft },    [timeLeft])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('timer-state', { detail: { running, mode: 'focus' } }))
    onRunningChange?.(running)
  }, [running])

  useEffect(() => {
    if (!running) { clearMain(); return }
    if (timeLeftRef.current <= 0 || completedRef.current) {
      const dur = durRef.current
      timeLeftRef.current = dur; setTimeLeft(dur); setFocusTime(0)
      awayCountRef.current = 0; elapsedRef.current = 0; completedRef.current = false
      setExtended(0); extRef.current = 0; setBreakType(null)
      setBreaksTaken(0); breaksRef.current = 0
    }
    if (_mainInterval) return

    _mainInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) { clearMain(); return 0 }

        if (prev <= 1) {
          clearMain()
          const totalDur  = durRef.current + extRef.current * 60
          elapsedRef.current += 1 
          const elapsed   = elapsedRef.current
          const awaySecs  = awayCountRef.current
          const focusSecs = Math.max(0, Math.floor((elapsed - awaySecs) ))
          completedRef.current = true
          setFocusTime(focusSecs)
          setTimeout(() => {
            setRunning(false); playSessionChime()
            const focusPct = totalDur > 0 ? Math.min(100, Math.round((focusSecs / totalDur) * 100)) : 0
            onSessionComplete?.(1, { duration: totalDur, focusTime: focusSecs, focusPct, breaksTaken: breaksRef.current, mode: 'focus' })
          }, 0)
          return 0
        }

        setTick(t => !t)
        elapsedRef.current += 1
        if (focusScoreRef.current !== null && !focusRef.current) awayCountRef.current += 1
        const derivedFocus = Math.max(0, Math.floor((elapsedRef.current - awayCountRef.current) ))
        if (elapsedRef.current % 5 === 0) setFocusTime(derivedFocus)
        return prev - 1
      })
    }, 1000)

    return () => clearMain()
  }, [running])

  useEffect(() => { if (editing === 'hr'  && hrRef.current)  hrRef.current.focus() }, [editing])
  useEffect(() => { if (editing === 'min' && minRef.current) minRef.current.focus() }, [editing])
  useEffect(() => { if (editing === 'sec' && secRef.current) secRef.current.focus() }, [editing])

  function resetTimer() {
    clearMain(); setRunning(false); setTimeLeft(focusDuration)
    timeLeftRef.current = focusDuration; setFocusTime(0); awayCountRef.current = 0; elapsedRef.current = 0
    completedRef.current = false; setExtended(0); extRef.current = 0; setEditing(null)
    setBreakType(null); setBreaksTaken(0); breaksRef.current = 0
  }

  function commitEdit(field, val) {
    const parsed = parseInt(val, 10)
    let newTime = timeLeft
    const currH = Math.floor(timeLeft / 3600)
    const currM = Math.floor((timeLeft % 3600) / 60)
    const currS = timeLeft % 60

    if (field === 'hr') {
      const hh = isNaN(parsed) ? currH : Math.max(0, parsed)
      newTime = hh * 3600 + currM * 60 + currS
    } else if (field === 'min') {
      const mm = isNaN(parsed) ? currM : Math.max(0, Math.min(59, parsed))
      newTime = currH * 3600 + mm * 60 + currS
    } else {
      const ss = isNaN(parsed) ? currS : Math.max(0, Math.min(59, parsed))
      newTime = currH * 3600 + currM * 60 + ss
    }
    if (newTime < 1) newTime = 60
    
    setFocusDuration(newTime); setTimeLeft(newTime); timeLeftRef.current = newTime
    setExtended(0); extRef.current = 0; awayCountRef.current = 0; elapsedRef.current = 0
    completedRef.current = false; setEditing(null)
  }

  function handleKey(e, field, val) {
    if (e.key === 'Enter') commitEdit(field, val)
    if (e.key === 'Escape') setEditing(null)
    if (e.key === 'Tab') {
      e.preventDefault(); commitEdit(field, val)
      if (field === 'hr') {
        setEditing('min'); setEditMin(Math.floor((timeLeft%3600)/60).toString())
      } else if (field === 'min') {
        setEditing('sec'); setEditSec((timeLeft%60).toString())
      } else {
        setEditing('hr'); setEditHr(Math.floor(timeLeft/3600).toString())
      }
    }
  }

  function handleBreakDone() {
    if (completedRef.current) return
    setBreaksTaken(b => { const n = b + 1; breaksRef.current = n; return n })
    setBreakType(null)
    setTimeout(() => { if (!completedRef.current) setRunning(true) }, 80)
  }

  const headAngle = (progress * 360 - 90) * Math.PI / 180
  const headX = CX + R * Math.cos(headAngle)
  const headY = CX + R * Math.sin(headAngle)

  const statusText  = running ? (isDistracted ? 'DISTRACTED' : 'FOCUSED') : canEdit ? 'READY · CLICK TO EDIT' : 'PAUSED'
  const statusColor = running ? (isDistracted ? 'var(--yellow)' : color) : 'var(--text-3)'

  const iconBtn = {
    width: 44, height: 44, borderRadius: '50%', background: 'transparent', border: '1px solid var(--border-2)',
    color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s', fontFamily: 'inherit', fontSize: 12,
  }

  const digitInput = (ref, val, onChange, onBlur, onKeyDown) => ({
    ref, value: val,
    onChange: e => onChange(e.target.value.replace(/\D/g, '').slice(0, 2)),
    onBlur, onKeyDown,
    style: {
      width: 60, fontSize: 50, fontWeight: 300, color,
      background: 'transparent', border: 'none',
      borderBottom: `1.5px solid var(--border-3)`, textAlign: 'center',
      fontFamily: 'inherit', outline: 'none', letterSpacing: '-0.04em', lineHeight: 1,
    }
  })

  const clickProps = (field) => ({
    onClick: () => {
      if (!canEdit) return
      if (field === 'hr') setEditHr(Math.floor(timeLeft/3600).toString())
      if (field === 'min') setEditMin(Math.floor((timeLeft%3600)/60).toString())
      if (field === 'sec') setEditSec((timeLeft%60).toString())
      setEditing(field)
    },
    title: canEdit ? `Click to edit ${field}` : '',
    style: { fontSize: 50, fontWeight: 300, color: 'var(--text)', letterSpacing: '-0.04em', cursor: canEdit ? 'pointer' : 'default', borderBottom: '1px solid transparent', transition: 'border-color 0.2s' },
    onMouseEnter: e => { if (canEdit) e.target.style.borderBottom = `1px solid var(--border-3)` },
    onMouseLeave: e => { e.target.style.borderBottom = '1px solid transparent' }
  })

  const colon = <span style={{ fontSize: 40, fontWeight: 300, color, opacity: running ? (tick ? 1 : 0.1) : 0.5, margin: '0 4px', transition: 'opacity 0.1s' }}>:</span>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

      {/* Ring */}
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        {running && <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', boxShadow: '0 0 80px var(--accent-dim)', pointerEvents: 'none' }}/>}
        <svg width={SIZE} height={SIZE} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
          <circle cx={CX} cy={CX} r={R + 14} fill="none" stroke="var(--border)" strokeWidth="1"/>
          <circle cx={CX} cy={CX} r={R}       fill="none" stroke="var(--border-2)" strokeWidth="2"/>
          {progress > 0.005 && (
            <circle cx={CX} cy={CX} r={R} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={offset} transform={`rotate(-90 ${CX} ${CX})`} style={{ transition: 'stroke-dashoffset 1s linear' }}/>
          )}
          {progress > 0.01 && <circle cx={headX} cy={headY} r="4.5" fill={color}/>}
        </svg>

        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', lineHeight: 1, userSelect: 'none' }}>
            {editing === 'hr' ? <input {...digitInput(hrRef, editHr, setEditHr, () => commitEdit('hr', editHr), e => handleKey(e, 'hr', editHr))}/> : <span {...clickProps('hr')}>{h}</span>}
            {colon}
            {editing === 'min' ? <input {...digitInput(minRef, editMin, setEditMin, () => commitEdit('min', editMin), e => handleKey(e, 'min', editMin))}/> : <span {...clickProps('min')}>{m}</span>}
            {colon}
            {editing === 'sec' ? <input {...digitInput(secRef, editSec, setEditSec, () => commitEdit('sec', editSec), e => handleKey(e, 'sec', editSec))}/> : <span {...clickProps('sec')}>{s}</span>}
          </div>

          {focusScore !== null && (running || focusTime > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, opacity: isTrulyFocused ? 1 : 0.2, transition: 'opacity 0.4s' }}/>
              <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
                {fmtFocus(focusTime)} focused
              </span>
            </div>
          )}

          <span style={{ fontSize: 11, color: statusColor, letterSpacing: '0.1em', transition: 'color 0.4s' }}>
            {statusText}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button title="Reset" style={iconBtn} onClick={resetTimer}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
          </svg>
        </button>

        <button onClick={() => { setEditing(null); setBreakType(null); setRunning(r => !r) }} style={{
          width: 68, height: 68, borderRadius: '50%', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: running ? 'var(--bg-3)' : color,
          color: running ? color : 'var(--bg)', border: running ? `1px solid var(--border)` : 'none',
          boxShadow: running ? 'none' : '0 0 36px var(--accent-dim)', transition: 'all 0.2s',
        }}>
          {running
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M5 3l14 9-14 9V3z"/></svg>
          }
        </button>

        <button title="+5 min" style={iconBtn} onClick={() => { setExtended(e => e + 5); extRef.current += 5; setTimeLeft(t => t + 300); if (!running) setRunning(true) }}>
          +5
        </button>
      </div>

      {isPaused && !breakType && (
        <div style={{ display: 'flex', gap: 8, animation: 'breakIn 0.25s ease' }}>
          {['short', 'long'].map(type => (
            <button key={type} onClick={() => setBreakType(type)} style={{
              padding: '8px 20px', borderRadius: 10, cursor: 'pointer',
              background: 'transparent', border: `1px solid var(--border)`,
              color: BREAK_COLORS[type], fontSize: 14, fontFamily: 'inherit',
              letterSpacing: '0.12em', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {BREAK_LABELS[type]}
            </button>
          ))}
        </div>
      )}

      {breakType && <BreakTimer key={breakType} type={breakType} onDone={handleBreakDone} onDismiss={() => setBreakType(null)} />}

      {breaksTaken > 0 && !breakType && (
        <span style={{ fontSize: 14, color: 'var(--text-3)', letterSpacing: '0.12em' }}>
          {breaksTaken} break{breaksTaken > 1 ? 's' : ''} taken
        </span>
      )}

      <style>{`
        @keyframes breakIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}