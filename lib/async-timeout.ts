// Unlike a fetch-only AbortSignal, this covers queues, response bodies and all
// other async work. Always clears the timer when the operation settles.
export function withTimeout<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Lookup timed out')), milliseconds);
    work.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
