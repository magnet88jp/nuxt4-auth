import { createError } from 'h3'

type ErrorEntry = { message?: string }

const unauthorizedPattern = /missing bearer token|no current user|no federated jwt|token subject is missing|invalid or expired token/i
const forbiddenPattern = /not authorized|unauthorized|forbidden/i

export const collectErrors = (response?: { errors?: ErrorEntry[] }) => {
  return response?.errors?.map(entry => entry?.message).filter(Boolean).join('; ')
}

export const toHttpError = (
  message: string | undefined | null,
  fallback: { statusCode: number, statusMessage: string },
) => {
  if (!message) {
    return createError(fallback)
  }

  if (unauthorizedPattern.test(message)) {
    return createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (forbiddenPattern.test(message)) {
    return createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  return createError(fallback)
}
