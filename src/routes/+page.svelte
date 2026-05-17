<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { DELIVERY_PREFERENCES } from '$lib/preferences';

	interface Person {
		id: string;
		display_name: string;
	}
	interface Conversation {
		id: string;
		name: string;
		slug: string;
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
	let listEl: HTMLElement | undefined = $state();
	// Live message stream for the active conversation (Server-Sent Events).
	let stream: EventSource | undefined;

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
		} catch {
			// transient
		}
	}

	// Append one message, de-duplicating by id — the stream re-sends the
	// recent backlog on connect, and a sent message is added optimistically.
	function addMessage(message: Message) {
		if (messages.some((m) => m.id === message.id)) return;
		messages = [...messages, message];
		tick().then(() => listEl?.scrollTo({ top: listEl?.scrollHeight ?? 0 }));
	}

	// Open a Server-Sent Events stream for the active conversation. The
	// endpoint emits the recent backlog on connect, then each new message as
	// it arrives — no client-side polling. EventSource reconnects on its own.
	function openStream() {
		stream?.close();
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
		openStream();
		loadPrefs();
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
		} catch {
			errorText = 'Could not send — network error.';
		} finally {
			sending = false;
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
		loadPeople();
		loadConversations();
		openStream();
		return () => stream?.close();
	});
</script>

<svelte:head>
	<title>Household Hub</title>
</svelte:head>

<main>
	<header>
		<h1>Household Hub</h1>
		<nav class="conversations" aria-label="Conversations">
			{#each conversations as conversation (conversation.id)}
				<button
					type="button"
					class="conv-tab"
					class:active={conversation.slug === activeSlug}
					aria-current={conversation.slug === activeSlug ? 'true' : undefined}
					onclick={() => selectConversation(conversation.slug)}
				>
					#{conversation.slug}
				</button>
			{/each}
		</nav>
	</header>

	<section class="messages" bind:this={listEl} aria-live="polite">
		{#if messages.length === 0}
			<p class="empty">No messages in #{activeSlug} yet. Say hello below.</p>
		{:else}
			{#each messages as message (message.id)}
				<article class="message">
					<div class="meta">
						<span class="author">{message.author_name}</span>
						<span class="transport" title="arrived via {message.source_transport}">
							{message.source_transport}
						</span>
						<span class="time">{formatTime(message.created_at)}</span>
					</div>
					<p class="body">{message.body}</p>
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
				</article>
			{/each}
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
		<a href="/privacy">Privacy &amp; SMS terms</a>
	</footer>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #f4f4f5;
		font-family:
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		color: #18181b;
	}

	main {
		max-width: 640px;
		margin: 0 auto;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: #ffffff;
	}

	header {
		padding: 1rem 1.25rem 0.5rem;
		border-bottom: 1px solid #e4e4e7;
	}

	h1 {
		margin: 0;
		font-size: 1.25rem;
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
		border: 1px solid #d4d4d8;
		border-radius: 999px;
		background: #ffffff;
		color: #52525b;
		cursor: pointer;
	}

	.conv-tab.active {
		background: #2563eb;
		border-color: #2563eb;
		color: #ffffff;
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
		color: #a1a1aa;
		text-align: center;
		margin-top: 2rem;
	}

	.message {
		background: #fafafa;
		border: 1px solid #e4e4e7;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
	}

	.meta {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.author {
		font-weight: 600;
		color: #18181b;
	}

	.transport {
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-size: 0.6rem;
		background: #e4e4e7;
		color: #52525b;
		padding: 0.05rem 0.35rem;
		border-radius: 0.25rem;
	}

	.time {
		color: #a1a1aa;
		margin-left: auto;
	}

	.body {
		margin: 0.25rem 0 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.receipt {
		margin: 0.3rem 0 0;
		font-size: 0.68rem;
		color: #a1a1aa;
	}

	.prefs {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.5rem 1.25rem;
		border-top: 1px solid #e4e4e7;
		font-size: 0.8rem;
		color: #52525b;
		background: #fafafa;
	}

	.prefs-label {
		font-weight: 600;
	}

	.composer {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		border-top: 1px solid #e4e4e7;
	}

	select,
	input,
	button {
		font: inherit;
		border: 1px solid #d4d4d8;
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
		background: #2563eb;
		color: #ffffff;
		border-color: #2563eb;
		cursor: pointer;
		padding-inline: 1rem;
	}

	.composer button:disabled {
		background: #a1a1aa;
		border-color: #a1a1aa;
		cursor: not-allowed;
	}

	.error {
		margin: 0;
		padding: 0 1.25rem 0.75rem;
		color: #dc2626;
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
		color: #a1a1aa;
	}
</style>
