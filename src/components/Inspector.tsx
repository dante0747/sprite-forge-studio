import {
  Box,
  Download,
  Droplets,
  FileArchive,
  FileJson,
  Grid2X2,
  Pipette,
  Play,
  RotateCcw,
  Scissors,
  Settings2,
  Sparkles,
  Timer,
} from 'lucide-react'
import { useState } from 'react'
import { useEditor } from '../context/EditorContext'
import { formatTime } from '../lib/format'
import { estimateExtractionCount, getTrimmedSourceFrameCount } from '../lib/media'
import type { Alignment, ExportMetadata } from '../types/editor'
import { Button, Field, NumberInput, Section, Segmented, Select, Slider, Toggle } from './ui/Controls'

type InspectorTab = 'extract' | 'key' | 'layout' | 'export'

export function Inspector({
  onExtract,
  onGenerate,
  onExportSheet,
  onExportFrames,
  onExportZip,
  onShowView,
}: {
  onExtract: () => void
  onGenerate: () => void
  onExportSheet: () => void
  onExportFrames: () => void
  onExportZip: () => void
  onShowView: (view: 'source' | 'frames' | 'key' | 'sheet' | 'animate') => void
}) {
  const { activeProject: project, updateProject, updateFrames, processing, preferences, updatePreferences } = useEditor()
  const [tab, setTab] = useState<InspectorTab>('extract')
  if (!project) {
    return (
      <aside className="inspector panel-edge inspector--empty">
        <Settings2 size={25} />
        <strong>Properties</strong>
        <span>Select or import an animation to edit its settings.</span>
      </aside>
    )
  }
  const updateExtraction = (update: Partial<typeof project.extraction>) => {
    const extraction = { ...project.extraction, ...update }
    updateProject(project.id, { extraction })
    updatePreferences({ lastSampling: { interval: extraction.interval, fpsOverride: extraction.fpsOverride } })
  }
  const frameDuration = 1 / Math.max(1, project.metadata.fps)
  const updateTrim = (update: Partial<typeof project.trim>, previewTime?: number) => {
    const next = { ...project.trim, ...update }
    if (update.startTime !== undefined) {
      next.startTime = Math.max(0, Math.min(update.startTime, next.endTime - frameDuration))
    }
    if (update.endTime !== undefined) {
      next.endTime = Math.min(
        project.metadata.duration,
        Math.max(update.endTime, next.startTime + frameDuration),
      )
    }
    const trim = {
      startTime: Math.round(next.startTime * 1000) / 1000,
      endTime: Math.round(next.endTime * 1000) / 1000,
    }
    updateProject(project.id, { trim, sheetResult: undefined })
    if (previewTime !== undefined) {
      const seekTime = update.startTime !== undefined ? trim.startTime : trim.endTime
      window.dispatchEvent(new CustomEvent('spriteforge:seek-source', { detail: seekTime }))
    }
  }
  const updateChroma = (update: Partial<typeof project.chroma>) => {
    const chroma = { ...project.chroma, ...update }
    updateProject(project.id, { chroma, sheetResult: undefined })
    updatePreferences({ lastChroma: chroma })
  }
  const updateSheet = (update: Partial<typeof project.sheet>) => {
    const sheet = { ...project.sheet, ...update }
    updateProject(project.id, { sheet, sheetResult: undefined })
    updatePreferences({ lastSheet: sheet })
  }
  const updateAnimation = (update: Partial<typeof project.animation>) => {
    const animation = { ...project.animation, ...update }
    updateProject(project.id, { animation })
    updatePreferences({ lastAnimation: animation })
  }
  const keyChannels = project.chroma.color
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16)) ?? [0, 0, 0]
  const neutralKey = Math.max(...keyChannels) - Math.min(...keyChannels) < 24
  const trimDuration = Math.max(frameDuration, project.trim.endTime - project.trim.startTime)
  const trimmedSourceFrames = getTrimmedSourceFrameCount(project.trim, project.metadata)
  const estimatedFrames = estimateExtractionCount(project.trim, project.extraction, project.metadata)
  const durationForPercent = Math.max(frameDuration, project.metadata.duration)
  const trimStartPercent = (project.trim.startTime / durationForPercent) * 100
  const trimEndPercent = (project.trim.endTime / durationForPercent) * 100
  const chosenCount = project.frames.filter((frame) => frame.included !== false).length
  const setFrameInclusion = (mode: 'all' | 'none' | 'invert') => {
    const frames = project.frames.map((frame) => ({
      ...frame,
      included: mode === 'all' ? true : mode === 'none' ? false : frame.included === false,
    }))
    if (frames.some((frame, index) => frame.included !== project.frames[index].included)) {
      updateFrames(project.id, frames)
    }
  }

  const changeTab = (next: InspectorTab) => {
    setTab(next)
    if (next === 'extract') onShowView(project.frames.length ? 'frames' : 'source')
    if (next === 'key') onShowView('key')
    if (next === 'layout') onShowView('sheet')
  }

  return (
    <aside className="inspector panel-edge">
      <header className="inspector-tabs">
        {([
          ['extract', Scissors, 'Frames'],
          ['key', Droplets, 'Key'],
          ['layout', Grid2X2, 'Layout'],
          ['export', Download, 'Export'],
        ] as const).map(([id, Icon, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => changeTab(id)}>
            <Icon size={16} /><span>{label}</span>
          </button>
        ))}
      </header>
      <fieldset className="inspector-scroll" disabled={processing.active}>
        {tab === 'extract' && (
          <>
            <div className="pipeline-overview" aria-label="Frame curation pipeline">
              <span className={`pipeline-step ${project.frames.length ? 'is-complete' : 'is-active'}`}><b>1</b> Frames</span>
              <i />
              <span className={`pipeline-step ${project.frames.length ? 'is-active' : ''}`}><b>2</b> Pick</span>
              <i />
              <span className="pipeline-step"><b>3</b> Preview</span>
            </div>
            <Section title="Source clip">
              <div className="source-summary">
                <span>{project.metadata.width} × {project.metadata.height}</span>
                <span>{project.metadata.fps.toFixed(2)} FPS</span>
                <span>{formatTime(project.metadata.duration)}</span>
              </div>
            </Section>
            {project.frames.length > 0 && (
              <Section title="Cherry-pick sequence">
                <div className="curation-summary-card">
                  <span><strong>{chosenCount}</strong> chosen</span>
                  <span>{project.frames.length - chosenCount} skipped</span>
                </div>
                <Button variant="primary" onClick={() => onShowView('frames')}><Grid2X2 size={15} /> Open frame gallery</Button>
                <div className="curation-inspector-actions">
                  <Button variant="ghost" disabled={chosenCount === project.frames.length} onClick={() => setFrameInclusion('all')}>Choose all</Button>
                  <Button variant="ghost" disabled={chosenCount === 0} onClick={() => setFrameInclusion('none')}>Clear</Button>
                  <Button variant="ghost" disabled={project.frames.length === 0} onClick={() => setFrameInclusion('invert')}>Invert</Button>
                </div>
                <span className="section-note">The live gallery preview updates immediately. Sheet generation uses only chosen frames.</span>
              </Section>
            )}
            <Section
              title={project.frames.length ? 'Rebuild · Source range' : 'Source range'}
              action={(
                <button
                  type="button"
                  className="section-action"
                  onClick={() => updateTrim({ startTime: 0, endTime: project.metadata.duration }, 0)}
                  disabled={project.trim.startTime === 0 && Math.abs(project.trim.endTime - project.metadata.duration) < 0.0005}
                >
                  <RotateCcw size={12} /> Reset
                </button>
              )}
            >
              <div className="trim-range" style={{ '--trim-start': `${trimStartPercent}%`, '--trim-end': `${trimEndPercent}%` } as React.CSSProperties}>
                <div className="trim-range__track"><span /></div>
                <input
                  aria-label="Trim start"
                  type="range"
                  min={0}
                  max={project.metadata.duration}
                  step={frameDuration}
                  value={project.trim.startTime}
                  onChange={(event) => updateTrim({ startTime: Number(event.target.value) }, Number(event.target.value))}
                />
                <input
                  aria-label="Trim end"
                  type="range"
                  min={0}
                  max={project.metadata.duration}
                  step={frameDuration}
                  value={project.trim.endTime}
                  onChange={(event) => updateTrim({ endTime: Number(event.target.value) }, Number(event.target.value))}
                />
              </div>
              <div className="field-grid">
                <Field label="In point" hint={formatTime(project.trim.startTime)}>
                  <NumberInput
                    aria-label="Trim in point in seconds"
                    min={0}
                    max={Math.max(0, project.trim.endTime - frameDuration)}
                    step={0.001}
                    value={project.trim.startTime}
                    onChange={(event) => updateTrim({ startTime: Number(event.target.value) }, Number(event.target.value))}
                  />
                </Field>
                <Field label="Out point" hint={formatTime(project.trim.endTime)}>
                  <NumberInput
                    aria-label="Trim out point in seconds"
                    min={project.trim.startTime + frameDuration}
                    max={project.metadata.duration}
                    step={0.001}
                    value={project.trim.endTime}
                    onChange={(event) => updateTrim({ endTime: Number(event.target.value) }, Number(event.target.value))}
                  />
                </Field>
              </div>
              <div className="trim-summary">
                <Timer size={15} />
                <span><strong>{formatTime(trimDuration)}</strong> selected · {trimmedSourceFrames} source frames</span>
              </div>
            </Section>
            <Section title="Gallery density">
              <Segmented
                value={project.extraction.mode}
                options={[{ value: 'range', label: 'By interval' }, { value: 'exact', label: 'Exact count' }]}
                onChange={(mode) => updateExtraction({ mode })}
              />
              {project.extraction.mode === 'exact' && (
                <Field label="Number of frames" hint="Evenly spaced">
                  <NumberInput min={1} max={trimmedSourceFrames} value={Math.min(project.extraction.exactFrames, trimmedSourceFrames)} onChange={(e) => updateExtraction({ exactFrames: Number(e.target.value) })} />
                </Field>
              )}
              {project.extraction.mode === 'range' && (
                <>
                  {project.extraction.fpsOverride === null ? (
                    <Field label="Keep frames">
                      <Select value={project.extraction.interval} onChange={(e) => updateExtraction({ interval: Number(e.target.value) })}>
                        <option value={1}>Every frame</option>
                        <option value={2}>Every 2nd frame</option>
                        <option value={3}>Every 3rd frame</option>
                        <option value={4}>Every 4th frame</option>
                        <option value={5}>Every 5th frame</option>
                      </Select>
                    </Field>
                  ) : (
                    <Slider label="Target rate" value={project.extraction.fpsOverride} min={1} max={60} suffix=" FPS" onChange={(fpsOverride) => updateExtraction({ fpsOverride })} />
                  )}
                  <Toggle
                    label="Sample at a target FPS"
                    description="Useful for a fixed animation rate"
                    checked={project.extraction.fpsOverride !== null}
                    onChange={(enabled) => updateExtraction({ fpsOverride: enabled ? 12 : null })}
                  />
                </>
              )}
              <div className="output-estimate"><strong>{estimatedFrames}</strong><span>frames will be extracted from the trimmed clip</span></div>
            </Section>
            <div className="inspector-cta">
              <Button variant="primary" onClick={onExtract} disabled={processing.active}>
                <Scissors size={16} /> {project.frames.length ? `Rebuild ${estimatedFrames}-frame gallery` : `Build ${estimatedFrames}-frame gallery`}
              </Button>
              <span>{project.frames.length ? 'Rebuilding replaces the current gallery and its cherry-picks.' : 'Every extracted frame starts included and can be cherry-picked next.'}</span>
            </div>
          </>
        )}
        {tab === 'key' && (
          <>
            <Section title="Chroma key" action={<Sparkles size={14} />}>
              <Toggle label="Remove background" description="Exports 32-bit PNG alpha" checked={project.chroma.enabled} onChange={(enabled) => updateChroma({ enabled })} />
              <div className="color-key-row">
                <label>
                  <input type="color" value={project.chroma.color} onChange={(e) => updateChroma({ color: e.target.value })} />
                  <span style={{ backgroundColor: project.chroma.color }} />
                </label>
                <input className="control-input" value={project.chroma.color.toUpperCase()} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && updateChroma({ color: e.target.value })} />
                <button type="button" title="Use the eyedropper in the preview" onClick={() => onShowView('key')}><Pipette size={16} /></button>
              </div>
              <Slider label="Tolerance" value={project.chroma.tolerance} onChange={(tolerance) => updateChroma({ tolerance })} />
              <Slider label="Edge softness" value={project.chroma.softness} onChange={(softness) => updateChroma({ softness })} />
              <Slider label="Feather" value={project.chroma.feather} min={0} max={5} suffix=" px" onChange={(feather) => updateChroma({ feather })} />
              <Slider label="Noise reduction" value={project.chroma.noiseReduction} onChange={(noiseReduction) => updateChroma({ noiseReduction })} />
              <Slider label="Spill suppression" value={project.chroma.spillSuppression} onChange={(spillSuppression) => updateChroma({ spillSuppression })} />
            </Section>
            <Section title="Preview background">
              <div className="background-swatches">
                {(['checker', 'transparent', 'black', 'white'] as const).map((background) => (
                  <button
                    key={background}
                    type="button"
                    title={background}
                    className={`${background} ${project.chroma.previewBackground === background ? 'is-active' : ''}`}
                    onClick={() => updateChroma({ previewBackground: background })}
                  />
                ))}
              </div>
            </Section>
            <div className="tip-card"><Sparkles size={16} /><span><strong>{neutralKey ? 'Neutral-key protection active' : 'Non-destructive key'}</strong>{neutralKey ? 'Edge-connected analysis protects interior whites and blacks while cleaning backdrop halos.' : 'Your original frames are preserved. Alpha is rendered into exports only.'}</span></div>
          </>
        )}
        {tab === 'layout' && (
          <>
            <Section title="Grid layout">
              <Segmented value={project.sheet.layout} options={[{ value: 'automatic', label: 'Automatic' }, { value: 'manual', label: 'Manual' }]} onChange={(layout) => updateSheet({ layout })} />
              {project.sheet.layout === 'manual' && (
                <div className="field-grid">
                  <Field label="Columns"><NumberInput min={1} max={128} value={project.sheet.columns} onChange={(e) => updateSheet({ columns: Number(e.target.value) })} /></Field>
                  <Field label="Rows"><NumberInput min={1} max={128} value={project.sheet.rows} onChange={(e) => updateSheet({ rows: Number(e.target.value) })} /></Field>
                </div>
              )}
            </Section>
            <Section title="Cell size">
              <Segmented value={project.sheet.cellMode} options={[{ value: 'automatic', label: 'Automatic' }, { value: 'manual', label: 'Manual' }]} onChange={(cellMode) => updateSheet({ cellMode })} />
              {project.sheet.cellMode === 'manual' && (
                <div className="field-grid">
                  <Field label="Width"><NumberInput min={1} max={4096} value={project.sheet.cellWidth} onChange={(e) => updateSheet({ cellWidth: Number(e.target.value) })} /></Field>
                  <Field label="Height"><NumberInput min={1} max={4096} value={project.sheet.cellHeight} onChange={(e) => updateSheet({ cellHeight: Number(e.target.value) })} /></Field>
                </div>
              )}
              <Field label="Alignment">
                <Select value={project.sheet.alignment} onChange={(e) => updateSheet({ alignment: e.target.value as Alignment })}>
                  <option value="center">Center</option><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option>
                </Select>
              </Field>
              <Toggle label="Trim transparent pixels" checked={project.sheet.trim} onChange={(trim) => updateSheet({ trim })} />
              <Toggle label="Uniform cell size" checked={project.sheet.uniformCells} onChange={(uniformCells) => updateSheet({ uniformCells })} />
            </Section>
            <Section title="Padding & spacing">
              <div className="field-grid">
                <Field label="Frame padding" hint="Inside">
                  <NumberInput min={0} max={128} value={project.sheet.padding} onChange={(e) => updateSheet({ padding: Math.max(0, Number(e.target.value)) })} />
                </Field>
                <Field label="Frame spacing" hint="Between">
                  <NumberInput min={0} max={128} value={project.sheet.spacing} onChange={(e) => updateSheet({ spacing: Math.max(0, Number(e.target.value)) })} />
                </Field>
              </div>
              <Field label="Sheet edge margin" hint="Outer border">
                <NumberInput min={0} max={256} value={project.sheet.margin} onChange={(e) => updateSheet({ margin: Math.max(0, Number(e.target.value)) })} />
              </Field>
              <div className="spacing-guide" aria-hidden="true">
                <span>sheet margin</span><i><b>padding</b></i><em>spacing</em><i><b>padding</b></i>
              </div>
            </Section>
            <Section title="Texture">
              <Field label="Power of two">
                <Select value={project.sheet.powerOfTwo} onChange={(e) => updateSheet({ powerOfTwo: Number(e.target.value) as typeof project.sheet.powerOfTwo })}>
                  <option value={0}>Off · natural size</option><option value={256}>Fit into 256 × 256</option><option value={512}>Fit into 512 × 512</option><option value={1024}>Fit into 1024 × 1024</option><option value={2048}>Fit into 2048 × 2048</option><option value={4096}>Fit into 4096 × 4096</option>
                </Select>
              </Field>
              <Field label="Background">
                <Select value={project.sheet.background} onChange={(e) => updateSheet({ background: e.target.value as typeof project.sheet.background })}>
                  <option value="transparent">Transparent</option><option value="black">Black</option><option value="white">White</option><option value="custom">Custom</option>
                </Select>
              </Field>
              {project.sheet.background === 'custom' && <input type="color" className="wide-color" value={project.sheet.customColor} onChange={(e) => updateSheet({ customColor: e.target.value })} />}
            </Section>
            <div className="inspector-cta">
              {project.sheetResult && (
                <div className="generated-sheet-status">
                  <span>Generated sheet</span>
                  <strong>{project.sheetResult.width} × {project.sheetResult.height}px · {project.sheetResult.frames.length} frames</strong>
                </div>
              )}
              <Button variant="primary" onClick={onGenerate} disabled={!chosenCount || processing.active}><Grid2X2 size={16} /> {project.sheetResult ? 'Regenerate sprite sheet' : `Generate sheet from ${chosenCount} frames`}</Button>
            </div>
          </>
        )}
        {tab === 'export' && (
          <>
            <Section title="Animation preview">
              <Slider label="Playback rate" value={project.animation.fps} min={1} max={60} suffix=" FPS" onChange={(fps) => updateAnimation({ fps })} />
              <Field label="Playback mode"><Select value={project.animation.loopMode} onChange={(e) => updateAnimation({ loopMode: e.target.value as typeof project.animation.loopMode })}><option value="loop">Loop</option><option value="ping-pong">Ping pong</option><option value="once">Play once</option></Select></Field>
              <Toggle label="Reverse playback" checked={project.animation.reverse} onChange={(reverse) => updateAnimation({ reverse })} />
              <Button variant="ghost" onClick={() => onShowView('animate')} disabled={!project.sheetResult}><Play size={15} /> Preview generated sheet animation</Button>
              {!project.sheetResult && <span className="section-note">Generate the sprite sheet in Layout before previewing its packed frames.</span>}
            </Section>
            <Section title="Package settings">
              <Field label="Metadata format"><Select value={preferences.exportMetadata} onChange={(e) => updatePreferences({ exportMetadata: e.target.value as ExportMetadata })}><option value="json">JSON</option><option value="xml">XML</option><option value="csv">CSV</option></Select></Field>
              <Toggle label="Include Phaser example" checked={preferences.includePhaser} onChange={(includePhaser) => updatePreferences({ includePhaser })} />
            </Section>
            <div className="export-stack">
              <button type="button" onClick={onExportSheet} disabled={!chosenCount || processing.active}><Box size={18} /><span><strong>Sprite sheet PNG</strong><small>{project.sheetResult ? 'Export the generated texture' : `Generate from ${chosenCount} chosen frames`}</small></span></button>
              <button type="button" onClick={onExportFrames} disabled={!chosenCount}><FileJson size={18} /><span><strong>Chosen frames</strong><small>{chosenCount} transparent PNG files</small></span></button>
              <button type="button" className="export-stack__primary" onClick={onExportZip} disabled={!chosenCount}><FileArchive size={18} /><span><strong>Complete ZIP package</strong><small>Chosen sequence, sheet, metadata & code</small></span></button>
            </div>
          </>
        )}
      </fieldset>
    </aside>
  )
}
