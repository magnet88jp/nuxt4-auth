import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { generateClient } from 'aws-amplify/data/server'
import type { Schema } from '~~/amplify/data/resource'
import { amplifyConfig, runAmplifyApi } from '~~/server/utils/amplify'
import { extractBearerToken, getCognitoConfig, verifyToken } from '~~/server/utils/cognito'

type PostModel = Schema['Post']['type']
type RequestAuthMode = 'userPool' | 'identityPool' | 'iam' | 'apiKey'
type ClientAuthMode = 'userPool' | 'iam' | 'apiKey'

type ModelResponse<T> = {
  data?: T[] | null
  errors?: { message?: string }[]
}

const client = generateClient<Schema>({ config: amplifyConfig })
const allowedAuthModes: RequestAuthMode[] = ['userPool', 'identityPool', 'iam', 'apiKey']

function collectErrors(response?: ModelResponse<unknown>) {
  return response?.errors?.map(entry => entry?.message).filter(Boolean).join('; ')
}

function deriveError(message: string) {
  if (/no current user|no federated jwt|missing bearer token/i.test(message)) {
    return { statusCode: 401, statusMessage: 'Unauthorized' }
  }
  if (/not authorized|unauthorized|forbidden/i.test(message)) {
    return { statusCode: 403, statusMessage: 'Forbidden' }
  }
  return { statusCode: 500, statusMessage: 'Failed to load posts' }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const authModeParam = typeof query.authMode === 'string' ? query.authMode : undefined
  const hasExplicitAuthMode = !!authModeParam
  const requestedAuthMode = allowedAuthModes.includes(authModeParam as RequestAuthMode)
    ? authModeParam as RequestAuthMode
    : undefined

  if (hasExplicitAuthMode && !requestedAuthMode) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported auth mode' })
  }

  const token = extractBearerToken(getHeader(event, 'authorization'))
  let resolvedAuthMode = requestedAuthMode
  let authToken: string | undefined

  if (resolvedAuthMode === 'userPool' || (resolvedAuthMode !== 'iam' && !resolvedAuthMode && token)) {
    getCognitoConfig()

    if (!token) {
      throw createError({ statusCode: 401, statusMessage: 'Missing bearer token' })
    }

    const payload = await verifyToken(token)
    const userSub = typeof payload.sub === 'string' ? payload.sub : null
    if (!userSub) {
      throw createError({ statusCode: 401, statusMessage: 'Token subject is missing' })
    }

    resolvedAuthMode = 'userPool'
    authToken = token
  }

  if (!resolvedAuthMode) {
    resolvedAuthMode = hasExplicitAuthMode ? requestedAuthMode : 'identityPool'
  }

  const amplifyAuthMode: ClientAuthMode | undefined = resolvedAuthMode === 'identityPool' ? 'iam' : resolvedAuthMode

  const options: { authMode?: ClientAuthMode, authToken?: string } = {}
  if (amplifyAuthMode) {
    options.authMode = amplifyAuthMode
  }
  if (amplifyAuthMode === 'userPool' && authToken) {
    options.authToken = authToken
  }

  let result: ModelResponse<PostModel>
  try {
    result = await runAmplifyApi(event, context =>
      client.models.Post.list(
        context,
        undefined,
        options,
      ),
    ) as ModelResponse<PostModel>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('[Posts] Failed to list posts', error)
    throw createError(deriveError(message))
  }

  const listErrors = collectErrors(result)
  if (listErrors) {
    console.error('[Posts] List posts returned errors', listErrors)
    throw createError(deriveError(listErrors))
  }

  return result.data ?? []
})
