// Compiles the shell and packs it into release/win-unpacked with electron-builder.
// Code signing is read by electron-builder from the environment (CSC_LINK, CSC_KEY_PASSWORD); nothing here sets it.
import { cp, rm } from 'node:fs/promises'
import { join } from 'node:path'

const root = import.meta.dir
const dist = join(root, 'dist')

async function bundle(entry: string, format: 'esm' | 'cjs'): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(root, 'src', entry)],
    outdir: dist,
    target: 'node',
    format,
    // The packaged app already carries electron; it must never be bundled into the file.
    external: ['electron'],
    naming: '[name].js',
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error(`Bundling ${entry} failed`)
  }
}

await rm(dist, { recursive: true, force: true })
// main is ESM (it finds its sibling files through import.meta.url). A sandboxed preload cannot be ESM, so it is CJS.
await bundle('main.ts', 'esm')
await bundle('preload.ts', 'cjs')
await cp(join(root, 'src', 'wait-page.html'), join(dist, 'wait-page.html'))

const builder = Bun.spawn(
  ['bunx', 'electron-builder', '--config', 'electron-builder.json', '--win', 'dir', '--x64', '--publish', 'never'],
  { cwd: root, stdout: 'inherit', stderr: 'inherit' },
)
process.exit(await builder.exited)
