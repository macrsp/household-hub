<script lang="ts">
	import { onMount, tick } from 'svelte';

	interface Person {
		id: string;
		display_name: string;
	}
	interface Message {
		id: string;
		body: string;
		source_transport: string;
		created_at: string;
		author_person_id: string;
		author_name: string;
	}

	// v1 has exactly one conversation; the slug is fixed.
	const CONVERSATION = 'general';
	const POLL_MS = 3000;

	let people = $state<Person[]>([]);
	let messages = $state<Message[]>([]);
	let senderId = $state('');
	let draft = $state('');
	let sending = $state(false);
	let errorText = $state('');
	let listEl: HTMLElement | undefined = $state();

	async function loadPeople() {
		try {
			const res = await fetch('/api/people');
			if (!res.ok) return;
			people = await res.json();
			if (!senderId && people.length > 0) senderId = people[0].id;
		} catch {
			// transient — the 3s poll will recover
		}
	}

	async function loadMessages() {
		try {
			const res = await fetch(`/api/conversations/${CONVERSATION}/messages`);
			if (!res.ok) return;
			const next: Message[] = await res.json();
			const grew = next.length > messages.length;
			messages = next;
			if (grew) {
				await tick();
				listEl?.scrollTo({ top: listEl.scrollHeight });
			}
		} catch {
			// transient — the 3s poll will recover
		}
	}

	async function send() {
		const body = draft.trim();
		if (body === '' || senderId === '' || sending) return;
		sending = true;
		errorText = '';
		try {
			const res = await fetch(`/api/conversations/${CONVERSATION}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ authorPersonId: senderId, body })
			});
			if (!res.ok) {
				errorText = `Could not send (HTTP ${res.status}).`;
				return;
			}
			draft = '';
			await loadMessages();
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
		loadMessages();
		const timer = setInterval(loadMessages, POLL_MS);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>Household Hub — General</title>
</svelte:head>

<main>
	<header>
		<h1>Household Hub</h1>
		<p class="subtitle">#general · everyone in one thread, on whichever channel they prefer</p>
	</header>

	<section class="messages" bind:this={listEl} aria-live="polite">
		{#if messages.length === 0}
			<p class="empty">No messages yet. Say hello below.</p>
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
				</article>
			{/each}
		{/if}
	</section>

	<form
		class="composer"
		onsubmit={(e) => {
			e.preventDefault();
			send();
		}}
	>
		<label class="sender">
			<span class="sr-only">Send as</span>
			<select bind:value={senderId}>
				{#each people as person (person.id)}
					<option value={person.id}>{person.display_name}</option>
				{/each}
			</select>
		</label>
		<input
			type="text"
			placeholder="Message the household…"
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
		padding: 1rem 1.25rem 0.75rem;
		border-bottom: 1px solid #e4e4e7;
	}

	h1 {
		margin: 0;
		font-size: 1.25rem;
	}

	.subtitle {
		margin: 0.25rem 0 0;
		font-size: 0.8rem;
		color: #71717a;
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

	input {
		flex: 1;
		min-width: 0;
	}

	button {
		background: #2563eb;
		color: #ffffff;
		border-color: #2563eb;
		cursor: pointer;
		padding-inline: 1rem;
	}

	button:disabled {
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
</style>
