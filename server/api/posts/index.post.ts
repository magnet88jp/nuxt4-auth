import { defineEventHandler, readBody, createError } from 'h3'
import { z } from 'zod'
import { generateClient } from 'aws-amplify/data/server'
import type { Schema } from '~~/amplify/data/resource'
import { amplifyConfig, runAmplifyApi } from '~~/server/utils/amplify'
import { collectErrors, toHttpError } from '~~/server/api/utils/api-error'
import { resolveServerAuth } from '~~/server/api/utils/auth-mode'
import { contentSchema, displayNameSchema } from '~~/server/api/utils/post-schema'

type PostModel = Schema['Post']['type']

type ModelResponse<T> = {
  data?: T | null
  errors?: { message?: string }[]
}

const client = generateClient<Schema>({ config: amplifyConfig })

const createPostSchema = z.object({
  content: contentSchema,
  displayName: displayNameSchema,
  authMode: z.enum(['userPool', 'identityPool', 'iam', 'apiKey']).optional(),
})

export default defineEventHandler(async (event) => {
  const parsed = createPostSchema.safeParse(await readBody(event))

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request body'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  const { content, displayName, authMode } = parsed.data

  const { amplifyAuthMode, authToken } = await resolveServerAuth(event, {
    requestedAuthMode: authMode,
    defaultAuthMode: 'identityPool',
  })

  const createArgs: { authMode: typeof amplifyAuthMode, authToken?: string } = {
    authMode: amplifyAuthMode,
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
          displayName,
        },
        createArgs,
      ),
    ) as ModelResponse<PostModel>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('[Posts] Failed to create post', error)
    throw toHttpError(message, { statusCode: 500, statusMessage: 'Failed to create post' })
  }

  const createErrors = collectErrors(created)
  if (createErrors) {
    console.error('[Posts] Create post returned errors', createErrors)
    throw toHttpError(createErrors, { statusCode: 500, statusMessage: 'Failed to create post' })
  }

  if (!created.data) {
    throw createError({ statusCode: 500, statusMessage: 'Post creation failed unexpectedly' })
  }

  return created.data
})
