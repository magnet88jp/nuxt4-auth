import { ref } from 'vue'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '~/amplify/data/resource'

const client = typeof window !== 'undefined' ? generateClient<Schema>() : null

export type PostModel = Schema['Post']['type']
export type PostInput = Pick<PostModel, 'title' | 'body' | 'nickname'>

type AuthMode = 'userPool' | 'identityPool' | 'apiKey' | 'iam' | undefined

function sortByLatest(items: PostModel[]) {
  const getTimestamp = (item: PostModel) => item.updatedAt ?? item.createdAt ?? ''
  return [...items].sort((a, b) => getTimestamp(b).localeCompare(getTimestamp(a)))
}

export function usePosts() {
  const posts = ref<PostModel[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const run = async <T>(handler: () => Promise<T>) => {
    if (!client) {
      return undefined as T | undefined
    }

    loading.value = true
    error.value = null

    try {
      return await handler()
    }
    catch (err) {
      console.error('[Post] Amplify Data request failed.', err)
      error.value = err instanceof Error ? err.message : 'Unknown error'
      return undefined
    }
    finally {
      loading.value = false
    }
  }

  const fetchPosts = async (authMode?: AuthMode) => {
    await run(async () => {
      const response = await client!.models.Post.list({ authMode })
      posts.value = sortByLatest(response.data)
    })
  }

  const createPost = async (
    input: { title: string; body: string; nickname?: string; ownerIdentityId?: string },
    authMode?: AuthMode,
  ) => {
    const title = input.title.trim()
    const body = input.body.trim()

    if (!title || !body) {
      return
    }

    await run(async () => {
      const response = await client!.models.Post.create(
        {
          title,
          body,
          nickname: input.nickname?.trim() || undefined,
          ownerIdentityId: input.ownerIdentityId,
        },
        { authMode },
      )
      posts.value = sortByLatest([response.data, ...posts.value])
    })
  }

  const updatePost = async (
    post: PostModel,
    updates: { title: string; body: string; nickname?: string },
    authMode?: AuthMode,
  ) => {
    const title = updates.title.trim()
    const body = updates.body.trim()

    if (!title || !body) {
      return
    }

    await run(async () => {
      const response = await client!.models.Post.update(
        {
          id: post.id,
          title,
          body,
          nickname: updates.nickname?.trim() || undefined,
        },
        { authMode },
      )

      posts.value = posts.value.map(item => (item.id === post.id ? response.data : item))
    })
  }

  const deletePost = async (post: PostModel, authMode?: AuthMode) => {
    await run(async () => {
      await client!.models.Post.delete({ id: post.id }, { authMode })
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
