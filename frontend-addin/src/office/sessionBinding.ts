import { API_BASE_URL } from '../api/client'

const PREZO_NAMESPACE = 'https://prezo.app/session-binding'

export type SessionBinding = {
  sessionId: string
  code?: string | null
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

const buildXml = ({ sessionId, code, apiBaseUrl, updatedAt }: SessionBinding) => {
  const safeSession = escapeXml(sessionId)
  const safeCode = code ? `<code>${escapeXml(code)}</code>` : ''
  const safeApiBase = apiBaseUrl
    ? `<apiBaseUrl>${escapeXml(apiBaseUrl)}</apiBaseUrl>`
    : ''
  const safeUpdated = updatedAt ? `<updatedAt>${escapeXml(updatedAt)}</updatedAt>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<prezo xmlns="${PREZO_NAMESPACE}">
  <sessionId>${safeSession}</sessionId>
  ${safeCode}
  ${safeApiBase}
  ${safeUpdated}
</prezo>`
}

const parseXml = (xml: string): SessionBinding | null => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const sessionNode = doc.getElementsByTagNameNS(PREZO_NAMESPACE, 'sessionId')[0]
  if (!sessionNode?.textContent) {
    return null
  }
  const codeNode = doc.getElementsByTagNameNS(PREZO_NAMESPACE, 'code')[0]
  const apiBaseNode = doc.getElementsByTagNameNS(PREZO_NAMESPACE, 'apiBaseUrl')[0]
  const updatedNode = doc.getElementsByTagNameNS(PREZO_NAMESPACE, 'updatedAt')[0]
  return {
    sessionId: sessionNode.textContent,
    code: codeNode?.textContent ?? null,
    apiBaseUrl: apiBaseNode?.textContent ?? undefined,
    updatedAt: updatedNode?.textContent ?? undefined
  }
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
      PREZO_NAMESPACE,
      (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value ?? [])
        } else {
          reject(result.error)
        }
      }
    )
  })

const getCommonXml = (part: Office.CustomXmlPart) =>
  new Promise<string>((resolve, reject) => {
    part.getXmlAsync((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve(result.value)
      } else {
        reject(result.error)
      }
    })
  })

const setCommonXml = (part: Office.CustomXmlPart, xml: string) =>
  new Promise<void>((resolve, reject) => {
    const partWithSet = part as Office.CustomXmlPart & {
      setXmlAsync?: (xml: string, callback?: (result: Office.AsyncResult<void>) => void) => void
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

export async function writeSessionBinding(binding: SessionBinding): Promise<void> {
  const xml = buildXml({
    ...binding,
    apiBaseUrl: binding.apiBaseUrl ?? API_BASE_URL,
    updatedAt: binding.updatedAt ?? new Date().toISOString()
  })

  if (hasPowerPointCustomXmlParts()) {
    try {
      await PowerPoint.run(async (context) => {
        const parts = context.presentation.customXmlParts.getByNamespace(PREZO_NAMESPACE)
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
      console.warn('Failed to persist Prezo session binding via PowerPoint API', error)
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
    console.warn('Failed to persist Prezo session binding', error)
  }
}

export async function readSessionBinding(): Promise<SessionBinding | null> {
  if (hasPowerPointCustomXmlParts()) {
    try {
      const xml = await PowerPoint.run(async (context) => {
        const parts = context.presentation.customXmlParts.getByNamespace(PREZO_NAMESPACE)
        parts.load('items')
        await context.sync()
        if (parts.items.length === 0) {
          return null
        }
        const xmlResult = parts.items[0].getXml()
        await context.sync()
        return xmlResult.value
      })
      return xml ? parseXml(xml) : null
    } catch (error) {
      console.warn('Failed to read Prezo session binding via PowerPoint API', error)
    }
  }

  if (!hasCommonCustomXmlParts()) {
    return null
  }
  try {
    const parts = await getCommonPartsByNamespace()
    if (parts.length === 0) {
      return null
    }
    const xml = await getCommonXml(parts[0])
    return parseXml(xml)
  } catch (error) {
    console.warn('Failed to read Prezo session binding', error)
    return null
  }
}
