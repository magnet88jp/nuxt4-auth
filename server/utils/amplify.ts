import type { EventHandlerRequest, H3Event } from 'h3'
import { deleteCookie, parseCookies, setCookie } from 'h3'
import {
  AmplifyServer,
  createAWSCredentialsAndIdentityIdProvider,
  createKeyValueStorageFromCookieStorageAdapter,
  createUserPoolsTokenProvider,
  runWithAmplifyServerContext,
} from 'aws-amplify/adapter-core'
import { parseAmplifyConfig } from 'aws-amplify/utils'
import type { LibraryOptions } from '@aws-amplify/core'
import outputs from '~~/amplify_outputs.json'

const amplifyConfig = parseAmplifyConfig(outputs)

const isProduction = process.env.NODE_ENV === 'production'

const createCookieStorageAdapter = (event: H3Event<EventHandlerRequest>) => ({
  get(name) {
    const cookies = parseCookies(event)
    const value = cookies[name]
    return value ? { name, value } : undefined
  },
  getAll() {
    const cookies = parseCookies(event)
    return Object.entries(cookies).map(([name, value]) => ({ name, value }))
  },
  set(name, value, options) {
    setCookie(event, name, value, {
      path: '/',
      sameSite: 'lax',
      secure: isProduction,
      ...options,
    })
  },
  delete(name) {
    deleteCookie(event, name, { path: '/' })
  },
})

const createLibraryOptions = (event: H3Event<EventHandlerRequest>): LibraryOptions => {
  const cookieStorageAdapter = createCookieStorageAdapter(event)
  const keyValueStorage = createKeyValueStorageFromCookieStorageAdapter(cookieStorageAdapter)

  if (!amplifyConfig.Auth) {
    return {}
  }

  const tokenProvider = createUserPoolsTokenProvider(amplifyConfig.Auth, keyValueStorage)
  const credentialsProvider = createAWSCredentialsAndIdentityIdProvider(amplifyConfig.Auth, keyValueStorage)

  return {
    Auth: {
      tokenProvider,
      credentialsProvider,
    },
  }
}

export const runAmplifyApi = <Result>(
  event: H3Event<EventHandlerRequest>,
  operation: (contextSpec: AmplifyServer.ContextSpec) => Result | Promise<Result>,
) => {
  return runWithAmplifyServerContext<Result>(
    amplifyConfig,
    createLibraryOptions(event),
    operation,
  )
}

export { amplifyConfig }
