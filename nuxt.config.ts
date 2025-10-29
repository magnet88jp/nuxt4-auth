// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/test-utils', '@nuxt/ui'],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    cognito: {
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      clientId: process.env.COGNITO_USER_POOL_CLIENT_ID,
      region: process.env.AWS_REGION,
    },
    appSync: {
      graphqlEndpoint: process.env.AWS_APPSYNC_GRAPHQL_ENDPOINT,
    },
  },
  compatibilityDate: '2025-07-15',
  eslint: {
    config: {
      stylistic: {
        indent: 2,
        semi: false,
        quotes: 'single',
      },
    },
  },
})
