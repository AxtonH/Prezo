import { supabase } from './supabaseClient'

export interface HostProfile {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  onboarding_completed: boolean
}

function mapProfileRow(row: Record<string, unknown>): HostProfile {
  return {
    id: String(row.id),
    email: row.email != null ? String(row.email) : null,
    display_name: row.display_name != null ? String(row.display_name) : null,
    avatar_url: row.avatar_url != null ? String(row.avatar_url) : null,
    onboarding_completed: Boolean(row.onboarding_completed ?? true)
  }
}

/** Loads the signed-in user's row from `public.profiles`. */
export async function fetchHostProfile(): Promise<HostProfile | null> {
  const {
    data: { user },
    error: userErr
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, avatar_url, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.warn('fetchHostProfile', error.message)
    return {
      id: user.id,
      email: user.email ?? null,
      display_name: null,
      avatar_url: null,
      onboarding_completed: true
    }
  }

  if (!data) {
    return {
      id: user.id,
      email: user.email ?? null,
      display_name: null,
      avatar_url: null,
      onboarding_completed: true
    }
  }

  return mapProfileRow(data as Record<string, unknown>)
}

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const MAX_BYTES = 2 * 1024 * 1024

/** Saves display name, optional avatar upload, and marks onboarding complete. */
export async function completeHostOnboarding(
  displayName: string,
  avatarFile: File | null
): Promise<HostProfile> {
  const trimmed = displayName.trim()
  if (!trimmed) {
    throw new Error('Please enter your name')
  }

  const {
    data: { user },
    error: userErr
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    throw new Error('Not signed in')
  }

  let avatarUrl: string | null = null

  if (avatarFile && avatarFile.size > 0) {
    if (avatarFile.size > MAX_BYTES) {
      throw new Error('Image must be 2 MB or smaller')
    }
    const rawExt = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const ext = ALLOWED_EXT.has(rawExt) ? rawExt : 'jpg'
    const path = `${user.id}/avatar.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, avatarFile, {
        upsert: true,
        contentType: avatarFile.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`
      })

    if (uploadErr) {
      throw new Error(uploadErr.message)
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    avatarUrl = pub.publicUrl
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name: trimmed,
        avatar_url: avatarUrl,
        onboarding_completed: true
      },
      { onConflict: 'id' }
    )
    .select('id, email, display_name, avatar_url, onboarding_completed')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapProfileRow(data as Record<string, unknown>)
}

export type UpdateHostProfileInput = {
  displayName: string
  /** New image to upload; omit or null to keep existing photo unless `removeAvatar` is true. */
  avatarFile?: File | null
  /** When true, clears `avatar_url` in the database. */
  removeAvatar?: boolean
}

/** Updates profile name and/or avatar from the settings page (after onboarding). */
export async function updateHostProfile(
  input: UpdateHostProfileInput
): Promise<HostProfile> {
  const trimmed = input.displayName.trim()
  if (!trimmed) {
    throw new Error('Please enter your name')
  }

  const {
    data: { user },
    error: userErr
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    throw new Error('Not signed in')
  }

  const existing = await fetchHostProfile()
  if (!existing) {
    throw new Error('Not signed in')
  }
  let avatarUrl: string | null = existing.avatar_url

  if (input.removeAvatar) {
    avatarUrl = null
  } else if (input.avatarFile && input.avatarFile.size > 0) {
    if (input.avatarFile.size > MAX_BYTES) {
      throw new Error('Image must be 2 MB or smaller')
    }
    const rawExt = input.avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const ext = ALLOWED_EXT.has(rawExt) ? rawExt : 'jpg'
    const path = `${user.id}/avatar.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, input.avatarFile, {
        upsert: true,
        contentType:
          input.avatarFile.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`
      })

    if (uploadErr) {
      throw new Error(uploadErr.message)
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    avatarUrl = pub.publicUrl
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name: trimmed,
        avatar_url: avatarUrl,
        onboarding_completed: existing.onboarding_completed
      },
      { onConflict: 'id' }
    )
    .select('id, email, display_name, avatar_url, onboarding_completed')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapProfileRow(data as Record<string, unknown>)
}

/** Marks onboarding complete without changing name or avatar (sidebar stays “Host” / placeholder). */
export async function skipHostOnboarding(): Promise<HostProfile> {
  const {
    data: { user },
    error: userErr
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    throw new Error('Not signed in')
  }

  const existing = await fetchHostProfile()
  if (!existing) {
    throw new Error('Not signed in')
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name: existing.display_name,
        avatar_url: existing.avatar_url,
        onboarding_completed: true
      },
      { onConflict: 'id' }
    )
    .select('id, email, display_name, avatar_url, onboarding_completed')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapProfileRow(data as Record<string, unknown>)
}
