import { Amplify } from 'aws-amplify'
import outputs from '~~/amplify_outputs.json'

declare global {
  var __AMPLIFY_CONFIGURED__: boolean | undefined
}

export default defineNuxtPlugin(() => {
  if (!globalThis.__AMPLIFY_CONFIGURED__) {
    Amplify.configure(outputs, { ssr: true })
    Amplify.configure({
      Auth: {
        Cognito: {
          allowGuestAccess: true,
        },
      },
    })
    globalThis.__AMPLIFY_CONFIGURED__ = true
  }
})
