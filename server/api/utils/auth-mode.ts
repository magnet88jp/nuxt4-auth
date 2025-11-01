import { createError, getHeader } from 'h3'
import type { H3Event, EventHandlerRequest } from 'h3'
import { extractBearerToken, getCognitoConfig, verifyToken } from '~~/server/utils/cognito'

export type RequestAuthMode = 'userPool' | 'identityPool' | 'iam' | 'apiKey'
export type ClientAuthMode = 'userPool' | 'iam' | 'apiKey'

export type ResolveServerAuthOptions = {
  requestedAuthMode?: RequestAuthMode | null
  requireToken?: boolean
  defaultAuthMode?: RequestAuthMode
}

export type ResolvedServerAuth = {
  authMode: RequestAuthMode
  amplifyAuthMode: ClientAuthMode
  authToken?: string
  userSub?: string | null
}

const allowedAuthModes: RequestAuthMode[] = ['userPool', 'identityPool', 'iam', 'apiKey']

const toClientAuthMode = (mode: RequestAuthMode): ClientAuthMode => {
  return mode === 'identityPool' || mode === 'iam' ? 'iam' : mode
}

const assertSupportedAuthMode = (mode?: RequestAuthMode | null) => {
  if (!mode) {
    return
  }
  if (!allowedAuthModes.includes(mode)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported auth mode' })
  }
}

export const resolveServerAuth = async (
  event: H3Event<EventHandlerRequest>,
  options: ResolveServerAuthOptions = {},
): Promise<ResolvedServerAuth> => {
  const { requestedAuthMode, requireToken = false, defaultAuthMode = 'identityPool' } = options

  assertSupportedAuthMode(requestedAuthMode)

  const token = extractBearerToken(getHeader(event, 'authorization'))
  let resolvedAuthMode = requestedAuthMode ?? null
  let authToken: string | undefined
  let userSub: string | null | undefined

  if (token) {
    const shouldUseUserPool = requireToken || !requestedAuthMode || requestedAuthMode === 'userPool'

    if (shouldUseUserPool) {
      getCognitoConfig()

      const payload = await verifyToken(token)
      userSub = typeof payload.sub === 'string' ? payload.sub : null

      if (!userSub) {
        throw createError({ statusCode: 401, statusMessage: 'Token subject is missing' })
      }

      resolvedAuthMode = 'userPool'
      authToken = token
    }
  }

  if (!token && (requireToken || requestedAuthMode === 'userPool')) {
    throw createError({ statusCode: 401, statusMessage: 'Missing bearer token' })
  }

  if (!resolvedAuthMode) {
    resolvedAuthMode = defaultAuthMode
  }

  assertSupportedAuthMode(resolvedAuthMode)

  const amplifyAuthMode = toClientAuthMode(resolvedAuthMode)

  return {
    authMode: resolvedAuthMode,
    amplifyAuthMode,
    authToken,
    userSub,
  }
}

export const parseRequestAuthMode = (value?: string | null): RequestAuthMode | undefined => {
  if (!value || typeof value !== 'string') {
    return undefined
  }
  return allowedAuthModes.includes(value as RequestAuthMode)
    ? value as RequestAuthMode
    : undefined
}
