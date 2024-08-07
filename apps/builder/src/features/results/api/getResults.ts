import prisma from '@sniper.io/lib/prisma'
import { authenticatedProcedure } from '@/helpers/server/trpc'
import { TRPCError } from '@trpc/server'
import { resultWithAnswersSchema } from '@sniper.io/schemas'
import { z } from 'zod'
import { isReadSniperForbidden } from '@/features/sniper/helpers/isReadSniperForbidden'
import {
  timeFilterValues,
  defaultTimeFilter,
} from '@/features/analytics/constants'
import {
  parseFromDateFromTimeFilter,
  parseToDateFromTimeFilter,
} from '@/features/analytics/helpers/parseDateFromTimeFilter'

const maxLimit = 100

export const getResults = authenticatedProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/v1/snipers/{sniperId}/results',
      protect: true,
      summary: 'List results ordered by descending creation date',
      tags: ['Results'],
    },
  })
  .input(
    z.object({
      sniperId: z
        .string()
        .describe(
          "[Where to find my bot's ID?](../how-to#how-to-find-my-sniperid)"
        ),
      limit: z.coerce.number().min(1).max(maxLimit).default(50),
      cursor: z.string().optional(),
      timeFilter: z.enum(timeFilterValues).default(defaultTimeFilter),
      timeZone: z.string().optional(),
    })
  )
  .output(
    z.object({
      results: z.array(resultWithAnswersSchema),
      nextCursor: z.string().nullish(),
    })
  )
  .query(async ({ input, ctx: { user } }) => {
    const limit = Number(input.limit)
    if (limit < 1 || limit > maxLimit)
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `limit must be between 1 and ${maxLimit}`,
      })
    const { cursor } = input
    const sniper = await prisma.sniper.findUnique({
      where: {
        id: input.sniperId,
      },
      select: {
        id: true,
        groups: true,
        collaborators: {
          select: {
            userId: true,
            type: true,
          },
        },
        workspace: {
          select: {
            isSuspended: true,
            isPastDue: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    })
    if (!sniper || (await isReadSniperForbidden(sniper, user)))
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Sniper not found' })

    const fromDate = parseFromDateFromTimeFilter(
      input.timeFilter,
      input.timeZone
    )
    const toDate = parseToDateFromTimeFilter(input.timeFilter, input.timeZone)

    const results = await prisma.result.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      where: {
        sniperId: sniper.id,
        hasStarted: true,
        isArchived: false,
        createdAt: fromDate
          ? {
              gte: fromDate,
              lte: toDate ?? undefined,
            }
          : undefined,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        answers: {
          select: {
            blockId: true,
            content: true,
            createdAt: true,
          },
        },
        answersV2: {
          select: {
            blockId: true,
            content: true,
            createdAt: true,
          },
        },
      },
    })

    let nextCursor: typeof cursor | undefined
    if (results.length > limit) {
      const nextResult = results.pop()
      nextCursor = nextResult?.id
    }

    return {
      results: z.array(resultWithAnswersSchema).parse(
        results.map((r) => ({
          ...r,
          answers: r.answersV2
            .concat(r.answers)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        }))
      ),
      nextCursor,
    }
  })
