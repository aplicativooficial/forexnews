// Service Worker for Forex News
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCYTZtRcsUuH3Kv-znweZW-XmfmNHDpb5o",
  authDomain: "gen-lang-client-0877834251.firebaseapp.com",
  projectId: "gen-lang-client-0877834251",
  storageBucket: "gen-lang-client-0877834251.firebasestorage.app",
  messagingSenderId: "857051692096",
  appId: "1:857051692096:web:2e3dea5525938a3c41b3a5"
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background Message received', payload);
  
  // High compatibility extraction
  const notification = payload.notification || {};
  const data = payload.data || {};
  
  const title = notification.title || data.title || "Forex News Alert";
  const body = notification.body || data.body || "Nova atualização disponível no terminal.";
  const click_url = data.url || notification.click_action || '/community';

  const notificationOptions = {
    body: body,
    icon: 'https://i.postimg.cc/fby2h1bg/logo-branca2.png',
    badge: 'https://i.postimg.cc/fby2h1bg/logo-branca2.png',
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    data: {
      url: click_url,
      notificationId: data.notificationId || Date.now().toString()
    },
    tag: data.tag || data.notificationId || 'forex-news-alert',
    renotify: true,
    silent: false
  };

  return self.registration.showNotification(title, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
