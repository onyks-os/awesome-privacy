// Hono app assembler, the same instance runs on Workers and on Bun
import { cors } from 'hono/cors'
import { apiReference } from '@scalar/hono-api-reference'

import { createStorage } from '@/lib/cache'
import { errorHandler, notFound } from '@/lib/errors'
import { requireBearer } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import { newApp } from '@/lib/openapi'
import type { AppEnv } from '@/types'

import services from '@/routes/public/services'
import categoriesRoute from '@/routes/public/categories'
import searchRoute from '@/routes/public/search'
import stats from '@/routes/public/stats'

import privacy from '@/routes/private/privacy'
import github from '@/routes/private/github'
import ios from '@/routes/private/ios'
import android from '@/routes/private/android'
import discord from '@/routes/private/discord'
import reddit from '@/routes/private/reddit'
import website from '@/routes/private/website'
import security from '@/routes/private/security'

import mcp from '@/routes/mcp'

const buildPublic = () => {
  // Public routes, CORS open, rate limited, cacheable
  const pub = newApp()
  pub.use('*', cors({ origin: '*' }))
  pub.use('*', rateLimit())
  pub.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'public, s-maxage=300')
  })
  pub.route('/', services)
  pub.route('/', categoriesRoute)
  pub.route('/', searchRoute)
  pub.route('/', stats)
  return pub
}

const buildPrivate = () => {
  // Private enrichment routes, bearer auth on every /enrich/* path
  const priv = newApp()
  priv.use('/enrich/*', requireBearer())
  priv.route('/', privacy)
  priv.route('/', github)
  priv.route('/', ios)
  priv.route('/', android)
  priv.route('/', discord)
  priv.route('/', reddit)
  priv.route('/', website)
  priv.route('/', security)
  return priv
}

export const buildApp = () => {
  const app = newApp({ strict: false })

  app.onError(errorHandler)
  app.notFound(notFound)

  // Inject per-request storage backed by KV or in-memory
  app.use('*', async (c, next) => {
    c.set('storage', createStorage(c.env as AppEnv))
    await next()
  })

  app.route('/v1', buildPublic())
  app.route('/v1', buildPrivate())
  app.route('/v1', mcp)

  // OpenAPI document plus Scalar UI
  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'Awesome Privacy API',
      version: '1.0.0',
      description: 'Public + private (enrichment) routes for awesome-privacy data',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Public', description: 'Open, cached, served from the local dataset' },
      {
        name: 'Enrichment',
        description: 'Bearer-auth routes that proxy + cache third-party data',
      },
    ],
  })
  app.get('/docs', apiReference({ spec: { url: '/openapi.json' }, theme: 'purple' }))

  app.get('/', (c) => c.redirect('/docs'))

  return app
}
