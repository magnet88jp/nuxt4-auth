import { computed, ref } from 'vue'
import { confirmSignIn, getCurrentUser, signIn, signOut } from 'aws-amplify/auth'

type AuthUser = Awaited<ReturnType<typeof getCurrentUser>>

const user = ref<AuthUser | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const challenge = ref<'NEW_PASSWORD_REQUIRED' | null>(null)

let initialized = false

async function loadUser() {
  if (!import.meta.client) {
    return
  }

  try {
    user.value = await getCurrentUser()
  } catch {
    user.value = null
  }
}

async function withState<R>(handler: () => Promise<R>) {
  if (!import.meta.client) {
    return undefined as R | undefined
  }

  loading.value = true
  error.value = null

  try {
    return await handler()
  } catch (err) {
    console.error('[Auth] Amplify auth request failed.', err)
    error.value = err instanceof Error ? err.message : '認証エラーが発生しました'
    throw err
  } finally {
    loading.value = false
  }
}

export function useAuth() {
  if (import.meta.client && !initialized) {
    initialized = true
    void loadUser()
  }

  const isAuthenticated = computed(() => user.value !== null)

  const login = async (username: string, password: string) => {
    try {
      const result = await withState(() => signIn({ username, password }))
      if (result?.isSignedIn) {
        await loadUser()
        challenge.value = null
      } else if (result?.nextStep?.signInStep) {
        const step = result.nextStep.signInStep
        if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          challenge.value = 'NEW_PASSWORD_REQUIRED'
          error.value = '初回ログイン用の新しいパスワードを設定してください。'
        } else {
          challenge.value = null
          error.value =
            step === 'CONFIRM_SIGN_UP'
              ? 'メールアドレスの確認コードを入力してください。'
              : `追加の認証ステップが必要です (${step})`
        }
      }
    } catch {
      // error state already captured in withState
    }
  }

  const logout = async () => {
    try {
      await withState(() => signOut())
    } catch {
      // error already handled
    } finally {
      user.value = null
      challenge.value = null
    }
  }

  const completeNewPassword = async (newPassword: string) => {
    try {
      const result = await withState(() => confirmSignIn({ challengeResponse: newPassword }))
      if (result?.isSignedIn) {
        challenge.value = null
        await loadUser()
      } else if (result?.nextStep?.signInStep) {
        const step = result.nextStep.signInStep
        if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          challenge.value = 'NEW_PASSWORD_REQUIRED'
          error.value = 'パスワードの要件を満たしていません。別のパスワードを試してください。'
        } else {
          challenge.value = null
          error.value = `追加の認証ステップが必要です (${step})`
        }
      }
    } catch {
      // handled by withState
    }
  }

  return {
    user,
    isAuthenticated,
    loading,
    error,
    challenge,
    login,
    logout,
    completeNewPassword,
    refresh: loadUser,
  }
}
