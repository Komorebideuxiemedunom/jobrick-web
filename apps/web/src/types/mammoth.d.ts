/**
 * mammoth publie un build navigateur sans declaration de types : on decrit
 * ici la seule fonction qu'on utilise.
 */
declare module "mammoth/mammoth.browser.js" {
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer
  }): Promise<{ value: string; messages: ReadonlyArray<unknown> }>
}
