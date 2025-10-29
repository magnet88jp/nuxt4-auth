import { defineEventHandler, readBody, getHeader, createError } from 'h3'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import outputs from '~~/amplify_outputs.json' assert { type: 'json' }

type AmplifyOutputs = {
  auth?: {
    user_pool_id?: string
    user_pool_client_id?: string
    aws_region?: string
  }
  data?: {
    url?: string
  }
}

type GraphQLRequest<T> = {
  data?: T
  errors?: { message: string }[]
}

type GetPostResponse = {
  getPost?: {
    id: string
    owner?: string | null
  } | null
}

type UpdatePostResponse = {
  updatePost?: {
    id: string
    content: string
    displayName?: string | null
    owner?: string | null
    createdAt?: string | null
    updatedAt?: string | null
  } | null
}

type CognitoConfig = {
  userPoolId?: string
  clientId?: string
  region?: string
}

type AppSyncConfig = {
  graphqlEndpoint?: string
}

const GET_POST_QUERY = `
  query GetPost($id: ID!) {
    getPost(id: $id) {
      id
      owner
    }
  }
`

const UPDATE_POST_MUTATION = `
  mutation UpdatePost($input: UpdatePostInput!) {
    updatePost(input: $input) {
      id
      content
      displayName
      owner
      createdAt
      updatedAt
    }
  }
`

const { auth, data } = outputs as AmplifyOutputs

const cognitoConfig: CognitoConfig = {
  userPoolId: auth?.user_pool_id,
  clientId: auth?.user_pool_client_id,
  region: auth?.aws_region,
}

const appSyncConfig: AppSyncConfig = {
  graphqlEndpoint: data?.url,
}

let cachedAccessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null
let cachedIdVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null

async function verifyToken(token: string, config: CognitoConfig) {
  const { userPoolId, clientId, region } = config
  if (!userPoolId || !clientId) {
    throw createError({ statusCode: 500, statusMessage: 'Cognito verifier configuration is incomplete' })
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

function extractBearerToken(header?: string | null) {
  if (!header) {
    return null
  }

  const [type, value] = header.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !value) {
    return null
  }

  return value
}

async function callAppSync<T>(endpoint: string, token: string, query: string, variables: Record<string, unknown>) {
  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({ query, variables }),
    })
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to reach AppSync endpoint' })
  }

  let payload: GraphQLRequest<T>
  try {
    payload = await response.json() as GraphQLRequest<T>
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: 'Invalid response from AppSync' })
  }

  if (!response.ok) {
    const message = payload.errors?.map(error => error.message).join('; ') || 'AppSync request failed'
    const statusCode = response.status === 401 || response.status === 403 ? response.status : 502
    throw createError({ statusCode, statusMessage: message })
  }

  if (payload.errors?.length) {
    const message = payload.errors.map(error => error.message).join('; ')
    const statusCode = /unauthorized|not authorized/i.test(message) ? 403 : 502
    throw createError({ statusCode, statusMessage: message })
  }

  if (!payload.data) {
    throw createError({ statusCode: 502, statusMessage: 'AppSync response did not include data' })
  }

  return payload.data
}

export default defineEventHandler(async event => {
  if (!cognitoConfig.userPoolId || !cognitoConfig.clientId) {
    throw createError({ statusCode: 500, statusMessage: 'Cognito configuration is missing' })
  }

  if (!appSyncConfig.graphqlEndpoint) {
    throw createError({ statusCode: 500, statusMessage: 'AppSync endpoint is not configured' })
  }

  const authHeader = getHeader(event, 'authorization')
  const token = extractBearerToken(authHeader)
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing bearer token' })
  }

  const payload = await verifyToken(token, cognitoConfig)
  const userSub = payload.sub
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

  const getPostResponse = await callAppSync<GetPostResponse>(
    appSyncConfig.graphqlEndpoint,
    token,
    GET_POST_QUERY,
    { id },
  )

  const post = getPostResponse.getPost
  if (!post) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  if (post.owner && post.owner !== userSub) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const updateResponse = await callAppSync<UpdatePostResponse>(
    appSyncConfig.graphqlEndpoint,
    token,
    UPDATE_POST_MUTATION,
    { input: { id, content, displayName: normalizedDisplayName } },
  )

  if (!updateResponse.updatePost) {
    throw createError({ statusCode: 500, statusMessage: 'Post update failed unexpectedly' })
  }

  return updateResponse.updatePost
})
