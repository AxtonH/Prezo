import { PrezoLogo } from './PrezoLogo'

/** Shown while auth + profile resolve; avoids a bare “Loading…” flash. */
export function HostConsoleBootstrap() {
  return (
    <div
      className="min-h-screen w-full bg-white flex flex-col items-center justify-center gap-4"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="animate-pulse">
        <PrezoLogo size={40} decorative />
      </div>
      <span className="sr-only">Loading workspace</span>
    </div>
  )
}
