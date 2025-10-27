<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { user, isAuthenticated, loading: authLoading, error: authError, login, logout } = useAuth()
const { todos, loading, error, fetchTodos, addTodo, toggleTodo, deleteTodo } = useTodos()

const newTodo = ref('')
const email = ref('')
const password = ref('')

const hasTodos = computed(() => todos.value.length > 0)
const currentUser = computed(() => user.value)

watch(
  () => isAuthenticated.value,
  async (signedIn) => {
    if (signedIn) {
      await fetchTodos()
    } else {
      todos.value = []
    }
  },
  { immediate: true }
)

const handleSubmit = async () => {
  if (!newTodo.value.trim()) {
    return
  }

  await addTodo(newTodo.value)
  newTodo.value = ''
}

const handleToggle = async (id: string) => {
  const todo = todos.value.find((item) => item.id === id)
  if (!todo) {
    return
  }

  await toggleTodo(todo)
}

const handleDelete = async (id: string) => {
  const todo = todos.value.find((item) => item.id === id)
  if (!todo) {
    return
  }

  await deleteTodo(todo)
}

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
  } catch {
    // エラーメッセージは useAuth 内で処理済み
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-12">
    <section>
      <h1 class="text-3xl font-semibold tracking-tight">Todo リスト</h1>
      <p class="mt-2 text-slate-600">Amplify Data 経由で DynamoDB に保存されたタスクを管理します。</p>
    </section>

    <section class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <template v-if="!isAuthenticated">
        <h2 class="text-xl font-semibold">ログイン</h2>
        <p class="mt-2 text-sm text-slate-500">Amplify Auth (Amazon Cognito) のユーザーでログインしてください。</p>
        <form class="mt-4 flex flex-col gap-4" @submit.prevent="handleLogin">
          <input
            v-model="email"
            type="email"
            placeholder="メールアドレス"
            class="rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            :disabled="authLoading"
            autocomplete="username"
          />
          <input
            v-model="password"
            type="password"
            placeholder="パスワード"
            class="rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            :disabled="authLoading"
            autocomplete="current-password"
          />
          <button
            type="submit"
            class="rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            :disabled="authLoading || !email || !password"
          >
            ログイン
          </button>
        </form>
        <p v-if="authError" class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {{ authError }}
        </p>
      </template>

      <template v-else>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-medium text-slate-500">ログイン中</p>
            <p class="text-base font-semibold text-slate-800">
              {{ currentUser?.signInDetails?.loginId || currentUser?.username }}
            </p>
          </div>
          <button
            type="button"
            class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed"
            :disabled="authLoading"
            @click="handleLogout"
          >
            ログアウト
          </button>
        </div>
        <p v-if="authError" class="mt-4 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
          {{ authError }}
        </p>
      </template>
    </section>

    <section v-if="isAuthenticated" class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <form class="flex flex-col gap-4 sm:flex-row" @submit.prevent="handleSubmit">
        <input
          v-model="newTodo"
          type="text"
          placeholder="新しいタスクを入力"
          class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          :disabled="loading"
        />
        <button
          type="submit"
          class="rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          :disabled="loading || !newTodo.trim()"
        >
          追加
        </button>
      </form>
      <p v-if="error" class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
        {{ error }}
      </p>
      <p v-else-if="loading && !hasTodos" class="mt-4 text-sm text-slate-500">読み込み中...</p>
    </section>

    <section v-if="isAuthenticated" class="space-y-3">
      <article
        v-for="todo in todos"
        :key="todo.id"
        class="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
      >
        <div class="flex items-center gap-3">
          <input
            :id="`todo-${todo.id}`"
            type="checkbox"
            class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            :checked="todo.isDone"
            :disabled="loading"
            @change="handleToggle(todo.id)"
          />
          <label
            :for="`todo-${todo.id}`"
            class="text-base"
            :class="todo.isDone ? 'text-slate-400 line-through' : 'text-slate-800'"
          >
            {{ todo.content }}
          </label>
        </div>
        <button
          type="button"
          class="rounded-md border border-transparent px-3 py-1 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
          :disabled="loading"
          @click="handleDelete(todo.id)"
        >
          削除
        </button>
      </article>

      <p v-if="!hasTodos && !loading" class="text-sm text-slate-500">
        タスクはまだありません。最初のタスクを追加してください。
      </p>
    </section>

    <section v-else class="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
      ログインすると DynamoDB に保存されたタスクを管理できます。
    </section>
  </main>
</template>
