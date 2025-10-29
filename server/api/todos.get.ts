import { defineEventHandler, getHeader, createError } from 'h3'
import { Amplify } from 'aws-amplify'
import { generateClient } from 'aws-amplify/data'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import outputs from '~~/amplify_outputs.json' assert { type: 'json' }
import type { Schema } from '~~/amplify/data/resource'

type TodoModel = Schema['Todo']['type']

type ModelResponse<T> = {
  data?: T
  errors?: { message?: string }[]
  nextToken?: string | null
}

type CognitoConfig = {
  userPoolId?: string
  clientId?: string
  region?: string
}

const cognitoConfig: CognitoConfig = {
  userPoolId: outputs.auth?.user_pool_id,
  clientId: outputs.auth?.user_pool_client_id,
  region: outputs.auth?.aws_region,
}

let amplifyConfigured = false
let cachedAccessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null
let cachedIdVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null

function ensureAmplifyConfigured() {
  if (amplifyConfigured) return

  Amplify.configure(outputs, { ssr: true })
  amplifyConfigured = true
}

function extractBearerToken(header?: string | null) {
  if (!header) return null

  const [type, token] = header.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !token) return null

  return token
}

async function verifyToken(token: string) {
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
  ensureAmplifyConfigured()

  const bearer = extractBearerToken(getHeader(event, 'authorization'))

  type AuthMode = 'userPool' | 'identityPool' | 'guest'

  let authMode: AuthMode = 'identityPool'
  let authToken: string | undefined

  if (bearer) {
    await verifyToken(bearer)
    authMode = 'userPool'
    authToken = bearer
  }

  const clientOptions: Record<string, unknown> = { authMode }
  if (authToken) clientOptions.authToken = authToken

  const client = generateClient<Schema>(clientOptions as any)

  let response: ModelResponse<TodoModel[]>
  try {
    response = await client.models.Todo.list({ authMode }) as ModelResponse<TodoModel[]>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isFederatedJwtMissing = /no federated jwt/i.test(message)

    if (!authToken && authMode === 'identityPool' && isFederatedJwtMissing) {
      try {
        const guestClient = generateClient<Schema>({ authMode: 'guest' } as any)
        response = await guestClient.models.Todo.list({ authMode: 'guest' }) as ModelResponse<TodoModel[]>
        authMode = 'guest'
      }
      catch (guestError) {
        console.error('[Todos] Guest list fallback failed', guestError)
        throw createError({ statusCode: 500, statusMessage: 'Failed to fetch todos' })
      }
    }
    else {
      console.error('[Todos] Failed to list todos', error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch todos' })
    }
  }

  const errors = collectErrors(response)
  if (errors) {
    throw createError({ statusCode: 500, statusMessage: errors })
  }

  return response.data ?? []
})
