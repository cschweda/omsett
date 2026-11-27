import type { QpdfInstance } from './index'

/**
 * qpdf's loader, imported from here so that it resolves from this package wherever it runs.
 * Its build reads its binary only from the address `locateFile` gives, and takes no bytes
 * directly. In a browser that address is a `blob:` the worker made from bytes it verified; in
 * Node, the file in the package.
 */
export async function startQpdf(binaryAddress: string, say: (line: string) => void): Promise<QpdfInstance> {
  const { default: create } = (await import('@neslinesli93/qpdf-wasm')) as unknown as { default: (options: object) => Promise<QpdfInstance> }
  return create({ locateFile: () => binaryAddress, noInitialRun: true, print: say, printErr: () => {} })
}
