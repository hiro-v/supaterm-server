export async function readFile(_path: string): Promise<never> {
  throw new Error('fs/promises is not available in the browser build');
}
