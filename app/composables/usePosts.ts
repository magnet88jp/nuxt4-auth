import { ref } from 'vue'
import { generateClient } from 'aws-amplify/data'
import { fetchAuthSession } from 'aws-amplify/auth'
import type { Schema } from '~~/amplify/data/resource'

const client = import.meta.client ? generateClient<Schema>() : null

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
      if (!client) {
        throw new Error('Amplify Data client is not available')
      }
      const response = await client!.models.Post.list({ authMode })
      sortAndStore(response.data)
    })
  }

  const createPost = async ({ content, displayName = null, authMode }: CreatePostInput) => {
    const trimmed = content.trim()
    if (!trimmed) return
    await run(async () => {
      if (!client) {
        throw new Error('Amplify Data client is not available')
      }
      const response = await client!.models.Post.create(
        { content: trimmed, displayName: displayName?.trim() || null },
        { authMode },
      )
      sortAndStore([response.data, ...posts.value])
    })
  }

  const updatePost = async ({ id, content, displayName = null }: UpdatePostInput) => {
    const trimmed = content.trim()
    if (!trimmed) return
    const normalizedDisplayName = displayName?.trim() || null

    await run(async () => {
      const session = await fetchAuthSession()
      const token
        = session.tokens?.accessToken?.toString()
          ?? session.tokens?.idToken?.toString()

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
      if (!client) {
        throw new Error('Amplify Data client is not available')
      }
      await client!.models.Post.delete({ id: post.id })
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
