import { defineEventHandler, getQuery, createError } from 'h3'
import { generateClient } from 'aws-amplify/data/server'
import type { Schema } from '~~/amplify/data/resource'
import { amplifyConfig, runAmplifyApi } from '~~/server/utils/amplify'
import { collectErrors, toHttpError } from '~~/server/api/utils/api-error'
import { parseRequestAuthMode, resolveServerAuth } from '~~/server/api/utils/auth-mode'
import type { ClientAuthMode } from '~~/server/api/utils/auth-mode'

type PostModel = Schema['Post']['type']

type ModelResponse<T> = {
  data?: T[] | null
  errors?: { message?: string }[]
}

const client = generateClient<Schema>({ config: amplifyConfig })

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawAuthMode = typeof query.authMode === 'string' ? query.authMode : undefined
  const hasExplicitAuthMode = !!rawAuthMode
  const requestedAuthMode = parseRequestAuthMode(rawAuthMode)

  if (hasExplicitAuthMode && !requestedAuthMode) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported auth mode' })
  }

  const defaultAuthMode = hasExplicitAuthMode && requestedAuthMode ? requestedAuthMode : 'identityPool'

  const { amplifyAuthMode, authToken } = await resolveServerAuth(event, {
    requestedAuthMode,
    defaultAuthMode,
  })

  const listArgs: { authMode: ClientAuthMode, authToken?: string } = {
    authMode: amplifyAuthMode,
  }

  if (amplifyAuthMode === 'userPool' && authToken) {
    listArgs.authToken = authToken
  }

  let result: ModelResponse<PostModel>
  try {
    result = await runAmplifyApi(event, context =>
      client.models.Post.list(
        context,
        listArgs,
      ),
    ) as ModelResponse<PostModel>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('[Posts] Failed to list posts', error)
    throw toHttpError(message, { statusCode: 500, statusMessage: 'Failed to load posts' })
  }

  const listErrors = collectErrors(result)
  if (listErrors) {
    console.error('[Posts] List posts returned errors', listErrors)
    throw toHttpError(listErrors, { statusCode: 500, statusMessage: 'Failed to load posts' })
  }

  return result.data ?? []
})
