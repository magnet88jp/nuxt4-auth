<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatDisplayDate } from '../utils/datetime'

const { user, isAuthenticated } = useAuth()
const {
  posts,
  loading,
  error,
  fetchPosts,
  createPost,
  updatePost,
  deletePost,
} = usePosts()

const currentUserId = computed(() => user.value?.userId ?? null)
const isOwner = (ownerId?: string | null) => ownerId && currentUserId.value === ownerId

const newDisplayName = ref('')
const newContent = ref('')
const composerError = ref<string | null>(null)

const editError = ref<string | null>(null)

const editingId = ref<string | null>(null)
const editDisplayName = ref('')
const editContent = ref('')
const hasFetchedPosts = ref(false)

const resetComposer = () => {
  newContent.value = ''
  composerError.value = null
}

const handleCreate = async () => {
  const trimmed = newContent.value.trim()
  if (!trimmed) {
    composerError.value = '本文を入力してください。'
    return
  }
  composerError.value = null
  await createPost({
    content: trimmed,
    displayName: newDisplayName.value.trim() || null,
    authMode: isAuthenticated.value ? undefined : 'identityPool',
  })
  if (!error.value) {
    resetComposer()
  }
}

const startEdit = (postId: string, content: string, displayName?: string | null) => {
  editingId.value = postId
  editContent.value = content
  editDisplayName.value = displayName ?? ''
  editError.value = null
}

const cancelEdit = () => {
  editingId.value = null
  editContent.value = ''
  editDisplayName.value = ''
  editError.value = null
}

const saveEdit = async (postId: string) => {
  if (!editContent.value.trim()) {
    editError.value = '本文を入力してください。'
    return
  }
  editError.value = null
  await updatePost({
    id: postId,
    content: editContent.value,
    displayName: editDisplayName.value.trim() || null,
  })
  if (!error.value) {
    cancelEdit()
  }
}

const handleDelete = async (postId: string) => {
  const target = posts.value.find(post => post.id === postId)
  if (!target) return
  await deletePost(target)
}

watch(
  () => isAuthenticated.value,
  async (authed) => {
    if (hasFetchedPosts.value) {
      return
    }
    hasFetchedPosts.value = true
    await fetchPosts(authed ? undefined : 'identityPool')
  },
  { immediate: true },
)
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-4 py-12">
    <section class="space-y-3">
      <h1 class="text-3xl font-semibold text-slate-900">
        掲示板
      </h1>
      <p class="text-sm leading-relaxed text-slate-600">
        ログインしていなくても投稿できます。投稿の編集・削除は投稿者本人のみが行えます。
      </p>
      <div class="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        <p v-if="isAuthenticated">
          ログイン中のユーザー ID: <span class="font-medium text-slate-700">{{ currentUserId }}</span>
        </p>
        <p v-else>
          未ログインのため匿名投稿として扱われます。
        </p>
      </div>
    </section>

    <section class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 class="text-lg font-semibold text-slate-800">
        新規投稿
      </h2>
      <div class="mt-4 space-y-4">
        <div>
          <label
            class="block text-sm font-medium text-slate-600"
            for="displayName"
          >表示名（任意）</label>
          <input
            id="displayName"
            v-model="newDisplayName"
            type="text"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="匿名"
          >
        </div>
        <div>
          <label
            class="block text-sm font-medium text-slate-600"
            for="content"
          >本文</label>
          <textarea
            id="content"
            v-model="newContent"
            rows="4"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="メッセージを入力してください"
          />
        </div>
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-500">
            投稿は即時に公開されます。
          </p>
          <button
            type="button"
            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            :disabled="loading"
            @click="handleCreate"
          >
            投稿する
          </button>
        </div>
        <p
          v-if="composerError"
          class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600"
        >
          {{ composerError }}
        </p>
        <p
          v-else-if="error"
          class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600"
        >
          {{ error }}
        </p>
      </div>
    </section>

    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-slate-800">
        投稿一覧
      </h2>

      <p
        v-if="loading && posts.length === 0"
        class="text-sm text-slate-500"
      >
        読み込み中...
      </p>

      <p
        v-else-if="posts.length === 0"
        class="text-sm text-slate-500"
      >
        まだ投稿がありません。最初のメッセージを追加しましょう。
      </p>

      <article
        v-for="post in posts"
        :key="post.id"
        class="space-y-3 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200"
      >
        <header class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-2">
            <span class="text-base font-semibold text-slate-800">
              {{ post.displayName || '匿名ユーザー' }}
            </span>
            <span
              v-if="isOwner(post.owner)"
              class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600"
            >
              あなたの投稿
            </span>
          </div>
          <time class="text-xs text-slate-500">
            {{ formatDisplayDate(post.updatedAt || post.createdAt) }}
          </time>
        </header>

        <div
          v-if="editingId === post.id"
          class="space-y-4"
        >
          <div>
            <label
              class="block text-xs font-medium text-slate-500"
              :for="`edit-display-${post.id}`"
            >表示名</label>
            <input
              :id="`edit-display-${post.id}`"
              v-model="editDisplayName"
              type="text"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
          </div>
          <div>
            <label
              class="block text-xs font-medium text-slate-500"
              :for="`edit-content-${post.id}`"
            >本文</label>
            <textarea
              :id="`edit-content-${post.id}`"
              v-model="editContent"
              rows="3"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
              @click="cancelEdit"
            >
              キャンセル
            </button>
            <button
              type="button"
              class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              :disabled="loading"
              @click="saveEdit(post.id)"
            >
              更新
            </button>
          </div>
          <p
            v-if="editError"
            class="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600"
          >
            {{ editError }}
          </p>
        </div>

        <p
          v-else
          class="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700"
        >
          {{ post.content }}
        </p>

        <footer
          v-if="isOwner(post.owner)"
          class="flex items-center gap-3"
        >
          <button
            type="button"
            class="text-xs font-medium text-blue-600 transition hover:text-blue-700"
            @click="startEdit(post.id, post.content, post.displayName)"
          >
            編集
          </button>
          <button
            type="button"
            class="text-xs font-medium text-red-600 transition hover:text-red-700"
            :disabled="loading"
            @click="handleDelete(post.id)"
          >
            削除
          </button>
        </footer>
      </article>
    </section>
  </main>
</template>
