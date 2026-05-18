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

	onMount(load);
</script>

<svelte:head>
	<title>Household — household-hub</title>
</svelte:head>

<main>
	<p class="back"><a href="/">&larr; back to household-hub</a></p>
	<h1>Household members</h1>
	<p class="intro">
		Add the members of your household and the addresses they receive messages at.
		A new member joins every conversation automatically.
	</p>

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
