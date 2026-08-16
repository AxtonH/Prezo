/**
 * Serializes every `PowerPoint.run` batch for this task pane.
 * Win32 PowerPoint often returns `RichApi.GeneralException` when multiple batches overlap
 * (e.g. Q&A refresh, poll refresh, and bind tags racing on the same user action).
 */
let runTail: Promise<unknown> = Promise.resolve()

export async function runPowerPoint<T>(
  batch: (context: PowerPoint.RequestContext) => Promise<T>
): Promise<T> {
  const job = runTail.then(() => PowerPoint.run(batch))
  runTail = job.then(
    () => undefined,
    () => undefined
  )
  return job
}
