import {
  Box,
  Download,
  Droplets,
  FileArchive,
  FileJson,
  Grid2X2,
  Pipette,
  Play,
  Scissors,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { useEditor } from '../context/EditorContext'
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
  onShowView: (view: 'source' | 'key' | 'sheet' | 'animate') => void
}) {
  const { activeProject: project, updateProject, processing, preferences, updatePreferences } = useEditor()
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

  const changeTab = (next: InspectorTab) => {
    setTab(next)
    if (next === 'extract') onShowView('source')
    if (next === 'key') onShowView('key')
    if (next === 'layout') onShowView('sheet')
  }

  return (
    <aside className="inspector panel-edge">
      <header className="inspector-tabs">
        {([
          ['extract', Scissors, 'Extract'],
          ['key', Droplets, 'Key'],
          ['layout', Grid2X2, 'Layout'],
          ['export', Download, 'Export'],
        ] as const).map(([id, Icon, label]) => (
          <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => changeTab(id)}>
            <Icon size={16} /><span>{label}</span>
          </button>
        ))}
      </header>
      <div className="inspector-scroll">
        {tab === 'extract' && (
          <>
            <Section title="Source clip">
              <div className="source-summary">
                <span>{project.metadata.width} × {project.metadata.height}</span>
                <span>{project.metadata.fps.toFixed(2)} FPS</span>
                <span>{project.metadata.estimatedFrames} est. frames</span>
              </div>
            </Section>
            <Section title="Frame range">
              <div className="field-grid">
                <Field label="Start frame">
                  <NumberInput min={0} max={project.metadata.estimatedFrames - 1} value={project.extraction.startFrame} onChange={(e) => updateExtraction({ startFrame: Number(e.target.value) })} />
                </Field>
                <Field label="End frame">
                  <NumberInput min={project.extraction.startFrame} max={project.metadata.estimatedFrames - 1} value={project.extraction.endFrame} onChange={(e) => updateExtraction({ endFrame: Number(e.target.value) })} />
                </Field>
              </div>
              <Segmented
                value={project.extraction.mode}
                options={[{ value: 'range', label: 'All in range' }, { value: 'exact', label: 'Exact count' }]}
                onChange={(mode) => updateExtraction({ mode })}
              />
              {project.extraction.mode === 'exact' && (
                <Field label="Number of frames">
                  <NumberInput min={1} max={999} value={project.extraction.exactFrames} onChange={(e) => updateExtraction({ exactFrames: Number(e.target.value) })} />
                </Field>
              )}
            </Section>
            <Section title="Sampling">
              <Field label="Frame interval">
                <Select value={project.extraction.interval} onChange={(e) => updateExtraction({ interval: Number(e.target.value) })}>
                  <option value={1}>Every frame</option>
                  <option value={2}>Every 2 frames</option>
                  <option value={3}>Every 3 frames</option>
                  <option value={4}>Every 4 frames</option>
                  <option value={5}>Every 5 frames</option>
                </Select>
              </Field>
              <Toggle
                label="Frame rate override"
                description="Resample by output time"
                checked={project.extraction.fpsOverride !== null}
                onChange={(enabled) => updateExtraction({ fpsOverride: enabled ? 12 : null })}
              />
              {project.extraction.fpsOverride !== null && (
                <Slider label="Output rate" value={project.extraction.fpsOverride} min={1} max={60} suffix=" FPS" onChange={(fpsOverride) => updateExtraction({ fpsOverride })} />
              )}
            </Section>
            <div className="inspector-cta">
              <Button variant="primary" onClick={onExtract} disabled={processing.active}>
                <Scissors size={16} /> {project.frames.length ? 'Re-extract frames' : 'Extract frames'}
              </Button>
              <span>Estimated output: {project.extraction.mode === 'exact' ? project.extraction.exactFrames : Math.floor((project.extraction.endFrame - project.extraction.startFrame) / project.extraction.interval) + 1} frames</span>
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
              <div className="field-grid">
                <Field label="Cell padding"><NumberInput min={0} max={64} value={project.sheet.padding} onChange={(e) => updateSheet({ padding: Number(e.target.value) })} /></Field>
                <Field label="Margin"><NumberInput min={0} max={128} value={project.sheet.margin} onChange={(e) => updateSheet({ margin: Number(e.target.value) })} /></Field>
              </div>
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
            <Section title="Texture">
              <Field label="Power of two">
                <Select value={project.sheet.powerOfTwo} onChange={(e) => updateSheet({ powerOfTwo: Number(e.target.value) as typeof project.sheet.powerOfTwo })}>
                  <option value={0}>Off · fit content</option><option value={256}>256 × 256</option><option value={512}>512 × 512</option><option value={1024}>1024 × 1024</option><option value={2048}>2048 × 2048</option><option value={4096}>4096 × 4096</option>
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
              <Button variant="primary" onClick={onGenerate} disabled={!project.frames.length || processing.active}><Grid2X2 size={16} /> Generate sprite sheet</Button>
            </div>
          </>
        )}
        {tab === 'export' && (
          <>
            <Section title="Animation preview">
              <Slider label="Playback rate" value={project.animation.fps} min={1} max={60} suffix=" FPS" onChange={(fps) => updateAnimation({ fps })} />
              <Field label="Playback mode"><Select value={project.animation.loopMode} onChange={(e) => updateAnimation({ loopMode: e.target.value as typeof project.animation.loopMode })}><option value="loop">Loop</option><option value="ping-pong">Ping pong</option><option value="once">Play once</option></Select></Field>
              <Toggle label="Reverse playback" checked={project.animation.reverse} onChange={(reverse) => updateAnimation({ reverse })} />
              <Button variant="ghost" onClick={() => onShowView('animate')}><Play size={15} /> Open animation preview</Button>
            </Section>
            <Section title="Package settings">
              <Field label="Metadata format"><Select value={preferences.exportMetadata} onChange={(e) => updatePreferences({ exportMetadata: e.target.value as ExportMetadata })}><option value="json">JSON</option><option value="xml">XML</option><option value="csv">CSV</option></Select></Field>
              <Toggle label="Include Phaser example" checked={preferences.includePhaser} onChange={(includePhaser) => updatePreferences({ includePhaser })} />
            </Section>
            <div className="export-stack">
              <button type="button" onClick={onExportSheet} disabled={!project.sheetResult}><Box size={18} /><span><strong>Sprite sheet PNG</strong><small>32-bit lossless texture</small></span></button>
              <button type="button" onClick={onExportFrames} disabled={!project.frames.length}><FileJson size={18} /><span><strong>Individual frames</strong><small>Transparent PNG sequence</small></span></button>
              <button type="button" className="export-stack__primary" onClick={onExportZip} disabled={!project.frames.length}><FileArchive size={18} /><span><strong>Complete ZIP package</strong><small>Sheet, frames, metadata & code</small></span></button>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
