type PasswordQualityEntry = string | Record<string, number>

type PasswordQualityPayload = {
  passwordquality?: PasswordQualityEntry[]
}

const QUALITY_KEYS = new Set([
  'useafewwordsavoidcommonphrases',
  'noneedforsymbolsdigitsoruppercaseletters',
  'addanotherwordortwo',
  'capitalizationdoesnthelpverymuch',
  'alluppercaseisalmostaseasytoguessasalllowercase',
  'reversedwordsarentmuchhardertoguess',
  'predictablesubstitutionsdonthelpverymuch',
  'usealongerkeyboardpatternwithmoreturns',
  'avoidrepeatedwordsandcharacters',
  'avoidsequences',
  'avoidrecentyears',
  'avoidyearsthatareassociatedwithyou',
  'avoiddatesandyearsthatareassociatedwithyou',
  'straightrowsofkeysareeasytoguess',
  'shortkeyboardpatternsareeasytoguess',
  'repeatslikeaaaareeasytoguess',
  'repeatslikeabcabcareonlyslightlyhardertoguess',
  'thisisatop10password',
  'thisisatop100password',
  'thisisacommonpassword',
  'thisissimilartoacommonlyusedpassword',
  'sequenceslikeabcareeasytoguess',
  'recentyearsareeasytoguess',
  'awordbyitselfiseasytoguess',
  'datesareofteneasytoguess',
  'namesandsurnamesbythemselvesareeasytoguess',
  'commonnamesandsurnamesareeasytoguess',
  'tooshort',
  'badlisted',
  'dontreusepasswords',
])

function parseQualityPayload(raw: string): PasswordQualityPayload | null {
  const jsonStart = raw.indexOf('{')
  if (jsonStart === -1) return null
  const jsonSlice = raw.slice(jsonStart)
  try {
    return JSON.parse(jsonSlice) as PasswordQualityPayload
  } catch {
    return null
  }
}

function normalizeKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

export function formatPasswordQualityError(
  error: Error,
  t: (key: string, args?: Record<string, unknown>) => string,
) {
  const payload = parseQualityPayload(error.message)
  if (!payload?.passwordquality || !Array.isArray(payload.passwordquality)) {
    return null
  }

  const messages: string[] = []

  payload.passwordquality.forEach((entry) => {
    if (typeof entry === 'string') {
      const key = normalizeKey(entry)
      if (QUALITY_KEYS.has(key)) {
        messages.push(t(`passwordQuality.${key}`))
      } else {
        messages.push(entry)
      }
      return
    }
    if (entry && typeof entry === 'object') {
      const [rawKey, rawValue] = Object.entries(entry)[0] ?? []
      if (!rawKey) return
      const key = normalizeKey(rawKey)
      if (key === 'tooshort') {
        messages.push(t('passwordQuality.tooshort', { min: rawValue }))
        return
      }
      if (QUALITY_KEYS.has(key)) {
        messages.push(t(`passwordQuality.${key}`))
      } else {
        messages.push(rawKey)
      }
    }
  })

  if (messages.length === 0) {
    return null
  }

  return t('passwordQuality.title', { details: messages.join('; ') })
}
