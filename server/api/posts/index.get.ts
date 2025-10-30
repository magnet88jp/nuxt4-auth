import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { generateClient } from 'aws-amplify/data/server'
import type { Schema } from '~~/amplify/data/resource'
import { amplifyConfig, runAmplifyApi } from '~~/server/utils/amplify'
import { extractBearerToken, getCognitoConfig, verifyToken } from '~~/server/utils/cognito'

type PostModel = Schema['Post']['type']
type AuthMode = 'userPool' | 'identityPool' | 'iam' | 'apiKey'

type ModelResponse<T> = {
  data?: T[] | null
  errors?: { message?: string }[]
}

const client = generateClient<Schema>({ config: amplifyConfig })
const allowedAuthModes: AuthMode[] = ['userPool', 'identityPool', 'iam', 'apiKey']

function collectErrors(response?: ModelResponse<unknown>) {
  return response?.errors?.map(entry => entry?.message).filter(Boolean).join('; ')
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const authModeParam = typeof query.authMode === 'string' ? query.authMode : undefined
  const hasExplicitAuthMode = !!authModeParam
  const requestedAuthMode = allowedAuthModes.includes(authModeParam as AuthMode)
    ? authModeParam as AuthMode
    : undefined

  if (hasExplicitAuthMode && !requestedAuthMode) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported auth mode' })
  }

  const token = extractBearerToken(getHeader(event, 'authorization'))
  let resolvedAuthMode = requestedAuthMode
  let authToken: string | undefined

  if (resolvedAuthMode === 'userPool' || (!resolvedAuthMode && token)) {
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

  const options: { authMode?: AuthMode, authToken?: string } = {}
  if (resolvedAuthMode) {
    options.authMode = resolvedAuthMode
  }
  if (resolvedAuthMode === 'userPool' && authToken) {
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
    console.error('[Posts] Failed to list posts', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load posts' })
  }

  const listErrors = collectErrors(result)
  if (listErrors) {
    const isForbidden = /not authorized|unauthorized|forbidden/i.test(listErrors)
    throw createError({ statusCode: isForbidden ? 403 : 500, statusMessage: listErrors })
  }

  return result.data ?? []
})
