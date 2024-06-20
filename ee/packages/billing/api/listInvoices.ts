import { TRPCError } from '@trpc/server'
import { isAdminWriteWorkspaceForbidden } from '@sniper.io/db-rules/isAdminWriteWorkspaceForbidden'
import { env } from '@sniper.io/env'
import { isDefined } from '@sniper.io/lib'
import prisma from '@sniper.io/lib/prisma'
import { User } from '@sniper.io/prisma'
import { Stripe } from 'stripe'

type Props = {
  workspaceId: string
  user: Pick<User, 'email' | 'id'>
}

export const listInvoices = async ({ workspaceId, user }: Props) => {
  if (!env.STRIPE_SECRET_KEY)
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'STRIPE_SECRET_KEY var is missing',
    })
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
    },
    select: {
      stripeId: true,
      members: {
        select: {
          userId: true,
          role: true,
        },
      },
    },
  })
  if (!workspace?.stripeId || isAdminWriteWorkspaceForbidden(workspace, user))
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Workspace not found',
    })
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2022-11-15',
  })
  const invoices = await stripe.invoices.list({
    customer: workspace.stripeId,
    limit: 50,
  })
  return {
    invoices: invoices.data
      .filter(
        (invoice) => isDefined(invoice.invoice_pdf) && isDefined(invoice.id)
      )
      .map((invoice) => ({
        id: invoice.number as string,
        url: invoice.invoice_pdf as string,
        amount: invoice.subtotal,
        currency: invoice.currency,
        date: invoice.status_transitions.paid_at,
      })),
  }
}
