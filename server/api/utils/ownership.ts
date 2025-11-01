import { createError } from 'h3'

export const assertOwnership = (owner: string | null | undefined, userSub: string | null | undefined) => {
  if (!userSub) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (owner && owner !== userSub) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}
