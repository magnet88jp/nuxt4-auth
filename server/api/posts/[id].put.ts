import { defineEventHandler, readBody, getHeader, createError } from 'h3'
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

  const body = await readBody<{ content?: string, displayName?: string | null }>(event)
  const content = (body?.content ?? '').trim()
  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'content is required' })
  }

  const displayNameInput = body?.displayName
  const displayName = typeof displayNameInput === 'string' ? displayNameInput.trim() : displayNameInput ?? null
  const normalizedDisplayName = displayName === '' ? null : displayName

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
    updated = await runAmplifyApi(event, context =>
      client.models.Post.update(
        context,
        {
          id,
          content,
          displayName: normalizedDisplayName,
        },
        { authMode: 'userPool', authToken: token },
      ),
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
