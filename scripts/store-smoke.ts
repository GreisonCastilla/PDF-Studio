/**
 * Checks the editor's small state machine, in particular that crop mode is never
 * left switched on behind another tool.
 *
 *   npm run test:store
 */
import { useEditor } from '../src/store'
import type { PageItem } from '../src/types'

let failures = 0

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const page = (id: string): PageItem => ({
  id, srcId: 'src', srcIndex: 0, rotation: 0, crop: null,
  baseX: 0, baseY: 0, baseW: 595, baseH: 842, baseRotation: 0,
})

function seed() {
  useEditor.setState({
    pages: [page('p1'), page('p2')],
    annotations: [],
    activePageId: 'p1',
    cropTarget: null,
    tool: 'select',
    past: [],
    future: [],
  })
  return useEditor.getState()
}

function cropModeExits() {
  const s = seed()

  s.setCropTarget('p1')
  check('entering crop mode sets both the tool and the target',
    useEditor.getState().tool === 'crop' && useEditor.getState().cropTarget === 'p1')

  s.setTool('select')
  check('switching to another tool leaves crop mode completely',
    useEditor.getState().cropTarget === null,
    `cropTarget=${useEditor.getState().cropTarget}`)

  s.setCropTarget('p1')
  s.setTool('rect')
  check('the same holds for a drawing tool', useEditor.getState().cropTarget === null)

  s.setCropTarget('p1')
  s.setTool('crop')
  check('re-selecting the crop tool keeps its target',
    useEditor.getState().cropTarget === 'p1')

  s.setCropTarget(null)
  check('clearing the target returns to the select tool',
    useEditor.getState().tool === 'select' && useEditor.getState().cropTarget === null)
}

function applyingCropLeavesTheMode() {
  const s = seed()
  s.setCropTarget('p2')
  s.setCrop('p2', { x: 10, y: 20, w: 100, h: 200 })

  const after = useEditor.getState()
  check('applying a crop stores it on the page',
    after.pages[1].crop?.w === 100 && after.pages[1].crop?.h === 200)
  check('applying a crop leaves crop mode',
    after.cropTarget === null && after.tool === 'select',
    `tool=${after.tool} target=${after.cropTarget}`)

  s.setCrop('p2', null)
  check('a crop can be removed again', useEditor.getState().pages[1].crop === null)
}

function deletingTheCroppedPage() {
  const s = seed()
  s.setCropTarget('p1')
  s.deletePages(['p1'])

  const after = useEditor.getState()
  check('deleting the page being cropped clears the target',
    after.cropTarget === null && after.tool === 'select',
    `tool=${after.tool} target=${after.cropTarget}`)
  check('a crop target on another page survives an unrelated delete', (() => {
    const t = seed()
    t.setCropTarget('p2')
    t.deletePages(['p1'])
    return useEditor.getState().cropTarget === 'p2'
  })())
}

function undoRedo() {
  const s = seed()
  s.rotatePages(['p1'], 90)
  check('rotation is recorded', useEditor.getState().pages[0].rotation === 90)
  useEditor.getState().undo()
  check('undo puts the rotation back', useEditor.getState().pages[0].rotation === 0)
  useEditor.getState().redo()
  check('redo applies it again', useEditor.getState().pages[0].rotation === 90)
}

cropModeExits()
applyingCropLeavesTheMode()
deletingTheCroppedPage()
undoRedo()

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodo correcto')
process.exit(failures ? 1 : 0)
