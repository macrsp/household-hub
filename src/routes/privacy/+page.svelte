<svelte:head>
	<title>Privacy Policy — Practice Partner &amp; household-hub</title>
</svelte:head>

<main>
	<p class="back"><a href="/">&larr; back to household-hub</a></p>

	<h1>Privacy Policy</h1>
	<p class="effective">Effective date: May 18, 2026</p>
	<p>
		This Privacy Policy explains how the personal-software services operated by one
		individual at <strong>practicepartner.app</strong> — <strong>Practice Partner</strong>
		and <strong>household-hub</strong> — collect, use, store, share, and protect personal
		information. It covers, in particular, the data these services access through Google
		APIs (Gmail and YouTube) and through SMS text messaging. The separate
		<a href="/sms-terms">SMS Terms of Service</a> describes the text-messaging program
		itself.
	</p>
	<p>
		These are small, privately operated services, not public consumer platforms. They are
		used by a small, known group of people — the members of one household, and individual
		Practice Partner users — and are not marketed or sold to the general public.
	</p>

	<h2>The services this policy covers</h2>
	<ul>
		<li>
			<strong>household-hub</strong> — a household communication relay. It carries
			messages among the members of one household across SMS, email, and a web
			application, so each member can take part on whichever channel they prefer. It also
			offers an optional <strong>household memory</strong> feature that can read a
			connected Gmail account to help the household remember practical facts and dates.
		</li>
		<li>
			<strong>Practice Partner</strong> — a personal practice tool that can, with the
			user's authorization, create and upload practice videos to that user's own YouTube
			channel.
		</li>
	</ul>

	<h2>Information we collect</h2>
	<ul>
		<li>Display names of the people who use the services.</li>
		<li>Mobile phone numbers, for household members who receive messages by SMS.</li>
		<li>Email addresses, for members who receive messages by email.</li>
		<li>The content and timestamps of messages sent through the household relay.</li>
		<li>
			Google account data accessed through Google APIs, only when a user explicitly
			connects their Google account — described in detail in the next section.
		</li>
	</ul>
	<p>
		household-hub has no public sign-up; household members are added by the household's
		operator. Practice Partner users connect their own Google account themselves.
	</p>

	<h2>Google user data</h2>
	<p>
		Some features access data from a user's Google account through Google APIs. This
		happens <strong>only after the user explicitly grants permission</strong> through
		Google's standard consent screen, and access can be withdrawn at any time (see
		<em>Withdrawing access</em> below). The specific scopes and how each is used:
	</p>

	<h3>Gmail — household-hub (scope: <code>gmail.readonly</code>)</h3>
	<p>
		If a household member connects their Gmail account to household-hub's household-memory
		feature, household-hub reads messages from that mailbox for one purpose only: to
		identify practical household facts and dates — for example an appointment time, a
		school notice, or a delivery date — and propose them for the household's shared
		memory.
	</p>
	<ul>
		<li>
			<strong>What is accessed:</strong> the content and metadata of email messages in the
			connected account, read-only. household-hub cannot send, modify, or delete email.
		</li>
		<li>
			<strong>How it is used:</strong> message text is analysed only to extract candidate
			household facts, which are then surfaced to a household member to review and
			confirm. The extracted facts are the user-facing household-memory feature itself;
			Gmail data is not used to build any separate database, dataset, or product.
		</li>
		<li>
			<strong>AI processing:</strong> the analysis is performed by Cloudflare Workers AI,
			a machine-learning service running on Cloudflare's infrastructure. Email text is
			sent to the model for <strong>inference only</strong> — to produce the extracted
			facts — and is processed transiently. Gmail content is <strong>never</strong> used
			to train, fine-tune, or develop any AI or machine-learning model, whether by the
			operator or by the AI provider.
		</li>
		<li>
			<strong>What is stored:</strong> household-hub does <strong>not</strong> store the
			raw contents of email messages. It stores only the short facts extracted from a
			message, and the Google message identifier (so the same message is not processed
			twice). An extracted fact is not visible to the household until a member reviews and
			confirms it.
		</li>
		<li>
			<strong>What is not done:</strong> Gmail data is never used for advertising, never
			sold or rented, and never transferred to anyone except the limited service providers
			needed to operate the feature. No human reads the Gmail content except where the
			account holder has given specific consent, where it is necessary for security or to
			comply with the law, or where the data has been aggregated and anonymised.
		</li>
	</ul>

	<h3>YouTube — Practice Partner</h3>
	<p>
		If a Practice Partner user authorizes it, Practice Partner uses YouTube API Services to
		create and upload practice videos to that user's own YouTube channel, and to read back
		the status of those uploads. Practice Partner accesses only what is needed to perform
		uploads the user has requested; it does not browse, collect, or store other YouTube
		account data, and it does not use YouTube data for advertising or sell it.
	</p>
	<p>
		Because this feature uses YouTube API Services, the user is also subject to the
		<a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer"
			>YouTube Terms of Service</a
		>, and Google's handling of account data is described in the
		<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"
			>Google Privacy Policy</a
		>.
	</p>

	<h3 id="limited-use">Limited Use — Google API Services User Data Policy</h3>
	<p class="emphasis">
		Practice Partner's and household-hub's use and transfer to any other app of information
		received from Google APIs will adhere to the
		<a
			href="https://developers.google.com/terms/api-services-user-data-policy"
			target="_blank"
			rel="noopener noreferrer">Google API Services User Data Policy</a
		>, including the Limited Use requirements. In plain terms: data obtained through Google
		APIs is used only to provide and improve the user-facing features described above; it
		is not transferred or sold except as needed to provide those features, to comply with
		the law, or as part of a merger or acquisition; it is never used for advertising,
		retargeting, or personalised or interest-based ads; it is never used to assess
		credit-worthiness or for lending; it is never transferred or sold to advertising
		platforms, data brokers, or information resellers; it is never used to train,
		fine-tune, or develop AI or machine-learning models; it is never used to build
		databases, datasets, or products beyond the user-facing features described above; and
		it is not read by humans except with the user's explicit consent to view specific
		data, where necessary for security or to comply with the law, or where the data is
		aggregated and anonymised. The operator, and any service providers acting on the
		operator's behalf, are bound by these same requirements.
	</p>

	<h3>Withdrawing access</h3>
	<p>
		A user can revoke a service's access to their Google account at any time from their
		Google account's
		<a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer"
			>third-party access settings</a
		>, or by disconnecting the account inside the app. Revoking access stops all further
		reading of Google data immediately. Facts already confirmed into the household memory
		remain until removed by a household member.
	</p>

	<h2>How we use information</h2>
	<p>
		Information is used solely to operate the services: to relay each household message to
		the other members of the same household, to power the optional AI features (such as
		summaries, search, and household memory), and to perform the YouTube uploads a Practice
		Partner user requests. The services do not use any information for advertising or
		marketing, do not build advertising profiles, and do not track users across other sites
		or services. AI features are provided by Cloudflare Workers AI; message and fact text
		sent to it is processed transiently and is not used to train models.
	</p>

	<h2>SMS / text messaging</h2>
	<p>
		A household member consents to receive SMS messages by completing the opt-in form at
		<a href="/sms-opt-in">household.practicepartner.app/sms-opt-in</a>, where they provide
		their mobile number and explicitly agree to take part. SMS messages relay messages that
		other members of the same household have sent. Message frequency varies with household
		activity. Message and data rates may apply. Reply <strong>STOP</strong> to any message
		to stop receiving SMS messages; reply <strong>HELP</strong> for help. Full details are
		in the <a href="/sms-terms">SMS Terms of Service</a>.
	</p>
	<p class="emphasis">
		No mobile information — including mobile phone numbers and SMS opt-in or consent — is
		sold, rented, or shared with any third party or affiliate for marketing or promotional
		purposes. SMS opt-in data and consent are not shared with any third party for any
		purpose.
	</p>

	<h2>How information is shared</h2>
	<p>
		The services do not sell or rent personal information. Data is processed only by the
		service providers required to operate the services, each acting on the operator's
		behalf and not permitted to use the data for their own purposes:
	</p>
	<ul>
		<li><strong>Cloudflare</strong> — application hosting, database, and Workers AI.</li>
		<li><strong>Twilio</strong> — SMS delivery.</li>
		<li><strong>Resend</strong> — email delivery.</li>
		<li>
			<strong>Google</strong> — the source of Gmail and YouTube data accessed with the
			user's permission; Google is not sent personal information beyond what its APIs
			require to authenticate the user and perform the requested action.
		</li>
	</ul>
	<p>
		These providers receive only what is needed to perform their function. Mobile opt-in
		and consent data is not shared with any third party. Data obtained from Google APIs is
		not shared with any third party except these providers, and only to operate the
		features described above.
	</p>

	<h2>Data security</h2>
	<p>
		The Services apply the following measures to protect personal information, including
		sensitive data and data obtained through Google APIs:
	</p>
	<ul>
		<li>
			All traffic between users, the Services, and Google's APIs is encrypted in transit
			using HTTPS / TLS.
		</li>
		<li>
			Data is stored in Cloudflare's managed database and is reachable only by the
			Services and the service providers listed above, each acting on the operator's
			behalf.
		</li>
		<li>
			The OAuth access and refresh tokens for a connected Google account are encrypted at
			rest, are never shown in the app interface, and are never written to logs.
		</li>
		<li>
			The raw contents of Gmail messages are never stored — only the short facts a
			household member reviews and confirms are kept.
		</li>
		<li>
			The household-memory and Gmail-connection features are restricted to adult
			household members.
		</li>
		<li>
			When a user disconnects a Google account, the stored tokens for that account are
			deleted and all further access to that account stops immediately.
		</li>
	</ul>

	<h2>Data retention and deletion</h2>
	<p>
		Messages, household-memory facts, and member records are kept for as long as the
		service remains in use. The raw contents of Gmail messages are not retained at all —
		only the short confirmed facts extracted from them, and a Google message identifier
		used to avoid processing the same message twice. A user may request deletion of their
		personal information, message history, connected-account records, and extracted facts
		at any time by contacting the operator at the address below; such requests are
		honoured promptly, and disconnecting a Google account immediately deletes that
		account's stored tokens.
	</p>

	<h2>Opting out and disconnecting</h2>
	<p>
		Reply <strong>STOP</strong> to any SMS message to stop receiving texts. Reply
		<strong>HELP</strong> for help. To disconnect a Google account, use the in-app
		disconnect control or your
		<a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer"
			>Google account permissions page</a
		>. To be removed from a service entirely, contact the operator.
	</p>

	<h2>Children</h2>
	<p>
		These are privately operated, household-scale tools, not services directed at or
		marketed to children. A household's operator decides who is added to household-hub. The
		household-memory and Gmail-connection features are restricted to adult household
		members.
	</p>

	<h2>Changes to this policy</h2>
	<p>
		If this policy changes, the effective date above is updated and the revised policy is
		posted at this address. Material changes affecting how Google user data is handled will
		be reflected here before the change takes effect.
	</p>

	<h2>Contact</h2>
	<p>
		Questions, or requests to remove information, may be sent to
		<a href="mailto:help@practicepartner.app">help@practicepartner.app</a>.
	</p>

	<hr />

	<p>
		The text-messaging program — message types, frequency, cost, HELP and STOP
		instructions, and how to opt in — is described in the separate
		<a href="/sms-terms">SMS Terms of Service</a>.
	</p>
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
		max-width: 680px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		background: var(--surface);
		line-height: 1.55;
	}

	.back {
		font-size: 0.85rem;
	}

	h1 {
		font-size: 1.4rem;
		margin: 0.5rem 0 0.25rem;
	}

	.effective {
		color: var(--dim);
		font-size: 0.85rem;
		margin-top: 0;
	}

	h2 {
		font-size: 1.05rem;
		margin: 1.6rem 0 0.4rem;
	}

	h3 {
		font-size: 0.95rem;
		margin: 1.1rem 0 0.3rem;
	}

	code {
		font-size: 0.85em;
		background: var(--raised);
		padding: 0.05rem 0.3rem;
		border-radius: 0.25rem;
	}

	.emphasis {
		background: var(--raised);
		border-left: 3px solid var(--accent);
		padding: 0.6rem 0.8rem;
		font-weight: 500;
	}

	hr {
		margin: 2rem 0;
		border: none;
		border-top: 1px solid var(--border);
	}

	a {
		color: var(--accent);
	}
</style>
