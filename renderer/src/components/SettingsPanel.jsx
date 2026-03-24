'use client'

import { useState } from 'react'
import { useSettings } from '../lib/settings'

// Editable duration field — separate Hours and Minutes
function DurationField({ value, onChange }) {
  const [editing, setEditing] = useState(false)
  
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  
  const [draftH, setDraftH] = useState('')
  const [draftM, setDraftM] = useState('')

  function startEdit() {
    setDraftH(String(h))
    setDraftM(String(m))
    setEditing(true)
  }

  function commit() {
    const parsedH = parseInt(draftH) || 0
    const parsedM = Math.min(59, parseInt(draftM) || 0) // Strictly cap minutes at 59
    onChange((parsedH * 3600) + (parsedM * 60))
    setEditing(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
    if (!/[\d\b]/.test(e.key) && !['ArrowLeft','ArrowRight','Delete','Tab'].includes(e.key)) {
      e.preventDefault()
    }
  }

  const inputStyle = {
    width: 34, textAlign: 'center', fontSize: 13,
    color: 'var(--accent)', background: 'var(--bg-3)',
    border: '1px solid var(--accent)', borderRadius: 6, padding: '2px 4px',
    fontFamily: "'JetBrains Mono', monospace", outline: 'none',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input autoFocus value={draftH} onChange={e => setDraftH(e.target.value)} onBlur={commit} onKeyDown={handleKey} style={inputStyle} placeholder="0h" />
          <span style={{ color: 'var(--text-3)' }}>h</span>
          <input value={draftM} onChange={e => setDraftM(e.target.value)} onBlur={commit} onKeyDown={handleKey} style={inputStyle} placeholder="0m" />
          <span style={{ color: 'var(--text-3)' }}>m</span>
        </div>
      ) : (
        <button onClick={startEdit} title="Click to edit" style={{
          textAlign: 'center', fontSize: 13,
          color: 'var(--accent)', background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 8px', cursor: 'text',
          fontFamily: "'JetBrains Mono', monospace",
          transition: 'border-color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-3)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          {h > 0 ? `${h}h ` : ''}{m}m
        </button>
      )}
    </div>
  )
}

export default function SettingsPanel({ onClose }) {
  const { settings, update, reset } = useSettings()

  const row = (label, control, note) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 8,
    }}>
      <div>
        <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.1em' }}>{label}</span>
        {note && <div style={{ fontSize: 11, color: 'var(--text-5)', marginTop: 2 }}>{note}</div>}
      </div>
      {control}
    </div>
  )

  const toggle = (key) => (
    <button onClick={() => update(key, !settings[key])} style={{
      width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
      background: settings[key] ? 'var(--accent)' : 'var(--border-2)',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%', background: settings[key] ? 'var(--bg)' : 'var(--text-4)',
        position: 'absolute', top: 3, left: settings[key] ? 19 : 3, transition: 'left 0.2s, background 0.2s',
      }}/>
    </button>
  )

  const sectionLabel = (text) => (
    <div style={{ fontSize: 11, color: 'var(--text-5)', letterSpacing: '0.16em', marginTop: 16, marginBottom: 4 }}>
      {text}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 14, color: 'var(--text-3)', letterSpacing: '0.18em' }}>SETTINGS</span>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', 
          fontSize: 22, lineHeight: 1, padding: 2, transition: 'color 0.15s',
        }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-4)'}>×</button>
      </div>

      {/* Durations */}
      {sectionLabel('DURATIONS')}
      {row('Focus', <DurationField value={settings.focusDuration} onChange={v => update('focusDuration', v)} />, 'Click value to type')}
      {row('Short break', <DurationField value={settings.shortBreakDuration} onChange={v => update('shortBreakDuration', v)} />)}
      {row('Long break', <DurationField value={settings.longBreakDuration} onChange={v => update('longBreakDuration', v)} />)}

      {/* Sensitivity */}
      {sectionLabel('AI SENSITIVITY')}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {['strict', 'balanced', 'relaxed'].map(s => (
          <button key={s} onClick={() => update('sensitivity', s)} style={{
            flex: 1, padding: '6px 0', borderRadius: 7, cursor: 'pointer', fontSize: 10, letterSpacing: '0.1em', fontFamily: "'JetBrains Mono', monospace",
            background: settings.sensitivity === s ? 'var(--surface)' : 'transparent', color: settings.sensitivity === s ? 'var(--accent)' : 'var(--text-5)',
            border: settings.sensitivity === s ? '1px solid var(--accent-dim)' : '1px solid var(--border)', transition: 'all 0.15s',
          }}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-5)', letterSpacing: '0.06em', marginBottom: 4 }}>
        {settings.sensitivity === 'strict'   && 'Flags small head movements — best for deep work'}
        {settings.sensitivity === 'balanced' && 'Default — ignores minor glances'}
        {settings.sensitivity === 'relaxed'  && 'Only flags large head turns'}
      </div>

      {/* Sound */}
      {sectionLabel('AUDIO')}
      {row('Sound alerts', toggle('soundEnabled'))}
      {settings.soundEnabled && (
        <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.1em' }}>Volume</span>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(settings.volume * 100)}%</span>
          </div>
          <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e => update('volume', parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
        </div>
      )}

      {/* Theme */}
      {sectionLabel('THEME')}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {['dark', 'light'].map(t => (
          <button key={t} onClick={() => update('theme', t)} style={{
            flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontSize: 10, letterSpacing: '0.1em', fontFamily: "'JetBrains Mono', monospace",
            background: settings.theme === t ? 'var(--surface)' : 'transparent', color: settings.theme === t ? 'var(--accent)' : 'var(--text-5)',
            border: settings.theme === t ? '1px solid var(--accent-dim)' : '1px solid var(--border)', transition: 'all 0.15s',
          }}>
            {t === 'dark' ? '◑ DARK' : '○ LIGHT'}
          </button>
        ))}
      </div>

      {/* Reset */}
      <button onClick={reset} style={{
        marginTop: 18, padding: '8px 0', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)',
        color: 'var(--text-5)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em', transition: 'all 0.15s', width: '100%',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(240,106,74,0.3)'; e.currentTarget.style.color = 'var(--red)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-5)' }}
      >
        RESET TO DEFAULTS
      </button>
    </div>
  )
}