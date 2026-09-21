/**
 * Regenerates THIRD-PARTY-NOTICES.md from what is actually installed.
 *
 * MIT, BSD, ISC and friends are free to use but not free of obligations: they
 * require the copyright and permission notices to travel with the code. Bundling
 * strips them, so they are collected here instead.
 *
 *   npm run notices
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

interface Node { version?: string; dependencies?: Record<string, Node>; missing?: boolean }

/** Every package npm would install for production, flattened. */
function productionPackages(): Set<string> {
  const raw = execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  const found = new Set<string>()
  const walk = (deps?: Record<string, Node>) => {
    for (const [name, node] of Object.entries(deps ?? {})) {
      // Unmet optional peers have no code on disk to attribute.
      if (node.missing || !node.version) continue
      found.add(name)
      walk(node.dependencies)
    }
  }
  walk((JSON.parse(raw) as Node).dependencies)
  return found
}

const LICENSE_FILE = /^(LICEN[CS]E|COPYING|NOTICE)(\.|$)/i

function licenseText(dir: string): string | null {
  let names: string[]
  try { names = readdirSync(dir) } catch { return null }
  const files = names.filter(n => LICENSE_FILE.test(n)).sort()
  if (!files.length) return null
  return files
    .map(f => readFileSync(join(dir, f), 'utf8').trim())
    .join('\n\n')
}

function spdx(pkg: Record<string, unknown>): string {
  const l = pkg.license
  if (typeof l === 'string') return l
  if (l && typeof l === 'object' && 'type' in l) return String((l as { type: string }).type)
  return 'sin declarar'
}

/** Packages whose code never reaches the browser, noted rather than hidden. */
const NODE_ONLY = new Set(['@napi-rs/canvas'])

/**
 * Prebuilt binaries, one per platform. Only the one matching this machine gets
 * installed, so listing it would make the file depend on where it was generated.
 * They share their parent's licence, which is stated in its entry.
 */
const PLATFORM_BINARY = /^@napi-rs\/canvas-/

/**
 * Copyright lines found inside a package that ships no licence file of its own —
 * usually because it bundles third-party code into its build output.
 */
function embeddedNotices(dir: string): string[] {
  const seen = new Set<string>()
  const scan = (path: string, depth: number) => {
    if (depth > 3 || seen.size > 40) return
    let names: string[]
    try { names = readdirSync(path, { withFileTypes: true }).map(d => (d.isDirectory() ? `${d.name}/` : d.name)) }
    catch { return }
    for (const name of names) {
      const full = join(path, name.replace(/\/$/, ''))
      if (name.endsWith('/')) { scan(full, depth + 1); continue }
      if (!/\.(js|mjs|cjs|ts|md)$/.test(name)) continue
      let text: string
      try { text = readFileSync(full, 'utf8') } catch { continue }
      for (const m of text.matchAll(/Copyright\s(?:\(c\)\s*)?\d{4}[^\n"'`]{0,70}/gi)) {
        const line = m[0].trim().replace(/[\s,.]+$/, '')
        if (line.length > 18) seen.add(line)
      }
    }
  }
  scan(dir, 0)
  return [...seen].sort()
}

function main() {
  const names = [...productionPackages()].sort()
  const entries: {
    name: string; version: string; license: string
    text: string | null; nodeOnly: boolean; author: string; url: string
  }[] = []

  for (const name of names) {
    if (PLATFORM_BINARY.test(name)) continue
    const dir = join('node_modules', ...name.split('/'))
    if (!existsSync(join(dir, 'package.json'))) continue
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    entries.push({
      name,
      version: String(pkg.version ?? ''),
      license: spdx(pkg),
      text: licenseText(dir),
      nodeOnly: NODE_ONLY.has(name),
      author: typeof pkg.author === 'string' ? pkg.author
        : pkg.author && typeof pkg.author === 'object' ? String(pkg.author.name ?? '') : '',
      url: pkg.homepage
        ? String(pkg.homepage)
        : pkg.repository && typeof pkg.repository === 'object'
          ? String(pkg.repository.url ?? '').replace(/^git\+?|\.git$/g, '')
          : '',
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const out: string[] = [
    '# Avisos de terceros',
    '',
    'PDF Studio se distribuye bajo la **Prosperity Public License 3.0.0**',
    '(ver `LICENSE.md`). Incorpora además los componentes de terceros que se listan',
    'abajo, cada uno bajo su propia licencia, todas permisivas. Sus avisos de',
    'copyright se reproducen íntegros, como exigen esas licencias al redistribuir el',
    'código: empaquetar la aplicación los borraría, así que se recogen aquí.',
    '',
    `Generado desde las dependencias instaladas el ${today} con \`npm run notices\`.`,
    'Si cambian las dependencias, vuelve a ejecutarlo.',
    '',
    '## Resumen',
    '',
    '| Componente | Versión | Licencia |',
    '|---|---|---|',
    ...entries.map(e =>
      `| \`${e.name}\`${e.nodeOnly ? ' ¹' : ''} | ${e.version} | ${e.license} |`),
    '',
    '¹ Solo se ejecuta en Node; su código no llega al navegador. Se incluye porque',
    'npm lo instala como dependencia. Sus binarios precompilados por plataforma',
    '(`@napi-rs/canvas-*`) se distribuyen bajo la misma licencia y no se listan por',
    'separado, ya que solo se instala el correspondiente a cada máquina.',
    '',
    '---',
    '',
  ]

  for (const e of entries) {
    out.push(`## ${e.name} ${e.version}`, '', `Licencia: **${e.license}**`)
    if (e.author) out.push('', `Autoría declarada: ${e.author}`)
    if (e.url) out.push('', `Origen: ${e.url}`)
    out.push('')

    if (e.text) {
      out.push('```', e.text, '```', '')
      continue
    }

    out.push(
      `_El paquete no distribuye fichero de licencia propio; declara \`${e.license}\` en`,
      'su `package.json`, por lo que son de aplicación los términos estándar de esa',
      'licencia con la autoría indicada arriba._',
      '',
    )
    const embedded = embeddedNotices(join('node_modules', ...e.name.split('/')))
    if (embedded.length) {
      out.push(
        'Su código distribuido incorpora además obra de terceros, cuyos avisos de',
        'copyright aparecen dentro del propio paquete:',
        '',
        ...embedded.map(c => `- ${c}`),
        '',
      )
    }
  }

  writeFileSync('THIRD-PARTY-NOTICES.md', out.join('\n'))
  const missing = entries.filter(e => !e.text).map(e => e.name)
  console.log(`${entries.length} componentes escritos en THIRD-PARTY-NOTICES.md`)
  if (missing.length) console.log(`Sin fichero de licencia propio: ${missing.join(', ')}`)
}

main()
