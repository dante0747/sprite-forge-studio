import { FileVideo2, LockKeyhole, MousePointer2, ShieldCheck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from './ui/Controls'

export function EmptyWorkspace({ onFiles, onSample }: { onFiles: (files: File[]) => void; onSample: () => void }) {
  const [dragging, setDragging] = useState(false)
  const drop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(false)
      onFiles(Array.from(event.dataTransfer.files))
    },
    [onFiles],
  )
  return (
    <main className="empty-workspace">
      <div
        className={`drop-stage ${dragging ? 'is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragging(false)
        }}
        onDrop={drop}
      >
        <div className="drop-stage__orb drop-stage__orb--one" />
        <div className="drop-stage__orb drop-stage__orb--two" />
        <div className="drop-stage__icon">
          <FileVideo2 size={38} />
          <span><MousePointer2 size={14} /></span>
        </div>
        <p className="eyebrow">NEW ANIMATION</p>
        <h1>Turn motion into<br /><em>game-ready sprites.</em></h1>
        <p className="drop-stage__copy">
          Drop your animation clips here. Extract, clean and pack every frame without your files ever leaving this device.
        </p>
        <label className="file-trigger">
          <input
            type="file"
            multiple
            accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,.mkv"
            onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
          />
          <Button variant="primary" type="button" tabIndex={-1}>
            <FileVideo2 size={17} /> Choose videos
          </Button>
        </label>
        <button className="sample-trigger" type="button" onClick={onSample}>or open the included chroma-key sample</button>
        <span className="drop-stage__formats">MP4 · MOV · AVI · WEBM · MKV</span>
        <div className="privacy-pill">
          <ShieldCheck size={14} />
          <span><strong>100% local processing</strong> · Nothing is uploaded</span>
          <LockKeyhole size={12} />
        </div>
      </div>
    </main>
  )
}
