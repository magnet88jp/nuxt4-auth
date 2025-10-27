<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { PostModel } from '~/composables/usePosts'
import type { CommentModel } from '~/composables/useComments'

const {
  user,
  isAuthenticated,
  loading: authLoading,
  error: authError,
  challenge,
  login,
  logout,
  completeNewPassword,
  identityId,
  identityLoading,
  refreshIdentity,
} = useAuth()

const {
  posts,
  loading: postsLoading,
  error: postsError,
  fetchPosts,
  createPost,
  updatePost,
  deletePost,
} = usePosts()

const {
  loading: commentsLoading,
  error: commentsError,
  listForPost,
  fetchComments,
  createComment,
  updateComment,
  deleteComment,
} = useComments()

const email = ref('')
const password = ref('')
const newPassword = ref('')
const newPasswordConfirm = ref('')
const newPasswordError = ref<string | null>(null)

const newPost = reactive({ title: '', body: '', nickname: '' })
const editingPostId = ref<string | null>(null)
const editingPostDraft = reactive({ title: '', body: '', nickname: '' })

const expandedPosts = ref<Record<string, boolean>>({})
const commentsLoaded = ref<Record<string, boolean>>({})
const commentDrafts = reactive<Record<string, { body: string; nickname: string }>>({})
const editingComment = ref<{ postId: string; commentId: string; body: string; nickname: string } | null>(null)
const identityError = ref<string | null>(null)

const requiresNewPassword = computed(() => challenge.value === 'NEW_PASSWORD_REQUIRED')
const hasPosts = computed(() => posts.value.length > 0)
const currentAuthMode = computed(() => (isAuthenticated.value ? undefined : 'identityPool'))
const combinedLoading = computed(() => authLoading.value || postsLoading.value || commentsLoading.value || identityLoading.value)

const formatDate = (iso?: string | null) => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const ensureIdentity = async () => {
  if (!identityId.value) {
    await refreshIdentity({ forceRefresh: true })
  }

  if (!identityId.value) {
    identityError.value = '匿名ユーザー情報の取得に失敗しました。ページを再読込して再試行してください。'
    return null
  }

  identityError.value = null
  return identityId.value
}

const canManagePost = (post: PostModel) => {
  return Boolean(identityId.value && post.ownerIdentityId && post.ownerIdentityId === identityId.value)
}

const canManageComment = (comment: CommentModel) => {
  return Boolean(identityId.value && comment.ownerIdentityId && comment.ownerIdentityId === identityId.value)
}

const ensureCommentDraft = (postId: string) => {
  if (!commentDrafts[postId]) {
    commentDrafts[postId] = { body: '', nickname: '' }
  }
  return commentDrafts[postId]
}

const commentsForPost = (postId: string) => listForPost(postId).value

const toggleComments = async (postId: string) => {
  expandedPosts.value[postId] = !expandedPosts.value[postId]

  if (expandedPosts.value[postId]) {
    ensureCommentDraft(postId)
    if (!commentsLoaded.value[postId]) {
      await fetchComments(postId, currentAuthMode.value)
      commentsLoaded.value[postId] = true
    }
  }
}

const resetNewPasswordForm = () => {
  newPassword.value = ''
  newPasswordConfirm.value = ''
  newPasswordError.value = null
}

watch(
  () => requiresNewPassword.value,
  (active) => {
    if (!active) {
      resetNewPasswordForm()
    }
  },
)

watch(
  () => isAuthenticated.value,
  async (authed) => {
    await fetchPosts(authed ? undefined : 'identityPool')
  },
  { immediate: true },
)

onMounted(() => {
  if (!identityId.value) {
    void refreshIdentity()
  }
})

watch(
  () => posts.value.map(post => post.id),
  (ids) => {
    const currentIds = new Set(ids)

    for (const key of Object.keys(expandedPosts.value)) {
      if (!currentIds.has(key)) {
        delete expandedPosts.value[key]
        delete commentsLoaded.value[key]
        delete commentDrafts[key]
      }
    }

    if (editingPostId.value && !currentIds.has(editingPostId.value)) {
      cancelEditPost()
    }

    if (editingComment.value && !currentIds.has(editingComment.value.postId)) {
      editingComment.value = null
    }
  },
  { deep: true },
)

const handleLogin = async () => {
  if (!email.value || !password.value) {
    return
  }

  await login(email.value, password.value)
  if (isAuthenticated.value) {
    email.value = ''
    password.value = ''
  }
}

const handleLogout = async () => {
  try {
    await logout()
  }
  catch {
    // handled in useAuth
  }
}

const handleCompleteNewPassword = async () => {
  if (!newPassword.value || !newPasswordConfirm.value) {
    newPasswordError.value = '新しいパスワードを入力してください。'
    return
  }

  if (newPassword.value !== newPasswordConfirm.value) {
    newPasswordError.value = 'パスワードが一致しません。'
    return
  }

  newPasswordError.value = null
  await completeNewPassword(newPassword.value)
}

const handleCreatePost = async () => {
  const identity = await ensureIdentity()
  if (!identity) {
    return
  }
  await createPost(
    {
      title: newPost.title,
      body: newPost.body,
      nickname: newPost.nickname,
      ownerIdentityId: identity,
    },
    currentAuthMode.value,
  )
  newPost.title = ''
  newPost.body = ''
}

const startEditPost = (post: PostModel) => {
  editingPostId.value = post.id
  editingPostDraft.title = post.title
  editingPostDraft.body = post.body
  editingPostDraft.nickname = post.nickname ?? ''
}

const cancelEditPost = () => {
  editingPostId.value = null
  editingPostDraft.title = ''
  editingPostDraft.body = ''
  editingPostDraft.nickname = ''
}

const handleUpdatePost = async () => {
  if (!editingPostId.value) {
    return
  }

  const target = posts.value.find(post => post.id === editingPostId.value)
  if (!target) {
    return
  }

  await updatePost(
    target,
    {
      title: editingPostDraft.title,
      body: editingPostDraft.body,
      nickname: editingPostDraft.nickname,
    },
    currentAuthMode.value,
  )

  cancelEditPost()
}

const handleDeletePost = async (post: PostModel) => {
  await deletePost(post, currentAuthMode.value)
}

const handleCreateComment = async (postId: string) => {
  const draft = ensureCommentDraft(postId)
  const identity = await ensureIdentity()
  if (!identity) {
    return
  }
  await createComment(
    postId,
    {
      body: draft.body,
      nickname: draft.nickname,
      ownerIdentityId: identity,
    },
    currentAuthMode.value,
  )
  draft.body = ''
}

const startEditComment = (postId: string, comment: CommentModel) => {
  editingComment.value = {
    postId,
    commentId: comment.id,
    body: comment.body ?? '',
    nickname: comment.nickname ?? '',
  }
}

const cancelEditComment = () => {
  editingComment.value = null
}

const handleUpdateComment = async () => {
  if (!editingComment.value) {
    return
  }

  const list = commentsForPost(editingComment.value.postId)
  const target = list.find(item => item.id === editingComment.value!.commentId)
  if (!target) {
    editingComment.value = null
    return
  }

  await updateComment(
    target,
    {
      body: editingComment.value.body,
      nickname: editingComment.value.nickname,
    },
    currentAuthMode.value,
  )

  editingComment.value = null
}

const handleDeleteComment = async (comment: CommentModel) => {
  await deleteComment(comment, currentAuthMode.value)
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-12">
    <section>
      <h1 class="text-3xl font-semibold tracking-tight">
        掲示板
      </h1>
      <p class="mt-2 text-slate-600">
        Amazon Cognito 認証を利用しつつ、匿名投稿やコメントも可能な掲示板サンプルです。
      </p>
    </section>

    <section
      class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200"
    >
      <header class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold">
            認証
          </h2>
          <p class="mt-1 text-sm text-slate-500">
            ログインすると投稿を自分のアカウントと紐付けできます。未ログインでも匿名投稿が可能です。
          </p>
        </div>
        <div v-if="isAuthenticated" class="text-right text-sm text-slate-600">
          <p>
            ログイン中: <span class="font-medium">{{ user?.signInDetails?.loginId ?? user?.username }}</span>
          </p>
        </div>
      </header>

      <template v-if="!isAuthenticated">
        <template v-if="requiresNewPassword">
          <p class="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
            初回ログインのため、新しいパスワードを設定してください。
          </p>
          <form class="mt-4 flex flex-col gap-4" @submit.prevent="handleCompleteNewPassword">
            <input
              v-model="newPassword"
              type="password"
              placeholder="新しいパスワード"
              class="rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              :disabled="authLoading"
              autocomplete="new-password"
            >
            <input
              v-model="newPasswordConfirm"
              type="password"
              placeholder="新しいパスワード (確認)"
              class="rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              :disabled="authLoading"
              autocomplete="new-password"
            >
            <p v-if="newPasswordError" class="text-sm text-red-600">
              {{ newPasswordError }}
            </p>
            <button
              type="submit"
              class="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              :disabled="authLoading"
            >
              新しいパスワードを送信
            </button>
          </form>
        </template>
        <template v-else>
          <form class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end" @submit.prevent="handleLogin">
            <div class="flex-1">
              <label class="block text-sm font-medium text-slate-700">メールアドレス</label>
              <input
                v-model="email"
                type="email"
                class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="example@example.com"
                :disabled="authLoading"
                autocomplete="username"
              >
            </div>
            <div class="flex-1">
              <label class="block text-sm font-medium text-slate-700">パスワード</label>
              <input
                v-model="password"
                type="password"
                class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="••••••••"
                :disabled="authLoading"
                autocomplete="current-password"
              >
            </div>
            <button
              type="submit"
              class="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:w-auto"
              :disabled="authLoading"
            >
              ログイン
            </button>
          </form>
        </template>
      </template>
      <template v-else>
        <button
          class="mt-4 inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
          :disabled="authLoading"
          @click="handleLogout"
        >
          ログアウト
        </button>
      </template>

      <p v-if="authError" class="mt-4 text-sm text-red-600">
        {{ authError }}
      </p>
    </section>

    <section class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 class="text-xl font-semibold">
        新規投稿
      </h2>
      <p class="mt-1 text-sm text-slate-500">
        匿名投稿の場合は「表示名」を空欄のままでも構いません。
      </p>
      <form class="mt-4 flex flex-col gap-4" @submit.prevent="handleCreatePost">
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            v-model="newPost.title"
            type="text"
            placeholder="タイトル"
            class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            :disabled="postsLoading || combinedLoading"
          >
          <input
            v-model="newPost.nickname"
            type="text"
            placeholder="表示名 (任意)"
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:w-48"
            :disabled="postsLoading || combinedLoading"
          >
        </div>
        <textarea
          v-model="newPost.body"
          rows="4"
          placeholder="本文を入力してください"
          class="rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          :disabled="postsLoading || combinedLoading"
        />
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-400">
            投稿は {{ isAuthenticated ? 'サインイン中のユーザー' : '匿名の訪問者' }} と紐付きます。
          </p>
          <button
            type="submit"
            class="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            :disabled="postsLoading || combinedLoading"
          >
            投稿する
          </button>
        </div>
      </form>
      <p v-if="identityError" class="mt-2 text-sm text-red-600">
        {{ identityError }}
      </p>
      <p v-if="postsError" class="mt-2 text-sm text-red-600">
        {{ postsError }}
      </p>
    </section>

    <section class="flex flex-col gap-4">
      <header class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">
          投稿一覧
        </h2>
        <p class="text-sm text-slate-500">
          全ての訪問者が閲覧可能です。
        </p>
      </header>

      <p v-if="!hasPosts && !postsLoading" class="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-500">
        まだ投稿がありません。最初のメッセージを投稿しましょう！
      </p>

      <ul class="flex flex-col gap-4">
        <li
          v-for="post in posts"
          :key="post.id"
          class="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200"
        >
          <article class="flex flex-col gap-4">
            <header class="flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold text-slate-900">
                  {{ post.title }}
                </h3>
                <span class="text-xs text-slate-400">
                  {{ formatDate(post.updatedAt ?? post.createdAt) }}
                </span>
              </div>
              <p class="text-sm text-slate-500">
                投稿者: {{ post.nickname || '匿名' }}
              </p>
            </header>

            <div v-if="editingPostId === post.id" class="flex flex-col gap-4">
              <input
                v-model="editingPostDraft.title"
                type="text"
                class="rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                :disabled="postsLoading"
              >
              <textarea
                v-model="editingPostDraft.body"
                rows="4"
                class="rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                :disabled="postsLoading"
              />
              <input
                v-model="editingPostDraft.nickname"
                type="text"
                class="rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                :disabled="postsLoading"
                placeholder="表示名 (任意)"
              >
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  :disabled="postsLoading"
                  @click="cancelEditPost"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  :disabled="postsLoading"
                  @click="handleUpdatePost"
                >
                  更新
                </button>
              </div>
            </div>
            <p v-else class="whitespace-pre-wrap text-slate-700">
              {{ post.body }}
            </p>

            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-sm">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="text-blue-600 hover:underline"
                  @click="toggleComments(post.id)"
                >
                  コメント ({{ commentsForPost(post.id).length }})
                </button>
              </div>
              <div class="flex items-center gap-2" v-if="canManagePost(post)">
                <button
                  type="button"
                  class="text-slate-500 hover:text-slate-700"
                  @click="startEditPost(post)"
                >
                  編集
                </button>
                <button
                  type="button"
                  class="text-red-500 hover:text-red-600"
                  @click="handleDeletePost(post)"
                >
                  削除
                </button>
              </div>
            </div>

            <div
              v-if="expandedPosts[post.id]"
              class="flex flex-col gap-4 rounded-md bg-slate-50 p-4"
            >
              <div class="flex flex-col gap-4">
                <p v-if="commentsError" class="text-sm text-red-600">
                  {{ commentsError }}
                </p>
                <ul class="flex flex-col gap-3">
                  <li
                    v-for="comment in commentsForPost(post.id)"
                    :key="comment.id"
                    class="rounded-md bg-white p-3 shadow-sm ring-1 ring-slate-200"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="space-y-1">
                        <p class="text-sm text-slate-500">
                          {{ comment.nickname || '匿名' }} · {{ formatDate(comment.updatedAt ?? comment.createdAt) }}
                        </p>
                        <div v-if="editingComment && editingComment.commentId === comment.id" class="flex flex-col gap-2">
                          <textarea
                            v-model="editingComment.body"
                            rows="3"
                            class="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            :disabled="commentsLoading"
                          />
                          <input
                            v-model="editingComment.nickname"
                            type="text"
                            class="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            :disabled="commentsLoading"
                            placeholder="表示名 (任意)"
                          >
                          <div class="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              class="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                              :disabled="commentsLoading"
                              @click="cancelEditComment"
                            >
                              キャンセル
                            </button>
                            <button
                              type="button"
                              class="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                              :disabled="commentsLoading"
                              @click="handleUpdateComment"
                            >
                              更新
                            </button>
                          </div>
                        </div>
                        <p v-else class="whitespace-pre-wrap text-sm text-slate-700">
                          {{ comment.body }}
                        </p>
                      </div>
                      <div v-if="canManageComment(comment)" class="flex flex-col items-end gap-1 text-xs text-slate-500">
                        <button
                          type="button"
                          class="text-blue-600 hover:underline"
                          @click="startEditComment(post.id, comment)"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          class="text-red-500 hover:text-red-600"
                          @click="handleDeleteComment(comment)"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </li>
                  <li v-if="commentsForPost(post.id).length === 0" class="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                    まだコメントがありません。
                  </li>
                </ul>
              </div>

              <form class="flex flex-col gap-3" @submit.prevent="handleCreateComment(post.id)">
                <textarea
                  v-model="ensureCommentDraft(post.id).body"
                  rows="3"
                  placeholder="コメントを入力してください"
                  class="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  :disabled="commentsLoading"
                />
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <input
                    v-model="ensureCommentDraft(post.id).nickname"
                    type="text"
                    placeholder="表示名 (任意)"
                    class="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:w-52"
                    :disabled="commentsLoading"
                  >
                  <button
                    type="submit"
                    class="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    :disabled="commentsLoading"
                  >
                    コメントを投稿
                  </button>
                </div>
              </form>
            </div>
          </article>
        </li>
      </ul>
    </section>
  </main>
</template>
