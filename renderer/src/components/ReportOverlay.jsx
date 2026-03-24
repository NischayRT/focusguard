'use client'

import { useState } from 'react'
import { saveSession } from '../lib/supabase'

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const parts = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ') + ' session'
}

function fmtTime(sec) {
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

export default function ReportOverlay({ report, user, onClose, onExtend }) {
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [saveErr, setSaveErr] = useState(null)

  if (!report) return null

  const { duration, focusTime = 0, focusPct = 0, sessions = 1, timeline = [] } = report
  const awayTime  = Math.max(0, duration - focusTime)

  const grade =
    focusPct >= 90 ? { label: 'EXCELLENT', color: 'var(--accent)' } :
    focusPct >= 70 ? { label: 'GOOD',      color: 'var(--teal)' } :
    focusPct >= 50 ? { label: 'FAIR',      color: 'var(--yellow)' } :
                     { label: 'KEEP GOING', color: 'var(--red)' }

  async function handleSave() {
    if (!user) { setSaveErr('Sign in to save'); return }
    setSaving(true); setSaveErr(null)
    const { error } = await saveSession({
      duration, focus_time: focusTime, focus_pct: focusPct,
      distractions: 0, breaks_taken: report.breaksTaken || 0, mode: "focus", timeline,
    }, user.id)
    setSaving(false)
    if (error) setSaveErr(typeof error === 'string' ? error : 'Failed to save')
    else setSaved(true)
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 440, background: 'var(--bg-3)', border: '1px solid var(--border-3)',
        borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', animation: 'modalIn 0.25s ease',
      }}>

        {/* Header */}
        <div style={{
          padding: '24px 28px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--text-3)', letterSpacing: '0.18em', marginBottom: 6 }}>
              SESSION COMPLETE
            </div>
            <div style={{ fontSize: 20, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 300 }}>
              {fmtDuration(duration)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 36, color: grade.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, lineHeight: 1 }}>
              {focusPct}%
            </div>
            <div style={{ fontSize: 14, color: grade.color, opacity: 0.8, letterSpacing: '0.14em', marginTop: 4 }}>
              {grade.label}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { label: 'FOCUSED',  value: fmtTime(focusTime), color: 'var(--accent)' },
            { label: 'SESSIONS', value: sessions,            color: 'var(--text)' },
            { label: 'AWAY',     value: fmtTime(awayTime),  color: 'var(--red)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: 'var(--bg-2)', border: '1px solid var(--border-2)',
              borderRadius: 12, padding: '14px 10px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.14em', marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 16, color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 300 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Focus bar */}
        <div style={{ padding: '0 28px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.14em' }}>FOCUS BREAKDOWN</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-2)', display: 'flex' }}>
            <div style={{ width: `${focusPct}%`, background: 'var(--accent)', transition: 'width 0.8s ease', borderRadius: '3px 0 0 3px' }}/>
            <div style={{ flex: 1, background: 'var(--border-2)' }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--accent)' }}>FOCUSED {focusPct}%</span>
            <span style={{ fontSize: 12, color: 'var(--red)' }}>AWAY {100 - focusPct}%</span>
          </div>
        </div>

        {/* Timeline mini chart */}
        {timeline.length > 0 && (
          <div style={{ padding: '0 28px 20px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.14em', marginBottom: 8 }}>
              MINUTE BY MINUTE
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 44 }}>
              {timeline.map(({ minute, focus_pct }) => (
                <div key={minute} title={`Min ${minute + 1}: ${focus_pct}%`} style={{
                  flex: 1, borderRadius: 2, minWidth: 4, height: `${Math.max(focus_pct, 5)}%`,
                  background: focus_pct >= 70 ? 'var(--accent)' : focus_pct >= 40 ? 'var(--yellow)' : 'var(--red)',
                  opacity: 0.85, transition: 'height 0.4s ease',
                }}/>
              ))}
            </div>
          </div>
        )}

        {/* Save status */}
        {saveErr && (
          <div style={{ margin: '0 28px 12px', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--red)', borderRadius: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--red)' }}>{saveErr}</span>
          </div>
        )}
        {saved && (
          <div style={{ margin: '0 28px 12px', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--accent)' }}>✓ Saved to your account</span>
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '0 28px 28px', display: 'flex', gap: 8 }}>
          <button onClick={onExtend} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-3)',
            color: 'var(--teal)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em', transition: 'all 0.15s',
          }}>
            +5 MIN
          </button>

          {!saved && (
            <button onClick={handleSave} disabled={saving} style={{
              flex: 1, padding: '12px 0', borderRadius: 10, cursor: saving ? 'default' : 'pointer', background: 'var(--surface)', border: '1px solid var(--border-3)',
              color: saving ? 'var(--text-3)' : 'var(--accent)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em', transition: 'all 0.15s',
            }}>
              {saving ? 'SAVING...' : user ? 'SAVE' : 'SIGN IN TO SAVE'}
            </button>
          )}

          <button onClick={onClose} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-3)',
            color: 'var(--text-3)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em', transition: 'all 0.15s',
          }}>
            CLOSE
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalIn { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  )
}