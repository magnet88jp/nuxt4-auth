import { Amplify } from 'aws-amplify'

export default defineNuxtPlugin(async () => {
  if (!process.client) {
    return
  }

  // Avoid reconfiguration if Amplify already has a config
  const existing = Amplify.getConfig()
  if (existing && Object.keys(existing).length > 0) {
    return
  }

  try {
    const response = await fetch('/amplify_outputs.json', {
      cache: 'no-store',
    })

    if (!response.ok) {
      console.warn('[Amplify] Missing amplify_outputs.json in /public; run `npx ampx generate outputs -o public/amplify_outputs.json`.')
      return
    }

    const outputs = await response.json()
    Amplify.configure(outputs)
  } catch (error) {
    console.error('[Amplify] Failed to configure Amplify.', error)
  }
})
