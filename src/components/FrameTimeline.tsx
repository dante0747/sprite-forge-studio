import {
  ClipboardPaste,
  Copy,
  GripVertical,
  ImagePlus,
  Pencil,
  Scissors,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../context/EditorContext'
import type { FrameItem } from '../types/editor'
import { IconButton } from './ui/Controls'

export function FrameTimeline({ frameIndex, setFrameIndex }: { frameIndex: number; setFrameIndex: (index: number) => void }) {
  const { activeProject, processing, updateFrames, updateProject } = useEditor()
  const [dragIndex, setDragIndex] = useState<number>()
  const [clipboard, setClipboard] = useState<Array<Pick<FrameItem, 'name' | 'blob' | 'width' | 'height' | 'sourceTime' | 'included'>>>([])
  const selectionAnchor = useRef<number | undefined>(undefined)
  const replaceIndex = useRef<number | undefined>(undefined)
  const replaceInput = useRef<HTMLInputElement>(null)
  const frames = activeProject?.frames ?? []

  const commit = (next: FrameItem[], record = true) => {
    if (!activeProject) return
    if (record && processing.active) return
    if (record) updateFrames(activeProject.id, next)
    else updateProject(activeProject.id, { frames: next })
  }
  const select = (index: number, toggle: boolean, range: boolean) => {
    setFrameIndex(index)
    if (range) {
      const anchor = selectionAnchor.current ?? frameIndex
      const start = Math.min(anchor, index)
      const end = Math.max(anchor, index)
      commit(
        frames.map((frame, framePosition) => ({
          ...frame,
          selected: (toggle && frame.selected) || (framePosition >= start && framePosition <= end),
        })),
        false,
      )
      return
    }
    selectionAnchor.current = index
    commit(
      frames.map((frame, framePosition) => ({
        ...frame,
        selected: toggle ? (framePosition === index ? !frame.selected : frame.selected) : framePosition === index,
      })),
      false,
    )
  }
  const selectedOrCurrent = () => {
    const selected = frames.filter((frame) => frame.selected)
    return selected.length ? selected : frames[frameIndex] ? [frames[frameIndex]] : []
  }
  const copySelected = () => {
    const source = selectedOrCurrent()
    if (!source.length) return
    setClipboard(source.map(({ name, blob, width, height, sourceTime, included }) => ({ name, blob, width, height, sourceTime, included })))
  }
  const deleteSelected = () => {
    const hasSelected = frames.some((frame) => frame.selected)
    const removedIndices = frames.flatMap((frame, index) => (hasSelected ? frame.selected : index === frameIndex) ? [index] : [])
    const next = frames.filter((frame, index) => (hasSelected ? !frame.selected : index !== frameIndex))
    commit(next)
    setFrameIndex(Math.min(removedIndices[0] ?? frameIndex, Math.max(0, next.length - 1)))
    selectionAnchor.current = undefined
  }
  const cutSelected = () => {
    if (!selectedOrCurrent().length) return
    copySelected()
    deleteSelected()
  }
  const pasteFrames = () => {
    if (!clipboard.length || processing.active) return
    const names = new Set(frames.map((frame) => frame.name))
    const copies: FrameItem[] = clipboard.map((frame) => {
      const base = `${frame.name}_copy`
      let name = base
      let suffix = 2
      while (names.has(name)) name = `${base}_${suffix++}`
      names.add(name)
      return {
        ...frame,
        id: crypto.randomUUID(),
        name,
        url: URL.createObjectURL(frame.blob),
        selected: true,
      }
    })
    const selectedIndices = frames.flatMap((frame, index) => frame.selected ? [index] : [])
    const insertAfter = selectedIndices.at(-1) ?? (frames.length ? Math.min(frameIndex, frames.length - 1) : -1)
    const next = frames.map((frame) => ({ ...frame, selected: false }))
    next.splice(insertAfter + 1, 0, ...copies)
    commit(next)
    setFrameIndex(insertAfter + 1)
    selectionAnchor.current = insertAfter + 1
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
    if (processing.active) return
    const name = window.prompt('Frame name', frames[index].name)
    if (!name?.trim()) return
    const normalized = name.trim().replace(/[\\/:*?"<>|]/g, '_')
    if (frames.some((frame, position) => position !== index && frame.name === normalized)) {
      window.alert('Frame names must be unique so exported metadata and image files do not collide.')
      return
    }
    commit(frames.map((frame, position) => (position === index ? { ...frame, name: normalized } : frame)))
  }
  const replace = async (file?: File) => {
    const index = replaceIndex.current
    if (!file || index === undefined || processing.active) return
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

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const editing = ['INPUT', 'SELECT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)
      if (editing || !activeProject) return
      const command = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (command && key === 'a') {
        event.preventDefault()
        commit(frames.map((frame) => ({ ...frame, selected: true })), false)
        selectionAnchor.current = frames.length ? 0 : undefined
      } else if (command && key === 'c') {
        event.preventDefault()
        copySelected()
      } else if (command && key === 'x' && !processing.active) {
        event.preventDefault()
        cutSelected()
      } else if (command && key === 'v' && !processing.active) {
        event.preventDefault()
        pasteFrames()
      } else if (!processing.active && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        deleteSelected()
      } else if (!processing.active && event.key === 'F2' && frames[frameIndex]) {
        event.preventDefault()
        rename(frameIndex)
      } else if (event.key === 'Escape' && frames.some((frame) => frame.selected)) {
        commit(frames.map((frame) => ({ ...frame, selected: false })), false)
        selectionAnchor.current = undefined
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  })

  useEffect(() => {
    selectionAnchor.current = undefined
  }, [activeProject?.id])

  if (!activeProject) return null
  const chosenCount = frames.filter((frame) => frame.included !== false).length

  return (
    <section className="frame-timeline panel-edge">
      <header className="frame-timeline__header">
        <div>
          <strong>FRAMES</strong>
          <span>{chosenCount} chosen · {frames.length} total</span>
          {frames.some((frame) => frame.selected) && <span>· {frames.filter((frame) => frame.selected).length} selected</span>}
        </div>
        <div className="frame-actions">
          {clipboard.length > 0 && <output className="frame-action-status" aria-live="polite">{clipboard.length} copied</output>}
          <IconButton label="Copy selected frames (Ctrl+C)" onClick={copySelected} disabled={!frames.length}><Copy size={15} /></IconButton>
          <IconButton label="Cut selected frames (Ctrl+X)" onClick={cutSelected} disabled={!frames.length || processing.active}><Scissors size={15} /></IconButton>
          <IconButton label="Paste frames after selection (Ctrl+V)" onClick={pasteFrames} disabled={!clipboard.length || processing.active}><ClipboardPaste size={15} /></IconButton>
          <IconButton label="Delete selected frames (Delete)" onClick={deleteSelected} disabled={!frames.length || processing.active}><Trash2 size={15} /></IconButton>
          <span />
          <IconButton label="Rename current frame (F2)" onClick={() => rename(frameIndex)} disabled={!frames[frameIndex] || processing.active}><Pencil size={15} /></IconButton>
          <IconButton label="Replace current frame image" onClick={() => { replaceIndex.current = frameIndex; replaceInput.current?.click() }} disabled={!frames[frameIndex] || processing.active}><ImagePlus size={15} /></IconButton>
        </div>
      </header>
      <div className="frame-strip">
        {frames.length ? (
          frames.map((frame, index) => (
            <button
              key={frame.id}
              type="button"
              draggable={!processing.active}
              className={`frame-card ${frame.included === false ? 'is-excluded' : 'is-included'} ${frame.selected ? 'is-selected' : ''} ${index === frameIndex ? 'is-current' : ''}`}
              title="Shift-click for a range · Ctrl/Cmd-click to toggle · Double-click to rename · Right-click to replace"
              onClick={(event) => select(index, event.ctrlKey || event.metaKey, event.shiftKey)}
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
