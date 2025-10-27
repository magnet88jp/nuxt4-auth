import { computed, ref } from 'vue'
import { getCurrentUser, signIn, signOut } from 'aws-amplify/auth'

type AuthUser = Awaited<ReturnType<typeof getCurrentUser>>

const user = ref<AuthUser | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

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
      } else if (result?.nextStep?.signInStep) {
        const step = result.nextStep.signInStep
        error.value =
          step === 'CONFIRM_SIGN_UP'
            ? 'メールアドレスの確認コードを入力してください。'
            : `追加の認証ステップが必要です (${step})`
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
    }
  }

  return {
    user,
    isAuthenticated,
    loading,
    error,
    login,
    logout,
    refresh: loadUser,
  }
}
