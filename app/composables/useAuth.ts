import { computed, ref } from 'vue'
import { confirmSignIn, fetchAuthSession, getCurrentUser, signIn, signOut } from 'aws-amplify/auth'

type AuthUser = Awaited<ReturnType<typeof getCurrentUser>>

const user = ref<AuthUser | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const challenge = ref<'NEW_PASSWORD_REQUIRED' | null>(null)
const identityId = ref<string | null>(null)
const identityLoading = ref(false)

let initialized = false

async function loadUser() {
  if (!import.meta.client) {
    return
  }

  try {
    user.value = await getCurrentUser()
  }
  catch {
    user.value = null
  }
}

async function loadIdentity(options: { forceRefresh?: boolean } = {}) {
  if (!import.meta.client) {
    return
  }

  if (identityLoading.value) {
    return
  }

  identityLoading.value = true

  try {
    const session = await fetchAuthSession({ forceRefresh: options.forceRefresh })
    identityId.value = session.identityId ?? null
  }
  catch (err) {
    console.error('[Auth] Amplify identity request failed.', err)
    identityId.value = null
  }
  finally {
    identityLoading.value = false
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
  }
  catch (err) {
    console.error('[Auth] Amplify auth request failed.', err)
    error.value = err instanceof Error ? err.message : '認証エラーが発生しました'
    throw err
  }
  finally {
    loading.value = false
  }
}

export function useAuth() {
  if (import.meta.client && !initialized) {
    initialized = true
    void Promise.all([loadUser(), loadIdentity()])
  }

  const isAuthenticated = computed(() => user.value !== null)

  const login = async (username: string, password: string) => {
    try {
      const result = await withState(() => signIn({ username, password }))
      if (result?.isSignedIn) {
        await loadUser()
        await loadIdentity({ forceRefresh: true })
        challenge.value = null
      }
      else if (result?.nextStep?.signInStep) {
        const step = result.nextStep.signInStep
        if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          challenge.value = 'NEW_PASSWORD_REQUIRED'
          error.value = '初回ログイン用の新しいパスワードを設定してください。'
        }
        else {
          challenge.value = null
          error.value
            = step === 'CONFIRM_SIGN_UP'
              ? 'メールアドレスの確認コードを入力してください。'
              : `追加の認証ステップが必要です (${step})`
        }
      }
    }
    catch {
      // error state already captured in withState
    }
  }

  const logout = async () => {
    try {
      await withState(() => signOut())
    }
    catch {
      // error already handled
    }
    finally {
      user.value = null
      challenge.value = null
      identityId.value = null
      await loadIdentity({ forceRefresh: true })
    }
  }

  const completeNewPassword = async (newPassword: string) => {
    try {
      const result = await withState(() => confirmSignIn({ challengeResponse: newPassword }))
      if (result?.isSignedIn) {
        challenge.value = null
        await loadUser()
        await loadIdentity({ forceRefresh: true })
      }
      else if (result?.nextStep?.signInStep) {
        const step = result.nextStep.signInStep
        if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          challenge.value = 'NEW_PASSWORD_REQUIRED'
          error.value = 'パスワードの要件を満たしていません。別のパスワードを試してください。'
        }
        else {
          challenge.value = null
          error.value = `追加の認証ステップが必要です (${step})`
        }
      }
    }
    catch {
      // handled by withState
    }
  }

  return {
    user,
    isAuthenticated,
    loading,
    error,
    challenge,
    identityId,
    identityLoading,
    login,
    logout,
    completeNewPassword,
    refresh: loadUser,
    refreshIdentity: loadIdentity,
  }
}
