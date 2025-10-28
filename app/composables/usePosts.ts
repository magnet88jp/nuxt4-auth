import { ref } from 'vue'
import { generateClient } from 'aws-amplify/data'
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
    if (!client) return undefined as unknown as T
    loading.value = true
    error.value = null
    try {
      return await handler()
    }
    catch (err) {
      console.error('[Posts] Amplify Data request failed', err)
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
      const response = await client!.models.Post.list({ authMode })
      sortAndStore(response.data)
    })
  }

  const createPost = async ({ content, displayName = null, authMode }: CreatePostInput) => {
    const trimmed = content.trim()
    if (!trimmed) return
    await run(async () => {
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
    await run(async () => {
      const response = await client!.models.Post.update({
        id,
        content: trimmed,
        displayName: displayName?.trim() || null,
      })
      posts.value = posts.value.map(post => (post.id === id ? response.data : post))
      sortAndStore(posts.value)
    })
  }

  const deletePost = async (post: PostModel) => {
    await run(async () => {
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
