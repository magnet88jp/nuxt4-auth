// composables/useTodos.ts
import { ref } from 'vue'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '~~/amplify/data/resource'

const client = typeof window !== 'undefined' ? generateClient<Schema>() : null

type TodoModel = Schema['Todo']['type']
// 追加: 型を雑に縛りたい場合は union にしておく
type AuthMode = 'userPool' | 'identityPool' | 'apiKey' | 'iam' | undefined

export function useTodos() {
  const todos = ref<TodoModel[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const run = async <T>(handler: () => Promise<T>) => {
    if (!client) return undefined as T | undefined
    loading.value = true
    error.value = null
    try {
      return await handler()
    }
    catch (err) {
      console.error('[Todo] Amplify Data request failed.', err)
      error.value = err instanceof Error ? err.message : 'Unknown error'
      return undefined
    }
    finally {
      loading.value = false
    }
  }

  // ▼ ここを修正：authMode を受け取れるようにする
  const fetchTodos = async (authMode?: AuthMode) => {
    await run(async () => {
      const response = await client!.models.Todo.list({ authMode })
      const byUpdated = (item: TodoModel) => item.updatedAt ?? item.createdAt ?? ''
      todos.value = response.data.sort((a, b) => byUpdated(b).localeCompare(byUpdated(a)))
    })
  }

  const addTodo = async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    await run(async () => {
      const response = await client!.models.Todo.create({ content: trimmed })
      todos.value = [response.data, ...todos.value]
    })
  }

  const toggleTodo = async (todo: TodoModel) => {
    await run(async () => {
      const response = await client!.models.Todo.update({ id: todo.id, isDone: !todo.isDone })
      todos.value = todos.value.map(item => (item.id === todo.id ? response.data : item))
    })
  }

  const deleteTodo = async (todo: TodoModel) => {
    await run(async () => {
      await client!.models.Todo.delete({ id: todo.id })
      todos.value = todos.value.filter(item => item.id !== todo.id)
    })
  }

  return { todos, loading, error, fetchTodos, addTodo, toggleTodo, deleteTodo }
}
