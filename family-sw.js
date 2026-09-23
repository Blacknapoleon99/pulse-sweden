self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { /* ignore invalid payload */ }
  event.waitUntil(self.registration.showNotification(message.title || 'TryggPuls familjevarning', {
    body: message.body || 'En ny uppdatering finns för din familj.',
    tag: 'tryggpuls-family',
    data: { url: typeof message.url === 'string' && message.url.startsWith('/#familj') ? message.url : '/#familj' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/#familj'));
});
