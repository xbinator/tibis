export async function asyncTo<T>(promise: Promise<T>): Promise<[Error] | [undefined, T]> {
  try {
    return [undefined, await promise];
  } catch (error) {
    return [error as Error];
  }
}
