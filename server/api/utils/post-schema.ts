import { z } from 'zod'

export const contentSchema = z.string().trim().min(1, 'content is required')

export const displayNameSchema = z
  .string()
  .optional()
  .nullable()
  .transform((value) => {
    if (value == null) {
      return null
    }
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
