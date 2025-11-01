import { defineEventHandler, createError } from 'h3'
import { generateClient } from 'aws-amplify/data/server'
import type { Schema } from '~~/amplify/data/resource'
import { amplifyConfig, runAmplifyApi } from '~~/server/utils/amplify'
import { collectErrors, toHttpError } from '~~/server/api/utils/api-error'
import { resolveServerAuth } from '~~/server/api/utils/auth-mode'
import { assertOwnership } from '~~/server/api/utils/ownership'

type PostModel = Schema['Post']['type']

type ModelResponse<T> = {
  data?: T | null
  errors?: { message?: string }[]
}

const client = generateClient<Schema>({ config: amplifyConfig })

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Post id is required' })
  }

  const { amplifyAuthMode, authToken, userSub } = await resolveServerAuth(event, {
    requireToken: true,
    defaultAuthMode: 'userPool',
  })

  const authContext = authToken
    ? { authMode: amplifyAuthMode, authToken }
    : { authMode: amplifyAuthMode }

  let existing: ModelResponse<PostModel>
  try {
    existing = await runAmplifyApi(event, context =>
      client.models.Post.get(
        context,
        { id },
        authContext,
      ),
    ) as ModelResponse<PostModel>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('[Posts] Failed to load post for deletion', error)
    throw toHttpError(message, { statusCode: 500, statusMessage: 'Failed to load post' })
  }

  const existingErrors = collectErrors(existing)
  if (existingErrors) {
    throw toHttpError(existingErrors, { statusCode: 500, statusMessage: 'Failed to load post' })
  }

  const post = existing.data
  if (!post) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  assertOwnership(post.owner, userSub)

  let deleted: ModelResponse<PostModel>
  try {
    deleted = await runAmplifyApi(event, context =>
      client.models.Post.delete(
        context,
        { id },
        authContext,
      ),
    ) as ModelResponse<PostModel>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('[Posts] Failed to delete post', error)
    throw toHttpError(message, { statusCode: 500, statusMessage: 'Failed to delete post' })
  }

  const deleteErrors = collectErrors(deleted)
  if (deleteErrors) {
    throw toHttpError(deleteErrors, { statusCode: 500, statusMessage: 'Failed to delete post' })
  }

  return deleted.data ?? null
})
