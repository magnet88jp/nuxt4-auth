// composables/useTodos.ts
import { ref } from 'vue'
import { generateClient } from 'aws-amplify/data'
import { fetchAuthSession } from 'aws-amplify/auth'
import { useNuxtApp } from '#imports'
import type { Schema } from '~~/amplify/data/resource'

const client = typeof window !== 'undefined' ? generateClient<Schema>() : null

type TodoModel = Schema['Todo']['type']

export function useTodos() {
  const { $fetch } = useNuxtApp()
  const todos = ref<TodoModel[]>([])
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
      console.error('[Todo] request failed.', err)
      error.value = err instanceof Error ? err.message : 'Unknown error'
      return undefined
    }
    finally {
      loading.value = false
    }
  }

  const fetchTodos = async () => {
    await run(async () => {
      let token: string | null = null
      try {
        const session = await fetchAuthSession()
        token
          = session.tokens?.accessToken?.toString()
          ?? session.tokens?.idToken?.toString()
          ?? null
      }
      catch {
        token = null
      }

      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await $fetch<TodoModel[]>('/api/todos', {
        headers: Object.keys(headers).length ? headers : undefined,
      })

      const byUpdated = (item: TodoModel) => item.updatedAt ?? item.createdAt ?? ''
      todos.value = response.sort((a, b) => byUpdated(b).localeCompare(byUpdated(a)))
    })
  }

  const addTodo = async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    await run(async () => {
      if (!client) {
        throw new Error('Amplify Data client is not available')
      }
      const response = await client.models.Todo.create({ content: trimmed })
      todos.value = [response.data, ...todos.value]
    })
  }

  const toggleTodo = async (todo: TodoModel) => {
    await run(async () => {
      if (!client) {
        throw new Error('Amplify Data client is not available')
      }
      const response = await client.models.Todo.update({ id: todo.id, isDone: !todo.isDone })
      todos.value = todos.value.map(item => (item.id === todo.id ? response.data : item))
    })
  }

  const deleteTodo = async (todo: TodoModel) => {
    await run(async () => {
      if (!client) {
        throw new Error('Amplify Data client is not available')
      }
      await client.models.Todo.delete({ id: todo.id })
      todos.value = todos.value.filter(item => item.id !== todo.id)
    })
  }

  return { todos, loading, error, fetchTodos, addTodo, toggleTodo, deleteTodo }
}
