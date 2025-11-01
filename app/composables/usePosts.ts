import { ref } from 'vue'
import { fetchAuthSession } from 'aws-amplify/auth'
import type { Schema } from '~~/amplify/data/resource'

type PostModel = Schema['Post']['type']
type AuthMode = 'userPool' | 'identityPool' | 'apiKey' | 'iam' | undefined

type CreatePostInput = {
  content: string
  displayName?: string | null
  authMode?: AuthMode
}

type UpdatePostInput = {
  id: string
  content: string
  displayName?: string | null
}

export function usePosts() {
  const posts = ref<PostModel[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const resolveUserToken = async () => {
    if (!import.meta.client) return null

    try {
      const session = await fetchAuthSession()
      const token
        = session.tokens?.accessToken?.toString()
          ?? session.tokens?.idToken?.toString()

      return token ?? null
    }
    catch {
      return null
    }
  }

  const run = async <T>(handler: () => Promise<T>) => {
    if (!import.meta.client) return undefined as unknown as T
    loading.value = true
    error.value = null
    try {
      return await handler()
    }
    catch (err) {
      console.error('[Posts] request failed', err)
      error.value = err instanceof Error ? err.message : '不明なエラーが発生しました'
      return undefined as unknown as T
    }
    finally {
      loading.value = false
    }
  }

  const sortAndStore = (items: PostModel[]) => {
    const getTimestamp = (item: PostModel) => item.updatedAt ?? item.createdAt ?? ''
    posts.value = [...items].sort((a, b) => getTimestamp(b).localeCompare(getTimestamp(a)))
  }

  const fetchPosts = async (authMode?: AuthMode) => {
    await run(async () => {
      let resolvedAuthMode = authMode
      const headers: Record<string, string> = {}

      if (resolvedAuthMode !== 'identityPool') {
        const token = await resolveUserToken()
        if (token) {
          headers.Authorization = `Bearer ${token}`
          resolvedAuthMode = resolvedAuthMode ?? 'userPool'
        }
        else if (resolvedAuthMode === 'userPool') {
          throw new Error('認証情報を取得できませんでした')
        }
        else if (!resolvedAuthMode) {
          resolvedAuthMode = 'identityPool'
        }
      }

      const response = await $fetch<PostModel[]>('/api/posts', {
        query: resolvedAuthMode ? { authMode: resolvedAuthMode } : undefined,
        headers: Object.keys(headers).length ? headers : undefined,
      })

      sortAndStore(response)
    })
  }

  const createPost = async ({ content, displayName = null, authMode }: CreatePostInput) => {
    const trimmed = content.trim()
    if (!trimmed) return
    await run(async () => {
      const normalizedDisplayName = displayName?.trim() || null
      const headers: Record<string, string> = {}
      let resolvedAuthMode = authMode

      if (!resolvedAuthMode || resolvedAuthMode === 'userPool') {
        const token = await resolveUserToken()
        if (!token) {
          throw new Error('認証情報を取得できませんでした')
        }
        headers.Authorization = `Bearer ${token}`
        resolvedAuthMode = 'userPool'
      }
      else if (!['identityPool', 'iam', 'apiKey'].includes(resolvedAuthMode)) {
        throw new Error('サポートされていない認証モードです')
      }

      const bodyPayload: Record<string, unknown> = {
        content: trimmed,
        displayName: normalizedDisplayName,
      }

      if (resolvedAuthMode) {
        bodyPayload.authMode = resolvedAuthMode
      }

      const response = await $fetch<PostModel>('/api/posts', {
        method: 'POST',
        headers: Object.keys(headers).length ? headers : undefined,
        body: bodyPayload,
      })

      sortAndStore([response, ...posts.value])
    })
  }

  const updatePost = async ({ id, content, displayName = null }: UpdatePostInput) => {
    const trimmed = content.trim()
    if (!trimmed) return
    const normalizedDisplayName = displayName?.trim() || null

    await run(async () => {
      const token = await resolveUserToken()
      if (!token) {
        throw new Error('認証情報を取得できませんでした')
      }

      const response = await $fetch<PostModel>(`/api/posts/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          content: trimmed,
          displayName: normalizedDisplayName,
        },
      })

      posts.value = posts.value.map(post => (post.id === id ? response : post))
      sortAndStore(posts.value)
    })
  }

  const deletePost = async (post: PostModel) => {
    await run(async () => {
      const token = await resolveUserToken()
      if (!token) {
        throw new Error('認証情報を取得できませんでした')
      }

      await $fetch(`/api/posts/${post.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      posts.value = posts.value.filter(item => item.id !== post.id)
    })
  }

  return {
    posts,
    loading,
    error,
    fetchPosts,
    createPost,
    updatePost,
    deletePost,
  }
}
