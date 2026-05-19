<script lang="ts">
	import { onMount } from 'svelte';

	interface Endpoint {
		id: string;
		type: string;
		address: string;
	}
	interface Person {
		id: string;
		display_name: string;
		role: string;
		endpoints: Endpoint[];
	}

	// The accepted endpoint transports. The canonical declaration is
	// ENDPOINT_TYPES in src/lib/server/db.ts, which the API route validates
	// against; this list only populates the picker.
	const ENDPOINT_TYPES = ['sms', 'email', 'app'];

	let people = $state<Person[]>([]);
	let errorText = $state('');
	let newPersonName = $state('');
	let editingPersonId = $state('');
	let renameValue = $state('');
	let addEndpointFor = $state('');
	let newEndpointType = $state('sms');
	let newEndpointAddress = $state('');
	// AI household digest (M61): a "what's new" summary across all conversations.
	let digestText = $state('');
	let digestError = $state('');
	let digestLoading = $state(false);
	let digestShown = $state(false);
	// Household memory (M72): ask the knowledge graph a plain-language question.
	// Adult-only, so the asker is chosen from the adult members.
	let memoryPersonId = $state('');
	let memoryQuestion = $state('');
	let memoryAnswer = $state('');
	let memoryError = $state('');
	let memoryLoading = $state(false);
	const adults = $derived(people.filter((p) => p.role === 'adult'));
	$effect(() => {
		if (memoryPersonId === '' && adults.length > 0) memoryPersonId = adults[0].id;
	});
	// Facts the AI proposed (M73), awaiting a member's confirm/reject.
	interface ProposedFact {
		id: string;
		predicate: string;
		object_text: string | null;
		object_name: string | null;
		subject_name: string;
	}
	let proposedFacts = $state<ProposedFact[]>([]);
	$effect(() => {
		if (memoryPersonId !== '') loadProposed();
	});

	async function load() {
		try {
			const res = await fetch('/api/people');
			if (res.ok) people = await res.json();
		} catch {
			errorText = 'Could not load the household — network error.';
		}
	}

	async function addPerson() {
		const displayName = newPersonName.trim();
		if (displayName === '') return;
		errorText = '';
		try {
			const res = await fetch('/api/people', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ displayName })
			});
			if (!res.ok) {
				errorText = `Could not add the member (HTTP ${res.status}).`;
				return;
			}
			newPersonName = '';
			await load();
		} catch {
			errorText = 'Could not add the member — network error.';
		}
	}

	function startRename(person: Person) {
		editingPersonId = person.id;
		renameValue = person.display_name;
	}

	async function saveRename(person: Person) {
		const displayName = renameValue.trim();
		if (displayName === '' || displayName === person.display_name) {
			editingPersonId = '';
			return;
		}
		errorText = '';
		try {
			const res = await fetch(`/api/people/${person.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ displayName })
			});
			if (!res.ok) {
				errorText = `Could not rename (HTTP ${res.status}).`;
				return;
			}
			editingPersonId = '';
			await load();
		} catch {
			errorText = 'Could not rename — network error.';
		}
	}

	async function addEndpoint(person: Person) {
		const address = newEndpointAddress.trim();
		if (address === '') return;
		errorText = '';
		try {
			const res = await fetch(`/api/people/${person.id}/endpoints`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ type: newEndpointType, address })
			});
			if (!res.ok) {
				errorText =
					res.status === 409
						? 'That address is already registered to a household member.'
						: `Could not add the endpoint (HTTP ${res.status}).`;
				return;
			}
			newEndpointAddress = '';
			addEndpointFor = '';
			await load();
		} catch {
			errorText = 'Could not add the endpoint — network error.';
		}
	}

	// AI digest (M61): summarise recent activity across every conversation.
	async function loadDigest() {
		digestText = '';
		digestError = '';
		digestShown = false;
		digestLoading = true;
		try {
			const res = await fetch('/api/digest');
			const data = (await res.json().catch(() => null)) as
				| { available?: boolean; digest?: string }
				| null;
			if (res.ok && data?.available) {
				digestText = data.digest ?? '';
				digestShown = true;
			} else {
				digestError = 'A digest isn’t available right now.';
			}
		} catch {
			digestError = 'Could not load a digest — network error.';
		} finally {
			digestLoading = false;
		}
	}

	// Household memory (M72): ask the knowledge graph a question.
	async function askMemory() {
		const question = memoryQuestion.trim();
		if (question === '' || memoryPersonId === '' || memoryLoading) return;
		memoryAnswer = '';
		memoryError = '';
		memoryLoading = true;
		try {
			const res = await fetch('/api/memory/ask', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ personId: memoryPersonId, question })
			});
			const data = (await res.json().catch(() => null)) as
				| { available?: boolean; answer?: string }
				| null;
			if (res.ok && data?.available && data.answer) {
				memoryAnswer = data.answer;
			} else {
				memoryError = 'The household memory could not answer that right now.';
			}
		} catch {
			memoryError = 'Could not reach the household memory — network error.';
		} finally {
			memoryLoading = false;
		}
	}

	// Household memory (M73): load the facts awaiting review, and confirm or
	// reject one. The asking adult is the reviewer.
	async function loadProposed() {
		if (memoryPersonId === '') return;
		try {
			const res = await fetch(
				`/api/memory/proposed?personId=${encodeURIComponent(memoryPersonId)}`
			);
			if (res.ok) proposedFacts = await res.json();
		} catch {
			// transient — the review list just stays as it was
		}
	}

	async function reviewFact(id: string, action: 'confirm' | 'reject') {
		try {
			const res = await fetch(`/api/memory/facts/${id}/${action}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ personId: memoryPersonId })
			});
			if (res.ok) proposedFacts = proposedFacts.filter((f) => f.id !== id);
		} catch {
			// transient
		}
	}

	onMount(load);
</script>

<svelte:head>
	<title>Household — household-hub</title>
</svelte:head>

<main>
	<p class="back"><a href="/">&larr; back to household-hub</a></p>
	<h1><img class="brand-logo" src="/favicon.png" alt="" />Household members</h1>
	<p class="intro">
		Add the members of your household and the addresses they receive messages at.
		A new member joins every conversation automatically.
	</p>

	<section class="digest">
		<button type="button" class="digest-btn" onclick={loadDigest} disabled={digestLoading}>
			{digestLoading ? 'Summarizing…' : '📋 What’s new across the household'}
		</button>
		{#if digestShown || digestError}
			<div class="digest-body">
				{#if digestError}
					{digestError}
				{:else if digestText === ''}
					Nothing new in the last day.
				{:else}
					{digestText}
				{/if}
			</div>
		{/if}
	</section>

	{#if adults.length > 0}
		<section class="memory">
			<h2 class="memory-title">🧠 Household memory</h2>
			<p class="memory-hint">
				Ask anything the household has saved — the wifi password, a teacher's
				name, when the field trip is. Available to adult members.
			</p>
			<form
				class="memory-ask"
				onsubmit={(e) => {
					e.preventDefault();
					askMemory();
				}}
			>
				<label class="memory-as">
					<span class="sr-only">Ask as</span>
					<select bind:value={memoryPersonId}>
						{#each adults as adult (adult.id)}
							<option value={adult.id}>{adult.display_name}</option>
						{/each}
					</select>
				</label>
				<input
					type="text"
					placeholder="What's the wifi password?"
					bind:value={memoryQuestion}
				/>
				<button type="submit" disabled={memoryLoading || memoryQuestion.trim() === ''}>
					{memoryLoading ? 'Asking…' : 'Ask'}
				</button>
			</form>
			{#if memoryAnswer || memoryError}
				<div class="memory-answer">{memoryError || memoryAnswer}</div>
			{/if}
			{#if proposedFacts.length > 0}
				<div class="memory-review">
					<h3 class="memory-review-title">
						{proposedFacts.length} fact{proposedFacts.length === 1 ? '' : 's'} to review
					</h3>
					<p class="memory-hint">
						The AI noticed these in conversations. Confirm one to make it answerable.
					</p>
					<ul class="memory-review-list">
						{#each proposedFacts as f (f.id)}
							<li class="memory-review-item">
								<span class="memory-review-text">
									<strong>{f.subject_name}</strong> — {f.predicate.replace(/_/g, ' ')}:
									{f.object_text ?? f.object_name}
								</span>
								<span class="memory-review-actions">
									<button type="button" onclick={() => reviewFact(f.id, 'confirm')}>
										Confirm
									</button>
									<button type="button" onclick={() => reviewFact(f.id, 'reject')}>
										Reject
									</button>
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{/if}

	<form
		class="add-person"
		onsubmit={(e) => {
			e.preventDefault();
			addPerson();
		}}
	>
		<input type="text" placeholder="New member's name" bind:value={newPersonName} />
		<button type="submit">Add member</button>
	</form>

	{#if errorText}
		<p class="error" role="alert">{errorText}</p>
	{/if}

	<ul class="people">
		{#each people as person (person.id)}
			<li class="person">
				<div class="person-head">
					{#if editingPersonId === person.id}
						<form
							class="rename"
							onsubmit={(e) => {
								e.preventDefault();
								saveRename(person);
							}}
						>
							<input type="text" bind:value={renameValue} />
							<button type="submit">Save</button>
							<button type="button" onclick={() => (editingPersonId = '')}>Cancel</button>
						</form>
					{:else}
						<span class="person-name">{person.display_name}</span>
						<button type="button" class="link-btn" onclick={() => startRename(person)}>
							Rename
						</button>
					{/if}
				</div>

				<ul class="endpoints">
					{#each person.endpoints as endpoint (endpoint.id)}
						<li>
							<span class="ep-type">{endpoint.type}</span>
							<span class="ep-address">{endpoint.address}</span>
						</li>
					{:else}
						<li class="ep-empty">No endpoints yet.</li>
					{/each}
				</ul>

				{#if addEndpointFor === person.id}
					<form
						class="add-endpoint"
						onsubmit={(e) => {
							e.preventDefault();
							addEndpoint(person);
						}}
					>
						<select bind:value={newEndpointType}>
							{#each ENDPOINT_TYPES as type (type)}
								<option value={type}>{type}</option>
							{/each}
						</select>
						<input
							type="text"
							placeholder={newEndpointType === 'email'
								? 'name@example.com'
								: newEndpointType === 'sms'
									? '+15555550100'
									: 'address'}
							bind:value={newEndpointAddress}
						/>
						<button type="submit">Add</button>
						<button type="button" onclick={() => (addEndpointFor = '')}>Cancel</button>
					</form>
				{:else}
					<button
						type="button"
						class="link-btn"
						onclick={() => {
							addEndpointFor = person.id;
							newEndpointAddress = '';
						}}
					>
						+ Add endpoint
					</button>
				{/if}
			</li>
		{/each}
	</ul>
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
		max-width: 600px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		background: var(--surface);
		line-height: 1.5;
	}

	.back {
		font-size: 0.85rem;
	}

	h1 {
		font-size: 1.4rem;
		margin: 0.5rem 0 0.25rem;
	}

	.brand-logo {
		height: 1.5em;
		width: auto;
		vertical-align: -0.34em;
		margin-right: 0.4rem;
	}

	.intro {
		color: var(--muted);
		font-size: 0.9rem;
		margin-top: 0;
	}

	form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.add-person {
		margin: 1rem 0;
	}

	.digest {
		margin: 1rem 0;
	}

	.digest-btn {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	.digest-body {
		margin-top: 0.6rem;
		padding: 0.7rem 0.8rem;
		background: var(--raised, var(--surface));
		border: 1px solid var(--accent);
		border-radius: 0.5rem;
		font-size: 0.88rem;
		white-space: pre-wrap;
	}

	.memory {
		margin: 1.25rem 0;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.memory-title {
		font-size: 1.05rem;
		margin: 0 0 0.2rem;
	}

	.memory-hint {
		color: var(--muted);
		font-size: 0.82rem;
		margin: 0 0 0.6rem;
	}

	.memory-ask {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.memory-ask input {
		flex: 1;
		min-width: 0;
		font-size: 0.9rem;
	}

	.memory-ask button {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	.memory-answer {
		margin-top: 0.6rem;
		padding: 0.7rem 0.8rem;
		background: var(--raised, var(--surface));
		border: 1px solid var(--accent);
		border-radius: 0.5rem;
		font-size: 0.88rem;
		white-space: pre-wrap;
	}

	.memory-review {
		margin-top: 0.8rem;
	}

	.memory-review-title {
		font-size: 0.9rem;
		margin: 0 0 0.2rem;
	}

	.memory-review-list {
		list-style: none;
		padding: 0;
		margin: 0.4rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.memory-review-item {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		padding: 0.4rem 0.6rem;
		background: var(--raised, var(--surface));
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		font-size: 0.85rem;
	}

	.memory-review-actions {
		display: flex;
		gap: 0.3rem;
	}

	.memory-review-actions button {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	input,
	select,
	button {
		font: inherit;
		border: 1px solid var(--border-strong);
		border-radius: 0.4rem;
		padding: 0.4rem 0.5rem;
	}

	.add-person input,
	.add-endpoint input,
	.rename input {
		flex: 1;
		min-width: 0;
		font-size: 0.9rem;
	}

	button {
		cursor: pointer;
		font-size: 0.85rem;
	}

	.add-person button[type='submit'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	.people {
		list-style: none;
		padding: 0;
		margin: 1rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.person {
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.6rem 0.75rem;
		background: var(--raised);
	}

	.person-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.person-name {
		font-weight: 600;
	}

	.link-btn {
		border: none;
		background: none;
		padding: 0.1rem 0.2rem;
		color: var(--accent);
		font-size: 0.78rem;
		cursor: pointer;
	}

	.endpoints {
		list-style: none;
		padding: 0;
		margin: 0.4rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.85rem;
	}

	.ep-type {
		display: inline-block;
		min-width: 3.2rem;
		text-transform: uppercase;
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		color: var(--muted);
	}

	.ep-empty {
		color: var(--faint);
		font-style: italic;
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
	}

	a {
		color: var(--accent);
	}
</style>
