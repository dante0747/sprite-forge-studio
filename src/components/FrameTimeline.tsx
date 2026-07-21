import {
  Copy,
  GripVertical,
  ImagePlus,
  ListFilter,
  MoreHorizontal,
  ScanLine,
  Trash2,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useEditor } from '../context/EditorContext'
import type { FrameItem } from '../types/editor'
import { IconButton } from './ui/Controls'

export function FrameTimeline({ frameIndex, setFrameIndex }: { frameIndex: number; setFrameIndex: (index: number) => void }) {
  const { activeProject, updateFrames } = useEditor()
  const [dragIndex, setDragIndex] = useState<number>()
  const replaceIndex = useRef<number | undefined>(undefined)
  const replaceInput = useRef<HTMLInputElement>(null)
  if (!activeProject) return null
  const frames = activeProject.frames

  const commit = (next: FrameItem[]) => updateFrames(activeProject.id, next)
  const select = (index: number, additive: boolean) => {
    setFrameIndex(index)
    commit(
      frames.map((frame, framePosition) => ({
        ...frame,
        selected: additive ? (framePosition === index ? !frame.selected : frame.selected) : framePosition === index,
      })),
    )
  }
  const deleteSelected = () => {
    const hasSelected = frames.some((frame) => frame.selected)
    const next = frames.filter((frame, index) => (hasSelected ? !frame.selected : index !== frameIndex))
    commit(next)
    setFrameIndex(Math.min(frameIndex, Math.max(0, next.length - 1)))
  }
  const duplicate = () => {
    const selected = frames.filter((frame) => frame.selected)
    const source = selected.length ? selected : frames[frameIndex] ? [frames[frameIndex]] : []
    if (!source.length) return
    const copies = source.map((frame) => ({
      ...frame,
      id: crypto.randomUUID(),
      name: `${frame.name}_copy`,
      url: URL.createObjectURL(frame.blob),
      selected: true,
    }))
    commit([...frames.map((frame) => ({ ...frame, selected: false })), ...copies])
  }
  const reorder = (targetIndex: number) => {
    if (dragIndex === undefined || dragIndex === targetIndex) return
    const next = [...frames]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(targetIndex, 0, moved)
    commit(next)
    setFrameIndex(targetIndex)
    setDragIndex(undefined)
  }
  const rename = (index: number) => {
    const name = window.prompt('Frame name', frames[index].name)
    if (!name?.trim()) return
    commit(frames.map((frame, position) => (position === index ? { ...frame, name: name.trim() } : frame)))
  }
  const replace = async (file?: File) => {
    const index = replaceIndex.current
    if (!file || index === undefined) return
    const bitmap = await createImageBitmap(file)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    const url = URL.createObjectURL(file)
    commit(
      frames.map((frame, position) =>
        position === index
          ? { ...frame, blob: file, url, ...dimensions }
          : frame,
      ),
    )
    if (replaceInput.current) replaceInput.current.value = ''
  }

  return (
    <section className="frame-timeline panel-edge">
      <header className="frame-timeline__header">
        <div>
          <strong>FRAMES</strong>
          <span>{frames.length} total</span>
          {frames.some((frame) => frame.selected) && <span>· {frames.filter((frame) => frame.selected).length} selected</span>}
        </div>
        <div className="frame-actions">
          <IconButton label="Detect duplicate frames"><ScanLine size={15} /></IconButton>
          <IconButton label="Filter frames"><ListFilter size={15} /></IconButton>
          <span />
          <IconButton label="Duplicate selected frames" onClick={duplicate} disabled={!frames.length}><Copy size={15} /></IconButton>
          <IconButton label="Delete selected frames" onClick={deleteSelected} disabled={!frames.length}><Trash2 size={15} /></IconButton>
          <IconButton label="More frame actions"><MoreHorizontal size={16} /></IconButton>
        </div>
      </header>
      <div className="frame-strip">
        {frames.length ? (
          frames.map((frame, index) => (
            <button
              key={frame.id}
              type="button"
              draggable
              className={`frame-card ${frame.selected ? 'is-selected' : ''} ${index === frameIndex ? 'is-current' : ''}`}
              onClick={(event) => select(index, event.ctrlKey || event.metaKey || event.shiftKey)}
              onDoubleClick={() => rename(index)}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => reorder(index)}
              onContextMenu={(event) => {
                event.preventDefault()
                replaceIndex.current = index
                replaceInput.current?.click()
              }}
            >
              <span className="frame-card__number">{(index + 1).toString().padStart(2, '0')}</span>
              <span className="frame-card__image checkerboard">
                <img src={frame.url} alt={frame.name} loading="lazy" draggable={false} />
              </span>
              <span className="frame-card__label">{frame.name}</span>
              <GripVertical className="frame-card__grip" size={13} />
            </button>
          ))
        ) : (
          <div className="frame-strip__empty">
            <ImagePlus size={22} />
            <span>Extract frames to begin editing your sequence.</span>
          </div>
        )}
      </div>
      <input
        ref={replaceInput}
        type="file"
        accept="image/png,image/webp"
        hidden
        onChange={(event) => void replace(event.target.files?.[0])}
      />
    </section>
  )
}
