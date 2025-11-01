import { defineEventHandler, readBody, getHeader, createError } from 'h3'
import { generateClient } from 'aws-amplify/data/server'
import type { Schema } from '~~/amplify/data/resource'
import { amplifyConfig, runAmplifyApi } from '~~/server/utils/amplify'
import { extractBearerToken, getCognitoConfig, verifyToken } from '~~/server/utils/cognito'

type PostModel = Schema['Post']['type']
type RequestAuthMode = 'userPool' | 'identityPool' | 'iam' | 'apiKey'
type ClientAuthMode = 'userPool' | 'iam' | 'apiKey'

type ModelResponse<T> = {
  data?: T | null
  errors?: { message?: string }[]
}

type CreatePostBody = {
  content?: string
  displayName?: string | null
  authMode?: RequestAuthMode
}

const client = generateClient<Schema>({ config: amplifyConfig })
const allowedAuthModes: RequestAuthMode[] = ['userPool', 'identityPool', 'iam', 'apiKey']

function collectErrors(response?: ModelResponse<unknown>) {
  return response?.errors?.map(entry => entry?.message).filter(Boolean).join('; ')
}

function deriveError(message: string) {
  if (/missing bearer token|no current user|no federated jwt|token subject is missing/i.test(message)) {
    return { statusCode: 401, statusMessage: 'Unauthorized' }
  }
  if (/not authorized|unauthorized|forbidden/i.test(message)) {
    return { statusCode: 403, statusMessage: 'Forbidden' }
  }
  return { statusCode: 500, statusMessage: 'Failed to create post' }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreatePostBody>(event)

  const content = (body?.content ?? '').trim()
  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'content is required' })
  }

  const displayNameInput = body?.displayName
  const displayName = typeof displayNameInput === 'string' ? displayNameInput.trim() : displayNameInput ?? null
  const normalizedDisplayName = displayName === '' ? null : displayName

  const rawAuthMode = typeof body?.authMode === 'string' ? body.authMode : undefined
  const requestedAuthMode = rawAuthMode && allowedAuthModes.includes(rawAuthMode)
    ? rawAuthMode as RequestAuthMode
    : undefined

  if (rawAuthMode && !requestedAuthMode) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported auth mode' })
  }

  const token = extractBearerToken(getHeader(event, 'authorization'))
  let resolvedAuthMode = requestedAuthMode
  let authToken: string | undefined

  if (token) {
    getCognitoConfig()

    const payload = await verifyToken(token)
    const userSub = typeof payload.sub === 'string' ? payload.sub : null
    if (!userSub) {
      throw createError({ statusCode: 401, statusMessage: 'Token subject is missing' })
    }

    resolvedAuthMode = 'userPool'
    authToken = token
  }
  else if (requestedAuthMode === 'userPool') {
    throw createError({ statusCode: 401, statusMessage: 'Missing bearer token' })
  }

  if (!resolvedAuthMode) {
    resolvedAuthMode = 'identityPool'
  }

  const amplifyAuthMode: ClientAuthMode = resolvedAuthMode === 'identityPool' || resolvedAuthMode === 'iam'
    ? 'iam'
    : resolvedAuthMode

  const createArgs: { authMode?: ClientAuthMode, authToken?: string } = {}
  if (amplifyAuthMode) {
    createArgs.authMode = amplifyAuthMode
  }
  if (amplifyAuthMode === 'userPool' && authToken) {
    createArgs.authToken = authToken
  }

  let created: ModelResponse<PostModel>
  try {
    created = await runAmplifyApi(event, context =>
      client.models.Post.create(
        context,
        {
          content,
          displayName: normalizedDisplayName,
        },
        Object.keys(createArgs).length ? createArgs : undefined,
      ),
    ) as ModelResponse<PostModel>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('[Posts] Failed to create post', error)
    throw createError(deriveError(message))
  }

  const createErrors = collectErrors(created)
  if (createErrors) {
    console.error('[Posts] Create post returned errors', createErrors)
    throw createError(deriveError(createErrors))
  }

  if (!created.data) {
    throw createError({ statusCode: 500, statusMessage: 'Post creation failed unexpectedly' })
  }

  return created.data
})
