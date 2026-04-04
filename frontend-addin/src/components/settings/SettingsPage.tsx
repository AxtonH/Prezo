import type { HostProfile } from '../../auth/profile'
import { AccountSupportCard } from './AccountSupportCard'
import { ProfileSettingsPanel } from './ProfileSettingsPanel'
import { SettingsSection } from './SettingsSection'

export type SettingsPageProps = {
  profile: HostProfile
  onBack: () => void
  onProfileSaved: (next: HostProfile) => void
  onSignOut: () => void
}

/**
 * Full-page host settings: profile, account identifiers, sign out. Keeps layout consistent with the host console shell.
 */
export function SettingsPage({
  profile,
  onBack,
  onProfileSaved,
  onSignOut
}: SettingsPageProps) {
  return (
    <div className="max-w-5xl mx-auto pb-16 px-1 sm:px-0">
      <div className="mb-10">
        <button
          type="button"
          onClick={onBack}
          className="!inline-flex !items-center !gap-2 !text-sm !font-semibold !text-primary hover:!text-primary-dark !bg-transparent !border-0 !p-0 !shadow-none !mb-4"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
          Back to workspace
        </button>
        <h1 className="text-[2rem] font-extrabold tracking-tight text-slate-900 mb-2">
          Settings
        </h1>
        <p className="text-muted text-sm max-w-xl leading-relaxed">
          Manage how you appear in Prezo and find account details when you need help.
        </p>
      </div>

      <div className="space-y-6">
        <ProfileSettingsPanel profile={profile} onProfileSaved={onProfileSaved} />

        <SettingsSection
          id="account"
          icon="badge"
          title="Account"
          description="Identifiers for your workspace. Email comes from your sign-in provider."
        >
          <AccountSupportCard userId={profile.id} />
        </SettingsSection>

        <SettingsSection
          id="sign-out"
          icon="logout"
          title="Session"
          description="Sign out on this device when you are done or on a shared computer."
        >
          <button
            type="button"
            onClick={onSignOut}
            className="!inline-flex !items-center !gap-2 !px-4 !py-2.5 !rounded-xl !text-sm !font-semibold !border !border-slate-200 !bg-white !text-slate-800 hover:!border-danger hover:!text-danger !transition-colors !shadow-none"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Sign out
          </button>
        </SettingsSection>
      </div>
    </div>
  )
}
