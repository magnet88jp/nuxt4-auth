import { defineEventHandler, readBody, createError } from 'h3'
import { object, safeParse } from 'valibot'
import { generateClient } from 'aws-amplify/data/server'
import type { Schema } from '~~/amplify/data/resource'
import { amplifyConfig, runAmplifyApi } from '~~/server/utils/amplify'
import { collectErrors, toHttpError } from '~~/server/api/utils/api-error'
import { resolveServerAuth } from '~~/server/api/utils/auth-mode'
import { assertOwnership } from '~~/server/api/utils/ownership'
import { contentSchema, displayNameSchema } from '~~/server/api/utils/post-schema'

type PostModel = Schema['Post']['type']

type ModelResponse<T> = {
  data?: T | null
  errors?: { message?: string }[]
}

const client = generateClient<Schema>({ config: amplifyConfig })

const updatePostSchema = object({
  content: contentSchema,
  displayName: displayNameSchema,
})

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Post id is required' })
  }

  const parsed = safeParse(updatePostSchema, await readBody(event))
  if (!parsed.success) {
    const message = parsed.issues[0]?.message ?? 'Invalid request body'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  const { content, displayName } = parsed.output

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
    console.error('[Posts] Failed to load post', error)
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

  let updated: ModelResponse<PostModel>
  try {
    updated = await runAmplifyApi(event, context =>
      client.models.Post.update(
        context,
        {
          id,
          content,
          displayName,
        },
        authContext,
      ),
    ) as ModelResponse<PostModel>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('[Posts] Failed to update post', error)
    throw toHttpError(message, { statusCode: 500, statusMessage: 'Failed to update post' })
  }

  const updateErrors = collectErrors(updated)
  if (updateErrors) {
    throw toHttpError(updateErrors, { statusCode: 500, statusMessage: 'Failed to update post' })
  }

  if (!updated.data) {
    throw createError({ statusCode: 500, statusMessage: 'Post update failed unexpectedly' })
  }

  return updated.data
})
