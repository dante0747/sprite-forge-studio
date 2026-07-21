import { Ban, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useEditor } from '../context/EditorContext'
import { formatTime } from '../lib/format'

export function ProcessingBar() {
  const { processing } = useEditor()
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!processing.active) return
    const update = () => setNow(Date.now())
    const initial = window.setTimeout(update, 0)
    const timer = window.setInterval(update, 1_000)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [processing.active])
  if (!processing.active) return null
  const elapsed = Math.max(0, (now - processing.startedAt) / 1000)
  const remaining = processing.progress > 0.02 ? elapsed / processing.progress - elapsed : 0
  return (
    <div className="processing-bar" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={17} />
      <div className="processing-bar__copy">
        <strong>{processing.task}</strong>
        <span>{processing.detail}</span>
      </div>
      <div className="processing-bar__track">
        <span style={{ width: `${Math.round(processing.progress * 100)}%` }} />
      </div>
      <output>{Math.round(processing.progress * 100)}%</output>
      {remaining > 0 && <small>~{formatTime(remaining)} left</small>}
      <button type="button" onClick={processing.cancel} title="Cancel operation">
        <Ban size={15} /> Cancel
      </button>
    </div>
  )
}
