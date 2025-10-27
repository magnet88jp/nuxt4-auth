import { computed, ref } from 'vue'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '~/amplify/data/resource'

const client = typeof window !== 'undefined' ? generateClient<Schema>() : null

type CommentModel = Schema['Comment']['type']
type AuthMode = 'userPool' | 'identityPool' | 'apiKey' | 'iam' | undefined

const sortByLatest = (items: CommentModel[]) => {
  const getTimestamp = (item: CommentModel) => item.updatedAt ?? item.createdAt ?? ''
  return [...items].sort((a, b) => getTimestamp(b).localeCompare(getTimestamp(a)))
}

export function useComments() {
  const commentsByPost = ref<Record<string, CommentModel[]>>({})
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
      console.error('[Comment] Amplify Data request failed.', err)
      error.value = err instanceof Error ? err.message : 'Unknown error'
      return undefined
    }
    finally {
      loading.value = false
    }
  }

  const listForPost = (postId: string) => computed(() => commentsByPost.value[postId] ?? [])

  const fetchComments = async (postId: string, authMode?: AuthMode) => {
    await run(async () => {
      const response = await client!.models.Comment.list({
        filter: { postId: { eq: postId } },
        authMode,
      })
      commentsByPost.value = {
        ...commentsByPost.value,
        [postId]: sortByLatest(response.data),
      }
    })
  }

  const createComment = async (
    postId: string,
    input: { body: string; nickname?: string; ownerIdentityId?: string },
    authMode?: AuthMode,
  ) => {
    const body = input.body.trim()
    if (!body) {
      return
    }

    await run(async () => {
      const response = await client!.models.Comment.create(
        {
          postId,
          body,
          nickname: input.nickname?.trim() || undefined,
          ownerIdentityId: input.ownerIdentityId,
        },
        { authMode },
      )

      const list = commentsByPost.value[postId] ?? []
      commentsByPost.value = {
        ...commentsByPost.value,
        [postId]: sortByLatest([response.data, ...list]),
      }
    })
  }

  const updateComment = async (
    comment: CommentModel,
    updates: { body: string; nickname?: string },
    authMode?: AuthMode,
  ) => {
    const body = updates.body.trim()
    if (!body) {
      return
    }

    await run(async () => {
      const response = await client!.models.Comment.update(
        {
          id: comment.id,
          body,
          nickname: updates.nickname?.trim() || undefined,
        },
        { authMode },
      )

      const list = commentsByPost.value[comment.postId] ?? []
      commentsByPost.value = {
        ...commentsByPost.value,
        [comment.postId]: list.map(item => (item.id === comment.id ? response.data : item)),
      }
    })
  }

  const deleteComment = async (comment: CommentModel, authMode?: AuthMode) => {
    await run(async () => {
      await client!.models.Comment.delete({ id: comment.id }, { authMode })
      const list = commentsByPost.value[comment.postId] ?? []
      commentsByPost.value = {
        ...commentsByPost.value,
        [comment.postId]: list.filter(item => item.id !== comment.id),
      }
    })
  }

  return {
    loading,
    error,
    listForPost,
    fetchComments,
    createComment,
    updateComment,
    deleteComment,
  }
}

export type { CommentModel }
