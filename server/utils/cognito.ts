import { createError } from 'h3'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import outputs from '~~/amplify_outputs.json' assert { type: 'json' }

export type CognitoConfig = {
  userPoolId?: string
  clientId?: string
  region?: string
}

export type VerifyPayload = {
  sub?: string
  [key: string]: unknown
}

const cognitoConfig: CognitoConfig = {
  userPoolId: outputs.auth?.user_pool_id,
  clientId: outputs.auth?.user_pool_client_id,
  region: outputs.auth?.aws_region,
}

let cachedAccessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null
let cachedIdVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null

const ensureConfig = () => {
  if (!cognitoConfig.userPoolId || !cognitoConfig.clientId) {
    throw createError({ statusCode: 500, statusMessage: 'Cognito configuration is missing' })
  }
}

export const getCognitoConfig = () => {
  ensureConfig()
  return cognitoConfig
}

export const extractBearerToken = (header?: string | null) => {
  if (!header) return null

  const [type, token] = header.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !token) return null

  return token
}

export const verifyToken = async (token: string): Promise<VerifyPayload> => {
  const { userPoolId, clientId, region } = getCognitoConfig()

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

