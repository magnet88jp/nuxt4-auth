import { defineEventHandler, getHeader, createError } from 'h3'
import { generateClient } from 'aws-amplify/data/server'
import type { Schema } from '~~/amplify/data/resource'
import { amplifyConfig, runAmplifyApi } from '~~/server/utils/amplify'
import { extractBearerToken, getCognitoConfig, verifyToken } from '~~/server/utils/cognito'

type PostModel = Schema['Post']['type']

type ModelResponse<T> = {
  data?: T | null
  errors?: { message?: string }[]
}

const client = generateClient<Schema>({ config: amplifyConfig })

function collectErrors(response?: ModelResponse<unknown>) {
  return response?.errors?.map(entry => entry?.message).filter(Boolean).join('; ')
}

function deriveError(message: string) {
  if (/not authorized|unauthorized|forbidden/i.test(message)) {
    return { statusCode: 403, statusMessage: 'Forbidden' }
  }
  return { statusCode: 500, statusMessage: 'Failed to delete post' }
}

export default defineEventHandler(async (event) => {
  getCognitoConfig()

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

  let existing: ModelResponse<PostModel>
  try {
    existing = await runAmplifyApi(event, context =>
      client.models.Post.get(
        context,
        { id },
        { authMode: 'userPool', authToken: token },
      ),
    ) as ModelResponse<PostModel>
  }
  catch (error) {
    console.error('[Posts] Failed to load post for deletion', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load post' })
  }

  const existingErrors = collectErrors(existing)
  if (existingErrors) {
    throw createError(deriveError(existingErrors))
  }

  const post = existing.data
  if (!post) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  if (post.owner && post.owner !== userSub) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  let deleted: ModelResponse<PostModel>
  try {
    deleted = await runAmplifyApi(event, context =>
      client.models.Post.delete(
        context,
        { id },
        { authMode: 'userPool', authToken: token },
      ),
    ) as ModelResponse<PostModel>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('[Posts] Failed to delete post', error)
    throw createError(deriveError(message))
  }

  const deleteErrors = collectErrors(deleted)
  if (deleteErrors) {
    throw createError(deriveError(deleteErrors))
  }

  return deleted.data ?? null
})
