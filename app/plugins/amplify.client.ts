// plugins/amplify.client.ts
import { defineNuxtPlugin } from '#app'
import { Amplify } from 'aws-amplify'
import outputs from '~~/amplify_outputs.json'

declare global {
  // 多重初期化を防止（HMR時も安全）

  var __AMPLIFY_CONFIGURED__: boolean | undefined
}

export default defineNuxtPlugin(() => {
  if (globalThis.__AMPLIFY_CONFIGURED__) return

  // 1回の configure に集約して、SSR オプションもここで適用
  Amplify.configure(
    {
      // まずは backend の出力をそのまま適用
      ...outputs,

      // 追加で Auth 設定をマージ（allowGuestAccess を有効化）
      Auth: {
        ...(outputs as any).Auth,
        Cognito: {
          ...((outputs as any).Auth?.Cognito ?? {}),
          allowGuestAccess: true,
        },
      },
    },
    { ssr: true }, // ← Nuxt で SSR のときは明示
  )

  globalThis.__AMPLIFY_CONFIGURED__ = true
})
