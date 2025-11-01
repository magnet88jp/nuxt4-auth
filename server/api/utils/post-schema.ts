import { nullish, pipe, string, trim, minLength, transform } from 'valibot'

export const contentSchema = pipe(
  string(),
  trim(),
  minLength(1, 'content is required'),
)

export const displayNameSchema = pipe(
  nullish(string()),
  transform(value => {
    if (value == null) {
      return null
    }
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }),
)
