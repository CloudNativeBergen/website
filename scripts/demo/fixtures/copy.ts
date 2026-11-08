/**
 * Hand-written demo copy (#2150): fictional people, companies and talks.
 * Every name and company here is invented. Mixed lengths on purpose, so
 * screenshots show wrapping.
 */
export const FIRST = [
  'Ingrid',
  'Kwame',
  'Mei',
  'Lars',
  'Amara',
  'Tomás',
  'Priya',
  'Siv',
  'Yusuf',
  'Hanna',
  'Diego',
  'Aiko',
  'Oluwaseun',
  'Freya',
  'Mateusz',
  'Leila',
  'Sindre',
  'Fatima',
  'Jonas',
  'Thandiwe',
  'Ravi',
  'Astrid',
  'Chen',
  'Noor',
  'Emil',
  'Valentina',
  'Kofi',
  'Ylva',
]
export const LAST = [
  'Haugen',
  'Mensah',
  'Lindqvist',
  'Okafor',
  'Ribeiro',
  'Nakamura',
  'Sandvik',
  'Kowalski',
  'Rahman',
  'Berg',
  'Moreau',
  'Achterberg',
  'Iversen',
  'Castellanos',
  'Dahle',
  'Abara',
  'Takahashi',
  'Solberg',
  'Petrov',
  'Nwosu',
  'Eriksen',
  'Vasquez',
]
export const COMPANIES = [
  'Fjordbyte',
  'Nordlys Systems',
  'Kranvik Cloud',
  'Brygge Data',
  'Sølvpil Labs',
  'Havørn Analytics',
  'Tindra Retail',
  'Ostrea Payments',
  'Bramble Labs',
  'Kestrel Grid',
  'Lyngheim Energy',
  'Polarkode',
  'Strandvik Logistics',
  'Mørkeblå Security',
]
export const ROLES = [
  'Platform Engineer',
  'Staff SRE',
  'Developer Advocate',
  'Principal Engineer',
  'Security Engineer',
  'Engineering Manager',
  'Head of Infrastructure',
  'Software Engineer',
  'Observability Lead',
  'Cloud Architect',
]
export const BIO_TAILS = [
  'Has opinions about YAML.',
  'Spends weekends restoring an old sailboat and weekdays restoring production.',
  'Previously ran on-call for a payments platform that processed a third of the country’s card traffic, and still flinches at pager sounds.',
  'Co-organizes a local Kubernetes meetup.',
  'Writes a newsletter about boring technology that works.',
  'Believes most outages are a documentation problem wearing a disguise.',
  'Maintainer of two small open source operators and one very large backlog.',
  'Teaches an evening course on distributed systems for career changers.',
]

export type TalkCopy = [title: string, abstract: string, topic: string]

export const TALKS: TalkCopy[] = [
  [
    'Shipping on Fridays: what our rollback budget taught us',
    'We stopped banning Friday deploys and started budgeting rollbacks instead. This talk shows the numbers from eighteen months of doing it, the two weekends it went wrong, and the dashboards that convinced management.',
    'delivery',
  ],
  [
    'Five SLOs that were green while users suffered',
    'Every one of our service level objectives was met during our worst quarter. We walk through five SLOs that measured the wrong thing and how we rewrote them around user journeys.',
    'observability',
  ],
  [
    'eBPF for people who do not write kernels',
    'A gentle, demo-heavy introduction to eBPF tooling for application developers.',
    'observability',
  ],
  [
    'Multi-tenant Kubernetes without the tears',
    'Namespaces are not a security boundary, but with the right policies, quotas and admission control they get surprisingly close. A tour of the setup we run for 140 internal teams.',
    'kubernetes',
  ],
  [
    'Supply chain security from commit to cluster, one signature at a time',
    'Signing images is the easy part. We cover provenance attestations, policy enforcement at admission, and what to do when the signing key itself is the incident.',
    'security',
  ],
  [
    'Platform teams are product teams: lessons from three re-orgs',
    'Our platform team was reorganized three times in four years. Each time we learned something about treating developers as customers, and each time we forgot something else.',
    'platform',
  ],
  [
    'Cost dashboards nobody opened, and the one everybody did',
    'We built seven FinOps dashboards. Six were ignored. The seventh changed how teams size their workloads, and it was a single number on a Slack bot.',
    'finops',
  ],
  [
    'GitOps at 400 clusters',
    'What breaks when one repository drives four hundred clusters, and how we split it without losing the audit trail.',
    'delivery',
  ],
  [
    'The pod that would not die',
    'A lightning-length detective story about finalizers.',
    'kubernetes',
  ],
  [
    'Building an internal developer portal people actually use',
    'Our first portal had a beautiful service catalogue and zero weekly users. We rebuilt it around the three tasks developers do every day, and adoption followed within a month.',
    'platform',
  ],
  [
    'OpenTelemetry in a legacy monolith',
    'Instrumenting a fifteen-year-old Java application without a rewrite: auto-instrumentation, manual spans where it matters, and how we kept the overhead below two percent.',
    'observability',
  ],
  [
    'Zero-trust networking with a service mesh you can explain to auditors',
    'Mutual TLS everywhere sounds great until the auditor asks you to prove it. We show the evidence trail we built and the policies that made the audit a one-day affair.',
    'security',
  ],
  [
    'Running Postgres on Kubernetes: two years later',
    'We were told not to. We did it anyway. Here is what the operator handled, what it did not, and the backup restore drill that saved us in March.',
    'data',
  ],
  [
    'Chaos engineering for teams with no spare time',
    'Small, scheduled experiments that fit into a normal sprint, and the three findings that paid for the whole programme.',
    'reliability',
  ],
  [
    'Writing Kubernetes operators in Rust',
    'Why we chose Rust for our operators, how kube-rs compares with controller-runtime, and the compile times we learned to live with.',
    'kubernetes',
  ],
  [
    'Incident reviews without blame or boredom',
    'A facilitation format for post-incident reviews that people want to attend, with templates you can take home.',
    'reliability',
  ],
  [
    'Carbon-aware scheduling in practice',
    'Shifting batch workloads to hours with a cleaner grid mix cut our emissions estimate by a fifth. We show the scheduler extension, the data sources, and the caveats.',
    'sustainability',
  ],
  [
    'Secrets management after the leak',
    'What we changed in the ninety days after a credential ended up in a public repository.',
    'security',
  ],
  [
    'From Helm sprawl to a paved road',
    'Three hundred Helm charts, forty ways to configure a readiness probe. How we consolidated on a small set of golden templates without forcing a migration.',
    'platform',
  ],
  [
    'WebAssembly on the server: hype check',
    'We ran the same service as a container and as a Wasm component for six months. Startup times, memory, debugging and the parts that are not ready yet.',
    'runtime',
  ],
  [
    'Autoscaling that does not wake you up at night',
    'HPA, KEDA and cluster autoscaler tuning lessons from a retail platform with very spiky traffic.',
    'reliability',
  ],
  [
    'Testing infrastructure code like application code',
    'Unit tests for Terraform modules, policy tests for manifests, and ephemeral environments per pull request. What was worth it and what we dropped.',
    'delivery',
  ],
  [
    'The hidden cost of sidecars',
    'Measured overhead of sidecar proxies across 2,000 pods, and what changed when we moved to ambient mode.',
    'networking',
  ],
  [
    'Developer experience metrics that do not lie',
    'DORA metrics are a start. We combine them with survey data and build telemetry to find where developers actually lose time.',
    'platform',
  ],
  [
    'Hands-on: build your first Kubernetes controller',
    'Bring a laptop. In two hours we go from an empty directory to a working controller that reconciles a custom resource, with tests.',
    'kubernetes',
  ],
  [
    'Workshop: observability from scratch with OpenTelemetry',
    'A guided workshop: instrument a small microservice application, ship traces, metrics and logs, and build a dashboard that answers real questions.',
    'observability',
  ],
  [
    'Policy as code with real-world exceptions',
    'Every policy has an exception. How we model them, expire them and report on them without turning the policy engine into a spreadsheet.',
    'security',
  ],
  [
    'Edge clusters on fishing vessels',
    'Running workloads on boats with intermittent satellite links: sync strategies, local-first data, and surviving a winter in the North Sea.',
    'edge',
  ],
  [
    'What we learned migrating 600 services to ARM',
    'The build pipeline changes, the surprising library incompatibilities, and the 34 percent compute saving at the end.',
    'finops',
  ],
  [
    'On-call for a team of four',
    'Sustainable rotations for small teams, honestly.',
    'reliability',
  ],
  [
    'Data pipelines on Kubernetes without losing data',
    'Exactly-once is a lie, but at-least-once with idempotent sinks is achievable. A walk through our streaming platform and the incidents that shaped it.',
    'data',
  ],
  [
    'Accessibility of developer tools',
    'Our CLI and portal were unusable with a screen reader. Fixing that made them better for everyone.',
    'platform',
  ],
  [
    'Debugging distributed systems with exemplars',
    'Linking a latency spike on a dashboard straight to the trace that caused it, and why most setups do not have this yet.',
    'observability',
  ],
  [
    'A year of running AI inference on our own clusters',
    'GPU scheduling, model caching and cost per request compared with a managed API. The answer depended on traffic shape more than anything else.',
    'ai',
  ],
  [
    'Gateway API migration field notes',
    'Moving from Ingress to Gateway API across three clusters, one route at a time.',
    'networking',
  ],
  [
    'How we review architecture without an architecture board',
    'Lightweight decision records, async review and a weekly office hour replaced our monthly approval meeting.',
    'culture',
  ],
  [
    'Immutable infrastructure for stateful workloads',
    'Replacing nodes rather than patching them works fine for stateless pods. For databases and queues it takes a drain strategy, careful disruption budgets and patience.',
    'reliability',
  ],
  [
    'Mentoring juniors on a platform team',
    'What a good first month looks like when your codebase is mostly YAML and your users are other engineers.',
    'culture',
  ],
  [
    'Rate limiting at the edge and in the mesh',
    'Where to put rate limits, how to keep them consistent, and the noisy-neighbour incident that taught us both.',
    'networking',
  ],
  [
    'Backstage plugins we wrote and deleted',
    'Eleven plugins, four survivors, and the criteria we now use before writing a twelfth.',
    'platform',
  ],
  // Past edition.
  [
    'Kubernetes upgrades without fear',
    'A repeatable upgrade process for fleets of clusters, with canary clusters, automated conformance checks and a rollback plan that we actually tested.',
    'kubernetes',
  ],
  [
    'Observability on a startup budget',
    'An open source stack that costs less than the coffee machine.',
    'observability',
  ],
  [
    'Threat modelling for platform teams',
    'A practical, one-hour threat modelling format for internal platforms, applied live to a real (anonymized) architecture.',
    'security',
  ],
  [
    'Service ownership at scale',
    'How a catalogue of 900 services got an owner each, and why the last fifty took longest.',
    'culture',
  ],
  [
    'Serverless containers in production',
    'Scale-to-zero, cold starts and the billing surprises of running request-driven containers for a public sector client.',
    'runtime',
  ],
  [
    'The day DNS took the whole platform down',
    'A blameless walk through a four-hour outage caused by one TTL, and the safeguards we built afterwards.',
    'reliability',
  ],
]

export const REVIEW_COMMENTS = [
  'Clear outline and a strong speaker. Would fit the platform track.',
  'Relevant topic, but the abstract promises more than 25 minutes can hold. Suggest a narrower scope.',
  'Great real-world numbers. I want to see this.',
  'Similar to two other submissions this year; this one has the most concrete takeaways.',
  'Good for beginners. Maybe too introductory for the main track.',
  'The speaker has given this talk at three other conferences; consider a fresher angle.',
  'Strong yes.',
  'Interesting, but I could not tell from the abstract what the audience will be able to do afterwards.',
]

export const FEEDBACK_COMMENTS = [
  'Great live demo, slides were hard to read from the back.',
  'Best talk of the day.',
  'Very practical, I will try this next week.',
  'A bit rushed at the end; would have liked more time for questions.',
  'Too much theory for my taste.',
  'Loved the honesty about what went wrong.',
  'The audio in the room cut out twice, but the content was solid.',
]

export const SPONSOR_BRANDS: [name: string, colour: string][] = [
  ['Nordvind Systems', '#1d4ed8'],
  ['Kestrel Cloud', '#0f766e'],
  ['Lysglimt Data', '#7c3aed'],
  ['Bramble Labs', '#15803d'],
  ['Ostrea Payments', '#be123c'],
  ['Tindra Retail', '#c2410c'],
  ['Polarkode', '#0369a1'],
  ['Lyngheim Energy', '#a16207'],
  ['Mørkeblå Security', '#1e3a8a'],
  ['Strandvik Logistics', '#4d7c0f'],
  ['Havørn Analytics', '#9d174d'],
  ['Sølvpil Labs', '#475569'],
]
