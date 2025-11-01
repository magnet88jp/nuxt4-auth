import { ref } from 'vue'
import { fetchAuthSession } from 'aws-amplify/auth'
import type { Schema } from '~~/amplify/data/resource'
import { toUnixTime } from '../utils/datetime'

type PostModel = Schema['Post']['type']
type AuthMode = 'userPool' | 'identityPool' | 'apiKey' | undefined

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
    const getSortTime = (item: PostModel) => toUnixTime(item.updatedAt ?? item.createdAt ?? null)
    posts.value = [...items].sort((a, b) => getSortTime(b) - getSortTime(a))
  }

  const buildAuthHeaders = async (preferred?: AuthMode) => {
    let resolvedAuthMode = preferred
    const headers: Record<string, string> = {}

    if (!resolvedAuthMode || resolvedAuthMode === 'userPool') {
      const token = await resolveUserToken()
      if (token) {
        headers.Authorization = `Bearer ${token}`
        resolvedAuthMode = 'userPool'
      }
      else if (resolvedAuthMode === 'userPool') {
        throw new Error('認証情報を取得できませんでした')
      }
      else {
        resolvedAuthMode = 'identityPool'
      }
    }
    else if (resolvedAuthMode !== 'identityPool' && resolvedAuthMode !== 'apiKey') {
      throw new Error('サポートされていない認証モードです')
    }

    return {
      headers: Object.keys(headers).length ? headers : undefined,
      authMode: resolvedAuthMode,
    }
  }

  const fetchPosts = async (authMode?: AuthMode) => {
    await run(async () => {
      const { headers, authMode: resolvedAuthMode } = await buildAuthHeaders(authMode)
      const response = await $fetch<PostModel[]>('/api/posts', {
        query: resolvedAuthMode && resolvedAuthMode !== 'userPool' ? { authMode: resolvedAuthMode } : undefined,
        headers,
      })

      sortAndStore(response)
    })
  }

  const createPost = async ({ content, displayName = null, authMode }: CreatePostInput) => {
    const trimmed = content.trim()
    if (!trimmed) return
    await run(async () => {
      const normalizedDisplayName = displayName?.trim() || null
      const { headers, authMode: resolvedAuthMode } = await buildAuthHeaders(authMode)
      const bodyPayload: Record<string, unknown> = {
        content: trimmed,
        displayName: normalizedDisplayName,
      }

      if (resolvedAuthMode && resolvedAuthMode !== 'userPool') {
        bodyPayload.authMode = resolvedAuthMode
      }

      const response = await $fetch<PostModel>('/api/posts', {
        method: 'POST',
        headers,
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
      const { headers } = await buildAuthHeaders('userPool')
      const response = await $fetch<PostModel>(`/api/posts/${id}`, {
        method: 'PUT',
        headers,
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
      const { headers } = await buildAuthHeaders('userPool')
      await $fetch(`/api/posts/${post.id}`, {
        method: 'DELETE',
        headers,
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
