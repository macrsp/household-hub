/// <reference types="@sveltejs/kit" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// household-hub service worker. Its job is narrow on purpose: cache the built
// app shell (JS / CSS / static assets) so the installed PWA loads instantly,
// and stay entirely out of the way of everything dynamic — pages, the API,
// and the SSE stream all go straight to the network so data is never stale.

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `household-hub-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	// Serve only built/static assets from the cache. Pages, /api/* and the SSE
	// stream are left untouched — always fetched fresh from the network.
	if (url.origin === sw.location.origin && ASSETS.includes(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
	}
});

// Web Push (M38). The server sends a payload-less "tickle" push, so there is
// no body to read — show a generic notification. The household member opens
// the app to see what changed.
sw.addEventListener('push', (event) => {
	event.waitUntil(
		sw.registration.showNotification('Household Hub', {
			body: 'New activity in your household conversation.',
			icon: '/icon.svg',
			badge: '/icon.svg',
			tag: 'household-hub-message'
		})
	);
});

// Focus an existing household-hub tab on notification click, or open one.
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			for (const client of clients) {
				if (client.url.includes(sw.location.origin) && 'focus' in client) {
					return client.focus();
				}
			}
			return sw.clients.openWindow('/');
		})
	);
});
