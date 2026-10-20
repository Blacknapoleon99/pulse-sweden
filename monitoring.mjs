import * as Sentry from '@sentry/node';
export function initializeMonitoring() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({ dsn:process.env.SENTRY_DSN, environment:process.env.APP_ENV || process.env.NODE_ENV || 'development', sendDefaultPii:false,
    beforeSend(event) { delete event.user; delete event.request; delete event.breadcrumbs; delete event.extra; return event; }
  });
}
export function captureServerError(error) { if (process.env.SENTRY_DSN) Sentry.captureException(new Error(error?.code || error?.name || 'SERVER_ERROR')); }
