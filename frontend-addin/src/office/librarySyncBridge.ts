import { API_BASE_URL } from '../api/client'

const PREZO_LIBRARY_SYNC_NAMESPACE = 'https://prezo.app/library-sync'

export type LibrarySyncBridge = {
  token: string
  expiresAt: string
  apiBaseUrl?: string
  updatedAt?: string
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const buildXml = ({ token, expiresAt, apiBaseUrl, updatedAt }: LibrarySyncBridge) => {
  const safeToken = token ? `<token>${escapeXml(token)}</token>` : ''
  const safeExpiresAt = expiresAt ? `<expiresAt>${escapeXml(expiresAt)}</expiresAt>` : ''
  const safeApiBase = apiBaseUrl ? `<apiBaseUrl>${escapeXml(apiBaseUrl)}</apiBaseUrl>` : ''
  const safeUpdatedAt = updatedAt ? `<updatedAt>${escapeXml(updatedAt)}</updatedAt>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<prezoLibrarySync xmlns="${PREZO_LIBRARY_SYNC_NAMESPACE}">
  ${safeToken}
  ${safeExpiresAt}
  ${safeApiBase}
  ${safeUpdatedAt}
</prezoLibrarySync>`
}

const hasCommonCustomXmlParts = () =>
  typeof Office !== 'undefined' && Boolean(Office.context?.document?.customXmlParts)

const hasPowerPointCustomXmlParts = () =>
  typeof PowerPoint !== 'undefined' && typeof PowerPoint.run === 'function'

const getCommonPartsByNamespace = () =>
  new Promise<Office.CustomXmlPart[]>((resolve, reject) => {
    if (!hasCommonCustomXmlParts()) {
      resolve([])
      return
    }
    Office.context.document.customXmlParts.getByNamespaceAsync(
      PREZO_LIBRARY_SYNC_NAMESPACE,
      (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value ?? [])
        } else {
          reject(result.error)
        }
      }
    )
  })

const setCommonXml = (part: Office.CustomXmlPart, xml: string) =>
  new Promise<void>((resolve, reject) => {
    const partWithSet = part as Office.CustomXmlPart & {
      setXmlAsync?: (nextXml: string, callback?: (result: Office.AsyncResult<void>) => void) => void
    }
    if (!partWithSet.setXmlAsync) {
      reject(new Error('CustomXmlPart.setXmlAsync is not available.'))
      return
    }
    partWithSet.setXmlAsync(xml, (result: Office.AsyncResult<void>) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve()
      } else {
        reject(result.error)
      }
    })
  })

const addCommonXml = (xml: string) =>
  new Promise<void>((resolve, reject) => {
    if (!hasCommonCustomXmlParts()) {
      resolve()
      return
    }
    Office.context.document.customXmlParts.addAsync(xml, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve()
      } else {
        reject(result.error)
      }
    })
  })

async function writeXml(xml: string): Promise<void> {
  if (hasPowerPointCustomXmlParts()) {
    try {
      await PowerPoint.run(async (context) => {
        const parts = context.presentation.customXmlParts.getByNamespace(
          PREZO_LIBRARY_SYNC_NAMESPACE
        )
        parts.load('items')
        await context.sync()
        if (parts.items.length > 0) {
          parts.items[0].setXml(xml)
        } else {
          context.presentation.customXmlParts.add(xml)
        }
        await context.sync()
      })
      return
    } catch (error) {
      console.warn('Failed to persist Prezo library sync bridge via PowerPoint API', error)
    }
  }

  if (!hasCommonCustomXmlParts()) {
    return
  }
  try {
    const parts = await getCommonPartsByNamespace()
    if (parts.length > 0) {
      await setCommonXml(parts[0], xml)
    } else {
      await addCommonXml(xml)
    }
  } catch (error) {
    console.warn('Failed to persist Prezo library sync bridge', error)
  }
}

export async function writeLibrarySyncBridge(binding: LibrarySyncBridge): Promise<void> {
  await writeXml(
    buildXml({
      ...binding,
      apiBaseUrl: binding.apiBaseUrl ?? API_BASE_URL,
      updatedAt: binding.updatedAt ?? new Date().toISOString()
    })
  )
}

export async function clearLibrarySyncBridge(): Promise<void> {
  await writeXml(
    buildXml({
      token: '',
      expiresAt: '',
      apiBaseUrl: API_BASE_URL,
      updatedAt: new Date().toISOString()
    })
  )
}
