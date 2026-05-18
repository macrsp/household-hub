<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { DELIVERY_PREFERENCES } from '$lib/preferences';
	import { linkify, personHue, initial, dayKey, dayLabel } from '$lib/message-format';
	import { REACTION_EMOJI } from '$lib/reactions';

	interface Person {
		id: string;
		display_name: string;
	}
	interface Conversation {
		id: string;
		name: string;
		slug: string;
		// Timestamp of the newest readable message, or null for an empty
		// thread — compared against the per-device last-viewed time (M23).
		last_message_at?: string | null;
		// Set once the conversation is archived (M27): archived threads are
		// kept out of the tab bar unless the archived list is revealed.
		archived_at?: string | null;
	}
	interface Message {
		id: string;
		body: string;
		source_transport: string;
		created_at: string;
		author_person_id: string;
		author_name: string;
		delivery_total?: number;
		delivery_ok?: number;
		delivery_failed?: number;
		// Soft-deletion (M22): set once the author retracts the message; the
		// server blanks the body and the view shows a tombstone in its place.
		deleted_at?: string | null;
		// Editing (M24): set once the author edits the message; the view shows
		// an "(edited)" marker next to the timestamp.
		edited_at?: string | null;
		// Reactions (M36): per-emoji tallies, who reacted with each.
		reactions?: Array<{ emoji: string; count: number; people: string[] }>;
		// Pinning (M37): set while the message is pinned to the conversation.
		pinned_at?: string | null;
	}
	interface Prefs {
		muted: boolean;
		delivery_preference: string;
	}

	// Friendly labels for the delivery-preference values (the values
	// themselves come from $lib/preferences — the single source of truth).
	const PREF_LABEL: Record<string, string> = {
		all: 'Texts on',
		app_only: 'App only'
	};

	let people = $state<Person[]>([]);
	let conversations = $state<Conversation[]>([]);
	let activeSlug = $state('general');
	let messages = $state<Message[]>([]);
	let senderId = $state('');
	let prefs = $state<Prefs | null>(null);
	let draft = $state('');
	let sending = $state(false);
	let errorText = $state('');
	let loadingOlder = $state(false);
	let noMoreOlder = $state(false);
	let searchInput = $state('');
	let searchMode = $state(false);
	let searchResults = $state<Message[]>([]);
	let lastSearch = $state('');
	let creatingConversation = $state(false);
	let newConvName = $state('');
	// Conversation management (M27): the manage panel for the active thread,
	// the working copy of its name, and whether archived threads are revealed.
	let managingConversation = $state(false);
	let renameInput = $state('');
	let showArchived = $state(false);
	let theme = $state<'auto' | 'light' | 'dark'>('auto');
	// Inline message editing (M24): the id of the message being edited (or '')
	// and the working copy of its text.
	// Reactions (M36): the id of the message whose emoji picker is open, or ''.
	let reactionPickerFor = $state('');
	let editingId = $state('');
	let editDraft = $state('');
	// Per-conversation last-viewed timestamps (slug -> ISO), mirrored from
	// localStorage — drives the unread dot on each conversation tab (M23).
	let readState = $state<Record<string, string>>({});
	// Desktop notifications (M28): the current Notification permission, and the
	// time the live stream connected — messages older than this are backlog.
	let notifyPermission = $state('default');
	// Web Push (M38): whether the server has push configured, and whether this
	// browser is subscribed. `pushPublicKey` is the VAPID key for subscribing.
	let pushAvailable = $state(false);
	let pushSubscribed = $state(false);
	let pushPublicKey = '';
	let streamOpenedAt = '';
	// The list currently on screen — search results when searching, else live.
	const shown = $derived(searchMode ? searchResults : messages);
	// Pinned messages in the active conversation, oldest-first (M37).
	const pinnedMessages = $derived(messages.filter((m) => m.pinned_at && !m.deleted_at));
	// Conversations split by archived state (M27).
	const activeConversations = $derived(conversations.filter((c) => !c.archived_at));
	const archivedConversations = $derived(conversations.filter((c) => c.archived_at));
	const activeConversation = $derived(conversations.find((c) => c.slug === activeSlug));
	let listEl: HTMLElement | undefined = $state();
	// Whether the message list is scrolled to (or near) the newest message —
	// drives the jump-to-latest button and smarter auto-scroll (M29).
	let atBottom = $state(true);
	// Live message stream for the active conversation (Server-Sent Events).
	let stream: EventSource | undefined;
	// How often the conversation list is re-fetched so unread activity in
	// threads other than the active one surfaces without opening them.
	const CONVERSATIONS_REFRESH_MS = 15000;
	let conversationsTimer: ReturnType<typeof setInterval> | undefined;

	async function loadPeople() {
		try {
			const res = await fetch('/api/people');
			if (!res.ok) return;
			people = await res.json();
			if (!senderId && people.length > 0) {
				senderId = people[0].id;
				loadPrefs();
			}
		} catch {
			// transient — the poll recovers
		}
	}

	async function loadConversations() {
		try {
			const res = await fetch('/api/conversations');
			if (!res.ok) return;
			conversations = await res.json();
			if (conversations.length > 0 && !conversations.some((c) => c.slug === activeSlug)) {
				activeSlug = conversations[0].slug;
			}
			// Hydrate the last-viewed time for any conversation not seen yet,
			// then stamp the active thread read — it is on screen right now.
			for (const c of conversations) {
				if (readState[c.slug] !== undefined) continue;
				try {
					const saved = localStorage.getItem(`hh-read-${c.slug}`);
					if (saved) readState = { ...readState, [c.slug]: saved };
				} catch {
					// localStorage unavailable — unread dots simply stay off
				}
			}
			markRead(activeSlug);
		} catch {
			// transient
		}
	}

	// Record that the active device has now viewed a conversation: persist the
	// current time as its last-viewed mark so its unread dot clears.
	function markRead(slug: string) {
		const now = new Date().toISOString();
		readState = { ...readState, [slug]: now };
		try {
			localStorage.setItem(`hh-read-${slug}`, now);
		} catch {
			// localStorage unavailable — the in-memory mark still clears the dot
		}
	}

	// A conversation is unread when it has a readable message newer than this
	// device last viewed it. The active thread is never unread — it is open.
	function isUnread(conversation: Conversation): boolean {
		if (conversation.slug === activeSlug) return false;
		const last = conversation.last_message_at;
		return last != null && last > (readState[conversation.slug] ?? '');
	}

	// Upsert one message by id. A new message is appended (and scrolled to);
	// an id already on screen is merged in place — the stream re-emits a
	// message when its deletion state changes, so this is how a soft-delete
	// from another client turns an existing message into a tombstone.
	function addMessage(message: Message) {
		const idx = messages.findIndex((m) => m.id === message.id);
		if (idx !== -1) {
			messages = messages.map((m, i) => (i === idx ? { ...m, ...message } : m));
			return;
		}
		// Capture the scroll position *before* the list grows: only follow the
		// newest message if the reader was already at the bottom, so a new
		// message never yanks someone reading history downward.
		const wasAtBottom = atBottom;
		messages = [...messages, message];
		// A new message in the thread on screen is read as it arrives.
		markRead(activeSlug);
		maybeNotify(message);
		tick().then(() => {
			if (wasAtBottom) listEl?.scrollTo({ top: listEl?.scrollHeight ?? 0 });
		});
	}

	// Recompute whether the message list is at (or near) its newest message.
	function updateAtBottom() {
		if (!listEl) return;
		atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
	}

	function scrollToLatest() {
		listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' });
	}

	// Open a Server-Sent Events stream for the active conversation. The
	// endpoint emits the recent backlog on connect, then each new message as
	// it arrives — no client-side polling. EventSource reconnects on its own.
	function openStream() {
		stream?.close();
		// Messages already in the conversation are replayed on connect; only
		// messages created after this moment count as "new" for notifications.
		streamOpenedAt = new Date().toISOString();
		stream = new EventSource(`/api/conversations/${activeSlug}/stream`);
		stream.onmessage = (event) => {
			try {
				addMessage(JSON.parse(event.data) as Message);
			} catch {
				// ignore a malformed event
			}
		};
	}

	// The active sender's notification preferences for the active conversation.
	async function loadPrefs() {
		if (senderId === '') {
			prefs = null;
			return;
		}
		try {
			const res = await fetch(`/api/conversations/${activeSlug}/participants/${senderId}`);
			prefs = res.ok ? await res.json() : null;
		} catch {
			prefs = null;
		}
	}

	async function savePrefs(patch: { muted?: boolean; delivery_preference?: string }) {
		if (senderId === '') return;
		try {
			const res = await fetch(`/api/conversations/${activeSlug}/participants/${senderId}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (res.ok) prefs = await res.json();
		} catch {
			// transient
		}
	}

	function selectConversation(slug: string) {
		if (slug === activeSlug) return;
		activeSlug = slug;
		messages = [];
		errorText = '';
		noMoreOlder = false;
		clearSearch();
		atBottom = true;
		openStream();
		loadPrefs();
		markRead(slug);
		// The previous thread's draft was persisted on every keystroke; load
		// the one belonging to the thread now being opened.
		draft = loadDraft(slug);
	}

	// Fetch the page of messages older than the oldest one loaded and prepend
	// them, keeping the viewport stable so the reader doesn't lose their place.
	async function loadOlder() {
		if (loadingOlder || noMoreOlder || messages.length === 0) return;
		loadingOlder = true;
		try {
			const before = messages[0].created_at;
			const res = await fetch(
				`/api/conversations/${activeSlug}/messages?before=${encodeURIComponent(before)}`
			);
			if (!res.ok) return;
			const older: Message[] = await res.json();
			const known = new Set(messages.map((m) => m.id));
			const fresh = older.filter((m) => !known.has(m.id));
			if (fresh.length === 0) {
				noMoreOlder = true;
				return;
			}
			const previousHeight = listEl?.scrollHeight ?? 0;
			messages = [...fresh, ...messages];
			await tick();
			if (listEl) listEl.scrollTop += listEl.scrollHeight - previousHeight;
			if (older.length < 200) noMoreOlder = true;
		} catch {
			// transient
		} finally {
			loadingOlder = false;
		}
	}

	// Search the active conversation's message bodies for the typed term.
	async function runSearch() {
		const q = searchInput.trim();
		if (q === '') {
			clearSearch();
			return;
		}
		try {
			const res = await fetch(
				`/api/conversations/${activeSlug}/messages?q=${encodeURIComponent(q)}`
			);
			if (!res.ok) return;
			searchResults = await res.json();
			lastSearch = q;
			searchMode = true;
		} catch {
			// transient
		}
	}

	function clearSearch() {
		searchMode = false;
		searchResults = [];
		searchInput = '';
		lastSearch = '';
	}

	// Create a new conversation: derive a slug from the name, POST it, switch.
	async function createConversation() {
		const name = newConvName.trim();
		if (name === '') return;
		const slug = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
		if (slug === '') {
			errorText = 'Give the conversation a name with letters or numbers.';
			return;
		}
		try {
			const res = await fetch('/api/conversations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, slug })
			});
			if (!res.ok) {
				errorText =
					res.status === 409
						? 'A conversation with that name already exists.'
						: `Could not create the conversation (HTTP ${res.status}).`;
				return;
			}
			const created = (await res.json()) as Conversation;
			creatingConversation = false;
			newConvName = '';
			errorText = '';
			await loadConversations();
			selectConversation(created.slug);
		} catch {
			errorText = 'Could not create the conversation — network error.';
		}
	}

	// Conversation management (M27): rename and archive the active thread.
	function openManage() {
		renameInput = activeConversation?.name ?? '';
		managingConversation = true;
	}

	function closeManage() {
		managingConversation = false;
	}

	// PATCH the active conversation, then refresh the list. Returns success.
	async function patchConversation(body: { name?: string; archived?: boolean }): Promise<boolean> {
		try {
			const res = await fetch(`/api/conversations/${activeSlug}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				errorText = `Could not update the conversation (HTTP ${res.status}).`;
				return false;
			}
			errorText = '';
			await loadConversations();
			return true;
		} catch {
			errorText = 'Could not update the conversation — network error.';
			return false;
		}
	}

	async function renameConversation() {
		const name = renameInput.trim();
		if (name === '' || name === activeConversation?.name) {
			closeManage();
			return;
		}
		if (await patchConversation({ name })) closeManage();
	}

	// Archive or un-archive the active thread. Archiving the thread currently
	// on screen drops it from the tab bar, so switch to another active one.
	async function toggleArchive() {
		const archiving = !activeConversation?.archived_at;
		if (!(await patchConversation({ archived: archiving }))) return;
		closeManage();
		if (archiving) {
			const next = conversations.find((c) => !c.archived_at);
			if (next) selectConversation(next.slug);
		}
	}

	// Theme: 'auto' follows the OS; 'light' / 'dark' force it via a data-theme
	// attribute on <html>. The choice persists in localStorage.
	function applyTheme() {
		try {
			if (theme === 'auto') delete document.documentElement.dataset.theme;
			else document.documentElement.dataset.theme = theme;
			localStorage.setItem('hh-theme', theme);
		} catch {
			// localStorage unavailable — the in-memory choice still applies
		}
	}

	function cycleTheme() {
		theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
		applyTheme();
	}

	// Per-conversation draft persistence (M26): the unsent composer text is
	// kept in localStorage under hh-draft-<slug>, so switching threads or
	// reloading the page never loses what was typed.
	function saveDraft(slug: string) {
		try {
			if (draft.trim() === '') localStorage.removeItem(`hh-draft-${slug}`);
			else localStorage.setItem(`hh-draft-${slug}`, draft);
		} catch {
			// localStorage unavailable — the in-memory draft still works
		}
	}

	function loadDraft(slug: string): string {
		try {
			return localStorage.getItem(`hh-draft-${slug}`) ?? '';
		} catch {
			return '';
		}
	}

	// Desktop notifications (M28). The whole feature is inert where the
	// Notification API is unavailable.
	function canNotify(): boolean {
		return typeof Notification !== 'undefined';
	}

	async function requestNotifyPermission() {
		if (!canNotify()) return;
		try {
			notifyPermission = await Notification.requestPermission();
		} catch {
			// permission request unavailable — leave the button as-is
		}
	}

	// Web Push (M38). Decode the base64url VAPID key the PushManager wants
	// into an ArrayBuffer-backed Uint8Array (a valid BufferSource).
	function urlBase64ToUint8Array(base64: string) {
		const padding = '='.repeat((4 - (base64.length % 4)) % 4);
		const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
		const raw = atob(normalized);
		const buffer = new ArrayBuffer(raw.length);
		const out = new Uint8Array(buffer);
		for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
		return out;
	}

	// On load: learn whether the server has push configured and whether this
	// browser is already subscribed — drives the "Enable push" button.
	async function initPush() {
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
		try {
			const res = await fetch('/api/push/public-key');
			if (!res.ok) return; // push not configured on the server
			const data = (await res.json()) as { publicKey: string };
			pushPublicKey = data.publicKey;
			pushAvailable = true;
			const registration = await navigator.serviceWorker.ready;
			pushSubscribed = (await registration.pushManager.getSubscription()) !== null;
		} catch {
			// push stays unavailable
		}
	}

	// Subscribe this browser to Web Push and register the subscription.
	async function enablePush() {
		if (senderId === '' || pushPublicKey === '') return;
		errorText = '';
		try {
			if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
				if ((await Notification.requestPermission()) !== 'granted') return;
			}
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(pushPublicKey)
			});
			const res = await fetch('/api/push/subscribe', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ personId: senderId, subscription: subscription.toJSON() })
			});
			if (res.ok) pushSubscribed = true;
			else errorText = `Could not enable push (HTTP ${res.status}).`;
		} catch {
			errorText = 'Could not enable push notifications.';
		}
	}

	// Fire a desktop notification for a genuinely new message from someone
	// else that arrived while the tab is in the background.
	function maybeNotify(message: Message) {
		if (!canNotify() || notifyPermission !== 'granted') return;
		if (!document.hidden) return;
		if (message.author_person_id === senderId) return;
		if (message.created_at <= streamOpenedAt) return;
		try {
			const note = new Notification(`New message in #${activeSlug}`, {
				body: `${message.author_name}: ${message.body}`.slice(0, 140),
				tag: message.id
			});
			note.onclick = () => {
				window.focus();
				note.close();
			};
		} catch {
			// notification construction failed — ignore
		}
	}

	async function send() {
		const body = draft.trim();
		if (body === '' || senderId === '' || sending) return;
		sending = true;
		errorText = '';
		try {
			const res = await fetch(`/api/conversations/${activeSlug}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ authorPersonId: senderId, body })
			});
			if (!res.ok) {
				errorText = `Could not send (HTTP ${res.status}).`;
				return;
			}
			// Show the sent message immediately; the stream also delivers it
			// within a second or so, but addMessage de-dupes by id.
			const created = (await res.json()) as Message;
			const senderName = people.find((p) => p.id === senderId)?.display_name ?? '';
			addMessage({ ...created, author_name: senderName });
			draft = '';
			saveDraft(activeSlug);
		} catch {
			errorText = 'Could not send — network error.';
		} finally {
			sending = false;
		}
	}

	// Soft-delete one of the active sender's own messages. The server stamps
	// deleted_at and keeps the row; the SSE stream propagates the tombstone to
	// other clients, but we also mark it locally so the change is immediate.
	async function deleteMessage(message: Message) {
		if (message.author_person_id !== senderId || message.deleted_at) return;
		if (!confirm('Delete this message? It will be replaced with “Message deleted” for everyone.'))
			return;
		errorText = '';
		try {
			const res = await fetch(`/api/conversations/${activeSlug}/messages/${message.id}`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ personId: senderId })
			});
			if (!res.ok) {
				errorText = `Could not delete (HTTP ${res.status}).`;
				return;
			}
			const tombstone = { deleted_at: new Date().toISOString(), body: '' };
			messages = messages.map((m) => (m.id === message.id ? { ...m, ...tombstone } : m));
			searchResults = searchResults.filter((m) => m.id !== message.id);
		} catch {
			errorText = 'Could not delete — network error.';
		}
	}

	// Open the inline editor for one of the active sender's own messages.
	function startEdit(message: Message) {
		if (message.author_person_id !== senderId || message.deleted_at) return;
		editingId = message.id;
		editDraft = message.body;
	}

	function cancelEdit() {
		editingId = '';
		editDraft = '';
	}

	// Save an edited message body. An unchanged or empty draft just closes the
	// editor; otherwise PATCH the message and update it locally — the SSE
	// stream re-emits it to other clients.
	async function saveEdit(message: Message) {
		const body = editDraft.trim();
		if (body === '' || body === message.body) {
			cancelEdit();
			return;
		}
		errorText = '';
		try {
			const res = await fetch(`/api/conversations/${activeSlug}/messages/${message.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ personId: senderId, body })
			});
			if (!res.ok) {
				errorText = `Could not edit (HTTP ${res.status}).`;
				return;
			}
			const patch = { body, edited_at: new Date().toISOString() };
			messages = messages.map((m) => (m.id === message.id ? { ...m, ...patch } : m));
			searchResults = searchResults.map((m) => (m.id === message.id ? { ...m, ...patch } : m));
			cancelEdit();
		} catch {
			errorText = 'Could not edit — network error.';
		}
	}

	// Reactions (M36): toggle the active sender's emoji reaction on a message.
	// The list is updated optimistically; the SSE stream re-emits the message
	// (its change marker includes a reaction signature) to reconcile.
	async function toggleReaction(message: Message, emoji: string) {
		if (senderId === '') return;
		reactionPickerFor = '';
		messages = messages.map((m) => {
			if (m.id !== message.id) return m;
			const reactions = (m.reactions ?? []).map((r) => ({ ...r, people: [...r.people] }));
			const existing = reactions.find((r) => r.emoji === emoji);
			if (existing) {
				existing.people = existing.people.includes(senderId)
					? existing.people.filter((p) => p !== senderId)
					: [...existing.people, senderId];
				existing.count = existing.people.length;
			} else {
				reactions.push({ emoji, count: 1, people: [senderId] });
			}
			return { ...m, reactions: reactions.filter((r) => r.count > 0) };
		});
		try {
			const res = await fetch(
				`/api/conversations/${activeSlug}/messages/${message.id}/reactions`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ personId: senderId, emoji })
				}
			);
			if (!res.ok) errorText = `Could not react (HTTP ${res.status}).`;
		} catch {
			errorText = 'Could not react — network error.';
		}
	}

	function toggleReactionPicker(messageId: string) {
		reactionPickerFor = reactionPickerFor === messageId ? '' : messageId;
	}

	// Pinning (M37): pin or unpin a message. Optimistic; the SSE stream
	// re-emits the message (its change marker includes pinned_at) to reconcile.
	async function pinMessage(message: Message, pinned: boolean) {
		messages = messages.map((m) =>
			m.id === message.id ? { ...m, pinned_at: pinned ? new Date().toISOString() : null } : m
		);
		try {
			const res = await fetch(`/api/conversations/${activeSlug}/messages/${message.id}/pin`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pinned })
			});
			if (!res.ok) errorText = `Could not ${pinned ? 'pin' : 'unpin'} (HTTP ${res.status}).`;
		} catch {
			errorText = `Could not ${pinned ? 'pin' : 'unpin'} — network error.`;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		// Enter sends; Shift+Enter is a newline.
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			send();
		}
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	onMount(() => {
		try {
			const saved = localStorage.getItem('hh-theme');
			if (saved === 'light' || saved === 'dark' || saved === 'auto') theme = saved;
		} catch {
			// ignore
		}
		if (canNotify()) notifyPermission = Notification.permission;
		initPush();
		draft = loadDraft(activeSlug);
		loadPeople();
		loadConversations();
		openStream();
		conversationsTimer = setInterval(loadConversations, CONVERSATIONS_REFRESH_MS);
		return () => {
			stream?.close();
			if (conversationsTimer) clearInterval(conversationsTimer);
		};
	});
</script>

<svelte:head>
	<title>Household Hub</title>
</svelte:head>

<main>
	<header>
		<div class="titlebar">
			<h1>Household Hub</h1>
			<div class="titlebar-actions">
				{#if pushAvailable && !pushSubscribed}
					<button
						type="button"
						class="theme-toggle"
						onclick={enablePush}
						title="Enable background push notifications"
					>
						🔔 Enable push
					</button>
				{:else if canNotify() && notifyPermission === 'default' && !pushAvailable}
					<button
						type="button"
						class="theme-toggle"
						onclick={requestNotifyPermission}
						title="Enable desktop notifications"
					>
						🔔 Notify
					</button>
				{/if}
				<button type="button" class="theme-toggle" onclick={cycleTheme} title="Switch theme">
					{theme === 'auto' ? 'Auto theme' : theme === 'light' ? '☀ Light' : '🌙 Dark'}
				</button>
			</div>
		</div>
		<nav class="conversations" aria-label="Conversations">
			{#each activeConversations as conversation (conversation.id)}
				<button
					type="button"
					class="conv-tab"
					class:active={conversation.slug === activeSlug}
					aria-current={conversation.slug === activeSlug ? 'true' : undefined}
					onclick={() => selectConversation(conversation.slug)}
				>
					#{conversation.slug}
					{#if isUnread(conversation)}
						<span class="unread-dot" aria-label="unread messages"></span>
					{/if}
				</button>
			{/each}
			{#if showArchived}
				{#each archivedConversations as conversation (conversation.id)}
					<button
						type="button"
						class="conv-tab conv-archived"
						class:active={conversation.slug === activeSlug}
						aria-current={conversation.slug === activeSlug ? 'true' : undefined}
						onclick={() => selectConversation(conversation.slug)}
					>
						#{conversation.slug}
					</button>
				{/each}
			{/if}
			<button
				type="button"
				class="conv-tab conv-new"
				title="New conversation"
				onclick={() => (creatingConversation = true)}
			>
				+
			</button>
			{#if activeConversation}
				<button type="button" class="conv-tab conv-manage" onclick={openManage}>
					Manage
				</button>
			{/if}
			{#if archivedConversations.length > 0}
				<button
					type="button"
					class="conv-tab conv-archived-toggle"
					onclick={() => (showArchived = !showArchived)}
				>
					{showArchived ? 'Hide archived' : `Archived (${archivedConversations.length})`}
				</button>
			{/if}
		</nav>
		{#if creatingConversation}
			<form
				class="new-conv"
				onsubmit={(e) => {
					e.preventDefault();
					createConversation();
				}}
			>
				<input
					type="text"
					placeholder="New conversation name"
					bind:value={newConvName}
					autocomplete="off"
				/>
				<button type="submit">Create</button>
				<button
					type="button"
					onclick={() => {
						creatingConversation = false;
						newConvName = '';
					}}>Cancel</button
				>
			</form>
		{/if}
		{#if managingConversation && activeConversation}
			<form
				class="manage-conv"
				onsubmit={(e) => {
					e.preventDefault();
					renameConversation();
				}}
			>
				<input
					type="text"
					placeholder="Conversation name"
					bind:value={renameInput}
					autocomplete="off"
				/>
				<button type="submit">Rename</button>
				<button type="button" onclick={toggleArchive}>
					{activeConversation.archived_at ? 'Unarchive' : 'Archive'}
				</button>
				<a class="manage-export" href="/api/conversations/{activeSlug}/export" download>
					Export
				</a>
				<button type="button" onclick={closeManage}>Done</button>
			</form>
		{/if}
		<form
			class="search"
			onsubmit={(e) => {
				e.preventDefault();
				runSearch();
			}}
		>
			<input type="search" placeholder="Search #{activeSlug}…" bind:value={searchInput} />
			{#if searchMode}
				<button type="button" onclick={clearSearch}>Clear</button>
			{/if}
		</form>
	</header>

	<section class="messages" bind:this={listEl} aria-live="polite" onscroll={updateAtBottom}>
		{#if !searchMode && pinnedMessages.length > 0}
			<div class="pinned-bar">
				{#each pinnedMessages as p (p.id)}
					<div class="pinned-row">
						<span class="pinned-icon" aria-hidden="true">📌</span>
						<span class="pinned-text"><strong>{p.author_name}:</strong> {p.body}</span>
						<button type="button" class="pinned-unpin" onclick={() => pinMessage(p, false)}>
							Unpin
						</button>
					</div>
				{/each}
			</div>
		{/if}
		{#if searchMode}
			<p class="search-banner">
				{searchResults.length} result{searchResults.length === 1 ? '' : 's'} for “{lastSearch}”
			</p>
		{:else if messages.length > 0 && !noMoreOlder}
			<button type="button" class="load-older" onclick={loadOlder} disabled={loadingOlder}>
				{loadingOlder ? 'Loading…' : 'Load older messages'}
			</button>
		{/if}
		{#if shown.length === 0}
			<p class="empty">
				{searchMode
					? 'No messages match your search.'
					: `No messages in #${activeSlug} yet. Say hello below.`}
			</p>
		{:else}
			{#each shown as message, i (message.id)}
				{#if i === 0 || dayKey(message.created_at) !== dayKey(shown[i - 1].created_at)}
					<div class="day-divider">{dayLabel(message.created_at)}</div>
				{/if}
				<article class="message">
					<div class="meta">
						<span
							class="avatar"
							style="background: hsl({personHue(message.author_person_id)} 55% 45%)"
							aria-hidden="true">{initial(message.author_name)}</span>
						<span class="author" style="color: hsl({personHue(message.author_person_id)} 45% 35%)"
							>{message.author_name}</span
						>
						<span class="transport" title="arrived via {message.source_transport}">
							{message.source_transport}
						</span>
						{#if message.pinned_at && !message.deleted_at}
							<span class="pinned-flag" title="pinned">📌</span>
						{/if}
						<span class="time">{formatTime(message.created_at)}</span>
						{#if message.edited_at && !message.deleted_at}
							<span class="edited" title="edited {formatTime(message.edited_at)}">(edited)</span>
						{/if}
					</div>
					{#if message.deleted_at}
						<p class="body deleted">Message deleted</p>
					{:else if editingId === message.id}
						<form
							class="edit-form"
							onsubmit={(e) => {
								e.preventDefault();
								saveEdit(message);
							}}
						>
							<textarea bind:value={editDraft} rows="2"></textarea>
							<div class="edit-actions">
								<button type="submit">Save</button>
								<button type="button" onclick={cancelEdit}>Cancel</button>
							</div>
						</form>
					{:else}
						<p class="body">{#each linkify(message.body) as seg}{#if seg.link}<a href={seg.href} target="_blank" rel="noopener noreferrer">{seg.value}</a>{:else}{seg.value}{/if}{/each}</p>
						{#if message.author_person_id === senderId && (message.delivery_total ?? 0) > 0}
							<p class="receipt">
								{#if (message.delivery_failed ?? 0) > 0}
									⚠ sent to {message.delivery_ok}, failed for {message.delivery_failed}
								{:else if (message.delivery_ok ?? 0) < (message.delivery_total ?? 0)}
									sending… ({message.delivery_ok}/{message.delivery_total})
								{:else}
									✓ sent to {message.delivery_total}
								{/if}
							</p>
						{/if}
						<div class="reactions">
							{#each message.reactions ?? [] as r (r.emoji)}
								<button
									type="button"
									class="reaction-chip"
									class:mine={r.people.includes(senderId)}
									onclick={() => toggleReaction(message, r.emoji)}
								>
									{r.emoji}
									{r.count}
								</button>
							{/each}
							<button
								type="button"
								class="reaction-add"
								title="Add a reaction"
								onclick={() => toggleReactionPicker(message.id)}
							>
								+
							</button>
							{#if reactionPickerFor === message.id}
								<span class="reaction-picker">
									{#each REACTION_EMOJI as emoji (emoji)}
										<button type="button" onclick={() => toggleReaction(message, emoji)}>
											{emoji}
										</button>
									{/each}
								</span>
							{/if}
						</div>
						<div class="msg-actions">
							<button
								type="button"
								class="action-btn"
								onclick={() => pinMessage(message, !message.pinned_at)}
							>
								{message.pinned_at ? 'Unpin' : 'Pin'}
							</button>
							{#if message.author_person_id === senderId}
								<button type="button" class="action-btn" onclick={() => startEdit(message)}>
									Edit
								</button>
								<button type="button" class="action-btn" onclick={() => deleteMessage(message)}>
									Delete
								</button>
							{/if}
						</div>
					{/if}
				</article>
			{/each}
		{/if}
		{#if !atBottom && !searchMode && shown.length > 0}
			<button type="button" class="jump-latest" onclick={scrollToLatest}>↓ Latest</button>
		{/if}
	</section>

	{#if prefs}
		<div class="prefs">
			<span class="prefs-label">Notifications for this conversation:</span>
			<label>
				<input
					type="checkbox"
					checked={prefs.muted}
					onchange={(e) => savePrefs({ muted: e.currentTarget.checked })}
				/>
				Mute
			</label>
			<select
				value={prefs.delivery_preference}
				onchange={(e) => savePrefs({ delivery_preference: e.currentTarget.value })}
			>
				{#each DELIVERY_PREFERENCES as pref (pref)}
					<option value={pref}>{PREF_LABEL[pref] ?? pref}</option>
				{/each}
			</select>
		</div>
	{/if}

	<form
		class="composer"
		onsubmit={(e) => {
			e.preventDefault();
			send();
		}}
	>
		<label class="sender">
			<span class="sr-only">Send as</span>
			<select bind:value={senderId} onchange={loadPrefs}>
				{#each people as person (person.id)}
					<option value={person.id}>{person.display_name}</option>
				{/each}
			</select>
		</label>
		<input
			type="text"
			placeholder="Message #{activeSlug}…"
			bind:value={draft}
			onkeydown={onKeydown}
			oninput={() => saveDraft(activeSlug)}
			autocomplete="off"
		/>
		<button type="submit" disabled={sending || draft.trim() === '' || senderId === ''}>
			{sending ? 'Sending…' : 'Send'}
		</button>
	</form>
	{#if errorText}
		<p class="error" role="alert">{errorText}</p>
	{/if}
	<footer class="legal">
		<a href="/household">Household</a>
		<span aria-hidden="true">·</span>
		<a href="/privacy">Privacy Policy</a>
		<span aria-hidden="true">·</span>
		<a href="/sms-terms">SMS Terms</a>
	</footer>
</main>

<style>
	:global(body) {
		margin: 0;
		background: var(--bg);
		font-family:
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		color: var(--text);
	}

	main {
		max-width: 640px;
		margin: 0 auto;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--surface);
	}

	header {
		padding: 1rem 1.25rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	h1 {
		margin: 0;
		font-size: 1.25rem;
	}

	.titlebar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.titlebar-actions {
		display: flex;
		gap: 0.4rem;
		flex: none;
	}

	.theme-toggle {
		font: inherit;
		font-size: 0.72rem;
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		color: var(--muted);
		cursor: pointer;
		flex: none;
	}

	.conversations {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.6rem;
		flex-wrap: wrap;
	}

	.conv-tab {
		font: inherit;
		font-size: 0.8rem;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		color: var(--muted);
		cursor: pointer;
	}

	.conv-tab.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	.conv-new {
		font-weight: 700;
	}

	.conv-manage,
	.conv-archived-toggle {
		font-size: 0.72rem;
		color: var(--dim);
	}

	.conv-archived {
		font-style: italic;
		color: var(--faint);
		border-style: dashed;
	}

	.conv-archived.active {
		color: var(--on-accent);
	}

	.unread-dot {
		display: inline-block;
		width: 0.4rem;
		height: 0.4rem;
		margin-left: 0.3rem;
		border-radius: 50%;
		background: var(--accent);
		vertical-align: 0.05rem;
	}

	.new-conv,
	.manage-conv {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.new-conv input,
	.manage-conv input {
		flex: 1;
		min-width: 0;
		font-size: 0.85rem;
	}

	.new-conv button,
	.manage-conv button {
		font-size: 0.8rem;
		cursor: pointer;
	}

	.manage-export {
		font: inherit;
		font-size: 0.8rem;
		padding: 0.5rem;
		border: 1px solid var(--border-strong);
		border-radius: 0.4rem;
		color: var(--accent);
		text-decoration: none;
		cursor: pointer;
	}

	.search {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}

	.search input {
		flex: 1;
		min-width: 0;
		font-size: 0.85rem;
	}

	.search button {
		font-size: 0.8rem;
		background: var(--surface);
		color: var(--muted);
		cursor: pointer;
	}

	.search-banner {
		align-self: center;
		font-size: 0.78rem;
		color: var(--dim);
		margin: 0 0 0.5rem;
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.empty {
		color: var(--faint);
		text-align: center;
		margin-top: 2rem;
	}

	.message {
		background: var(--raised);
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.author {
		font-weight: 600;
	}

	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.15rem;
		height: 1.15rem;
		border-radius: 50%;
		color: var(--on-accent);
		font-size: 0.62rem;
		font-weight: 700;
		flex: none;
	}

	.transport {
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-size: 0.6rem;
		background: var(--border);
		color: var(--muted);
		padding: 0.05rem 0.35rem;
		border-radius: 0.25rem;
	}

	.time {
		color: var(--faint);
		margin-left: auto;
	}

	.body {
		margin: 0.25rem 0 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.body a {
		color: var(--accent);
	}

	.receipt {
		margin: 0.3rem 0 0;
		font-size: 0.68rem;
		color: var(--faint);
	}

	.body.deleted {
		font-style: italic;
		color: var(--faint);
	}

	.edited {
		color: var(--faint);
		font-style: italic;
	}

	.msg-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.35rem;
		margin-top: 0.3rem;
	}

	.action-btn {
		font: inherit;
		font-size: 0.66rem;
		padding: 0.1rem 0.45rem;
		border: 1px solid var(--border);
		border-radius: 0.3rem;
		background: var(--surface);
		color: var(--dim);
		cursor: pointer;
	}

	.reactions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
		margin-top: 0.35rem;
	}

	.reaction-chip {
		font: inherit;
		font-size: 0.72rem;
		padding: 0.05rem 0.4rem;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		color: var(--muted);
		cursor: pointer;
	}

	.reaction-chip.mine {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	.reaction-add {
		font: inherit;
		font-size: 0.72rem;
		line-height: 1;
		padding: 0.1rem 0.4rem;
		border: 1px dashed var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		color: var(--faint);
		cursor: pointer;
	}

	.reaction-picker {
		display: inline-flex;
		gap: 0.15rem;
		padding: 0.1rem 0.25rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--raised);
	}

	.reaction-picker button {
		font-size: 0.95rem;
		line-height: 1;
		padding: 0.1rem 0.2rem;
		border: none;
		background: none;
		cursor: pointer;
	}

	.pinned-bar {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.5rem 0.6rem;
		margin-bottom: 0.5rem;
		background: var(--raised);
		border: 1px solid var(--border);
		border-radius: 0.5rem;
	}

	.pinned-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
	}

	.pinned-icon {
		flex: none;
	}

	.pinned-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
	}

	.pinned-unpin {
		flex: none;
		font: inherit;
		font-size: 0.66rem;
		padding: 0.1rem 0.45rem;
		border: 1px solid var(--border-strong);
		border-radius: 0.3rem;
		background: var(--surface);
		color: var(--dim);
		cursor: pointer;
	}

	.pinned-flag {
		font-size: 0.7rem;
	}

	.edit-form {
		margin-top: 0.25rem;
	}

	.edit-form textarea {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		font: inherit;
		border: 1px solid var(--border-strong);
		border-radius: 0.4rem;
		padding: 0.4rem 0.5rem;
		background: var(--surface);
		color: var(--text);
	}

	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.35rem;
		margin-top: 0.3rem;
	}

	.edit-actions button {
		font-size: 0.72rem;
		padding: 0.2rem 0.6rem;
		cursor: pointer;
	}

	.day-divider {
		align-self: center;
		font-size: 0.68rem;
		color: var(--faint);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0.35rem 0;
	}

	.load-older {
		align-self: center;
		font: inherit;
		font-size: 0.78rem;
		padding: 0.3rem 0.8rem;
		margin-bottom: 0.25rem;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		color: var(--muted);
		cursor: pointer;
	}

	.jump-latest {
		position: sticky;
		bottom: 0.5rem;
		align-self: center;
		font: inherit;
		font-size: 0.78rem;
		padding: 0.35rem 0.9rem;
		border: 1px solid var(--accent);
		border-radius: 999px;
		background: var(--accent);
		color: var(--on-accent);
		cursor: pointer;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
	}

	.load-older:disabled {
		color: var(--faint);
		cursor: default;
	}

	.prefs {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.5rem 1.25rem;
		border-top: 1px solid var(--border);
		font-size: 0.8rem;
		color: var(--muted);
		background: var(--raised);
	}

	.prefs-label {
		font-weight: 600;
	}

	.composer {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		border-top: 1px solid var(--border);
	}

	select,
	input,
	button {
		font: inherit;
		border: 1px solid var(--border-strong);
		border-radius: 0.4rem;
		padding: 0.5rem;
	}

	.prefs select {
		padding: 0.2rem 0.35rem;
		font-size: 0.8rem;
	}

	input {
		flex: 1;
		min-width: 0;
	}

	.composer button {
		background: var(--accent);
		color: var(--on-accent);
		border-color: var(--accent);
		cursor: pointer;
		padding-inline: 1rem;
	}

	.composer button:disabled {
		background: var(--faint);
		border-color: var(--faint);
		cursor: not-allowed;
	}

	.error {
		margin: 0;
		padding: 0 1.25rem 0.75rem;
		color: var(--danger);
		font-size: 0.85rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	.legal {
		padding: 0.5rem 1.25rem 0.75rem;
		font-size: 0.7rem;
		text-align: center;
	}

	.legal a {
		color: var(--faint);
	}
</style>
