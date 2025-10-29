import { defineEventHandler, readBody, getHeader, createError } from 'h3'
import { Amplify } from 'aws-amplify'
import { generateClient } from 'aws-amplify/data'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import outputs from '~~/amplify_outputs.json' assert { type: 'json' }
import type { Schema } from '~~/amplify/data/resource'

type AmplifyOutputs = typeof outputs

type CognitoConfig = {
  userPoolId?: string
  clientId?: string
  region?: string
}

type VerifyPayload = {
  sub?: string
  [key: string]: unknown
}

type PostModel = Schema['Post']['type']

type ModelResponse<T> = {
  data?: T | null
  errors?: { message?: string }[]
}

const cognitoConfig: CognitoConfig = {
  userPoolId: (outputs as AmplifyOutputs).auth?.user_pool_id,
  clientId: (outputs as AmplifyOutputs).auth?.user_pool_client_id,
  region: (outputs as AmplifyOutputs).auth?.aws_region,
}

const appSyncUrl = (outputs as AmplifyOutputs).data?.url

let amplifyConfigured = false
let cachedAccessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null
let cachedIdVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null

function ensureAmplifyConfigured() {
  if (amplifyConfigured) return

  Amplify.configure(outputs as AmplifyOutputs, { ssr: true })
  amplifyConfigured = true
}

function extractBearerToken(header?: string | null) {
  if (!header) return null

  const [type, token] = header.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !token) return null

  return token
}

async function verifyToken(token: string): Promise<VerifyPayload> {
  const { userPoolId, clientId, region } = cognitoConfig
  if (!userPoolId || !clientId) {
    throw createError({ statusCode: 500, statusMessage: 'Cognito configuration is missing' })
  }

  if (!cachedAccessVerifier) {
    cachedAccessVerifier = CognitoJwtVerifier.create({
      userPoolId,
      clientId,
      region,
      tokenUse: 'access',
    })
  }

  try {
    return await cachedAccessVerifier.verify(token)
  }
  catch {
    if (!cachedIdVerifier) {
      cachedIdVerifier = CognitoJwtVerifier.create({
        userPoolId,
        clientId,
        region,
        tokenUse: 'id',
      })
    }

    try {
      return await cachedIdVerifier.verify(token)
    }
    catch {
      throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
    }
  }
}

function collectErrors(response?: ModelResponse<unknown>) {
  return response?.errors?.map(entry => entry?.message).filter(Boolean).join('; ')
}

export default defineEventHandler(async event => {
  if (!cognitoConfig.userPoolId || !cognitoConfig.clientId) {
    throw createError({ statusCode: 500, statusMessage: 'Cognito configuration is missing' })
  }

  if (!appSyncUrl) {
    throw createError({ statusCode: 500, statusMessage: 'AppSync endpoint is missing' })
  }

  const token = extractBearerToken(getHeader(event, 'authorization'))
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing bearer token' })
  }

  const payload = await verifyToken(token)
  const userSub = typeof payload.sub === 'string' ? payload.sub : null
  if (!userSub) {
    throw createError({ statusCode: 401, statusMessage: 'Token subject is missing' })
  }

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Post id is required' })
  }

  const body = await readBody<{ content?: string; displayName?: string | null }>(event)
  const content = (body?.content ?? '').trim()
  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'content is required' })
  }

  const displayNameInput = body?.displayName
  const displayName = typeof displayNameInput === 'string' ? displayNameInput.trim() : displayNameInput ?? null
  const normalizedDisplayName = displayName === '' ? null : displayName

  ensureAmplifyConfigured()

  const client = generateClient<Schema>({
    authMode: 'userPool',
    authToken: token,
  } as any)

  const authOptions = {
    authMode: 'userPool' as const,
    authToken: token,
  }

  let existing: ModelResponse<PostModel>
  try {
    existing = await client.models.Post.get({ id }, authOptions) as ModelResponse<PostModel>
  }
  catch (error) {
    console.error('[Posts] Failed to load post', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load post' })
  }

  const existingErrors = collectErrors(existing)
  if (existingErrors) {
    throw createError({ statusCode: 500, statusMessage: existingErrors })
  }

  const post = existing.data
  if (!post) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  if (post.owner && post.owner !== userSub) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  let updated: ModelResponse<PostModel>
  try {
    updated = await client.models.Post.update(
      {
        id,
        content,
        displayName: normalizedDisplayName,
      },
      authOptions,
    ) as ModelResponse<PostModel>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update post'
    const isForbidden = /not authorized|unauthorized|forbidden/i.test(message)
    console.error('[Posts] Failed to update post', error)
    throw createError({ statusCode: isForbidden ? 403 : 500, statusMessage: isForbidden ? 'Forbidden' : 'Failed to update post' })
  }

  const updateErrors = collectErrors(updated)
  if (updateErrors) {
    const isForbidden = /not authorized|unauthorized|forbidden/i.test(updateErrors)
    throw createError({ statusCode: isForbidden ? 403 : 500, statusMessage: updateErrors })
  }

  if (!updated.data) {
    throw createError({ statusCode: 500, statusMessage: 'Post update failed unexpectedly' })
  }

  return updated.data
})
