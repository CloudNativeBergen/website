# Cloud Native Days Norway

Official website for Cloud Native Days in Norway.

## Getting started

### Prerequisites

This project uses [mise](https://mise.jdx.sh/) for tool management and task running, and [fnox](https://fnox.dev/) for secure secret storage in your local keychain.

Install `mise` (if not already installed):

```bash
curl https://mise.run | sh
```

Install `fnox`:

```bash
brew install fnox
```

### Install dependencies

```bash
mise run install
# equivalent to: pnpm install
```

### Set up secrets

Secrets are stored securely in your OS keychain via `fnox` — no plaintext `.env.local` needed after setup.

All secrets are declared in `fnox.toml`. To populate the keychain for the first time, create a temporary `.env.local` with your secrets and run:

```bash
./scripts/migrate-fnox.sh
rm .env.local  # safe to delete once imported
```

To add or update an individual secret later:

```bash
fnox set MY_SECRET_KEY -- "the value here"
```

To verify what is stored in the keychain:

```bash
fnox list
```

> **Note:** We also maintain committed default `.env`, `.env.test`, and `.env.production` files containing safe non-sensitive defaults (public URLs, feature flags). These exist for CI runners and contributors who don't use `mise`.

### Run the development server

```bash
mise run dev
# equivalent to: fnox exec -- pnpm run dev
```

Finally, open [http://localhost:3000](http://localhost:3000) in your browser to view the website.

### Available mise tasks

| Task                 | Description                                     |
| -------------------- | ----------------------------------------------- |
| `mise run dev`       | Start the development server                    |
| `mise run test`      | Run the test suite (uses test keychain secrets) |
| `mise run check`     | Run all checks: lint, typecheck, format, knip   |
| `mise run build`     | Build the production bundle                     |
| `mise run all`       | Run checks, tests, and build sequentially       |
| `mise run storybook` | Start Storybook                                 |
| `mise run install`   | Install pnpm dependencies                       |

## Development Setup

### Important: Turbopack Configuration

This project uses **Turbopack** for both development and production builds to ensure consistent CSS generation with Tailwind CSS v4. A known incompatibility exists between Turbopack (used in dev) and Webpack (Vercel's default production bundler) that causes Tailwind classes to be missing in production.

**The fix is already in place** via `experimental.turbo: {}` in `next.config.ts`.

### VS Code Configuration

This project includes VS Code workspace settings in `.vscode/settings.json` that automatically configure:

- **Prettier formatting** using the project's `prettier.config.js` settings
- **Format on save** for consistent code style
- **ESLint integration** with auto-fix on save
- **Tailwind CSS IntelliSense** for better development experience

#### Recommended Extensions

The project includes recommended VS Code extensions in `.vscode/extensions.json`:

- **Prettier - Code formatter** (`esbenp.prettier-vscode`)
- **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`)
- **TypeScript and JavaScript Nightly** (`ms-vscode.vscode-typescript-next`)
- **Sanity.io** (`sanity-io.vscode-sanity`)

VS Code will prompt you to install these extensions when you open the workspace.

### Code Style

The project uses **Prettier** for code formatting with these settings:

- Single quotes (`'`) instead of double quotes
- No semicolons
- Tailwind CSS class sorting via `prettier-plugin-tailwindcss`

To format all files manually:

```bash
pnpm run format
```

To check for linting issues:

```bash
pnpm run lint
```

To run TypeScript type checking:

```bash
pnpm run typecheck
```

To run all checks at once (typecheck, lint, knip, format — runs in parallel):

```bash
pnpm run check
```

ESLint and Prettier use `--cache` flags so subsequent runs only process changed files. First run after a clean clone takes ~40s; warm runs take ~5s.

## Git Hooks

This project uses [simple-git-hooks](https://github.com/toplenboren/simple-git-hooks) to run `pnpm run check` and `pnpm run test` before every commit.

After cloning the repo and installing dependencies, activate the hooks:

```bash
pnpm exec simple-git-hooks
```

To skip the hook for a one-off commit:

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "wip"
```

If the hook configuration in `package.json` changes, re-run `pnpm exec simple-git-hooks` to update.

## Sanity

Install the Sanity CLI:

```bash
pnpm install --global sanity@latest
```

Deploy Sanity Studio to Sanity.io

```bash
sanity deploy
```

## Models

Models are defined in `lib/<type>/types.ts` and in `sanity/schemaTypes/<type>.ts` for the representation in Sanity Studio.

## Sanity Migrations

The project includes migration scripts based on Sanity's migration framework that help update content data when schemas change. Migrations are stored in `migrations/`.

### Creating a Migration

To create a new migration, use the Sanity CLI command:

```bash
npx sanity@latest migration create "Replace event type with event format"
```

Replace the text in quotes with a descriptive title for your migration. This will create a new migration folder with a boilerplate script that you can modify.

### Running a Migration

#### Important: Always Backup Your Data First

Before running any migration, export your dataset as a backup:

```bash
# Create a backup of your dataset
npx sanity@latest dataset export production my-backup-filename.tar.gz
```

This gives you a safety net in case anything goes wrong during the migration.

#### Validate Documents Against Schema Changes

After making schema changes, validate your documents against the new schema:

```bash
# Validate documents against schema changes
npx sanity@latest documents validate -y
```

This helps identify any potential issues before running the migration.

After creating a backup and validating documents, run the migration:

```bash
# Run a migration with Sanity CLI
npx sanity@latest migration run add-required-conference-reference-to-talks
```

When prompted, provide your Sanity auth token. The migration will process the documents and report the changes made.

For more details about available migrations and creating new ones, see [Sanity Migrations Documentation](./sanity/migrations/README.md).

### Learning Resources

To learn more about Sanity migrations, check out these resources:

- [Running a Content Migration](https://www.sanity.io/learn/course/handling-schema-changes-confidently/running-a-content-migration)
- [Writing a Content Migration](https://www.sanity.io/learn/course/handling-schema-changes-confidently/writing-a-content-migration)

## Authentication

Authentication is handled by [next-auth](https://next-auth.js.org/). The required secrets are managed via `fnox` in your local keychain (see [Set up secrets](#set-up-secrets) above).

To generate a new `AUTH_SECRET`:

```bash
openssl rand -base64 32 | fnox set AUTH_SECRET --
```

### New providers

To add a new provider, add it to `lib/auth.ts` and store the credentials in the keychain:

```bash
fnox set AUTH_MY_PROVIDER_ID -- "your-id"
fnox set AUTH_MY_PROVIDER_SECRET -- "your-secret"
```

Also declare the new keys in `fnox.toml` under `[secrets]` so other developers know to populate them.

### GitHub provider

```bash
fnox set AUTH_GITHUB_ID -- "your-github-id"
fnox set AUTH_GITHUB_SECRET -- "your-github-secret"
```

## Environment Variables

All environment variables are declared in `fnox.toml` and stored in your OS keychain. The table below lists the key variables and where to get them:

| Variable                                    | Description                     | Where to get it                                                                        |
| ------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                               | NextAuth session secret         | `openssl rand -base64 32`                                                              |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`     | GitHub OAuth                    | [GitHub Developer Settings](https://github.com/settings/developers)                    |
| `AUTH_LINKEDIN_ID` / `AUTH_LINKEDIN_SECRET` | LinkedIn OAuth                  | [LinkedIn Developer Portal](https://www.linkedin.com/developers/)                      |
| `SANITY_API_TOKEN_READ`                     | Sanity read token               | Sanity project settings                                                                |
| `SANITY_API_TOKEN_WRITE`                    | Sanity write token              | Sanity project settings                                                                |
| `RESEND_API_KEY`                            | Email sending (Resend)          | [Resend dashboard](https://resend.com)                                                 |
| `BLOB_READ_WRITE_TOKEN`                     | Vercel Blob storage             | Vercel dashboard → Storage → Blob                                                      |
| `BADGE_ISSUER_RSA_PRIVATE_KEY`              | OpenBadges JWT signing key      | Generate with `openssl genrsa 2048`                                                    |
| `BADGE_ISSUER_RSA_PUBLIC_KEY`               | OpenBadges JWT verification key | Extract from the private key                                                           |
| `NEXT_PUBLIC_EXCHANGE_RATE_API_KEY`         | Exchange rates (optional)       | [ExchangeRate-API.com](https://www.exchangerate-api.com/) (free tier: 1,500 req/month) |

If `NEXT_PUBLIC_EXCHANGE_RATE_API_KEY` is not set, the system uses fallback exchange rates. See [docs/EXCHANGE_RATE_API.md](docs/EXCHANGE_RATE_API.md) for details.

## File Attachments

The project uses a two-tier storage architecture for handling proposal attachments (slides, resources):

- **Temporary Storage**: Vercel Blob (client-side direct upload, bypasses 4.5MB serverless limit)
- **Permanent Storage**: Sanity CMS (asset management)

Files up to 50MB are supported. See [docs/ATTACHMENT_STORAGE.md](docs/ATTACHMENT_STORAGE.md) for detailed architecture documentation.

### Setup

1. Create Vercel Blob store in Vercel Dashboard → Storage → Blob
2. Pull environment variables: `npx vercel env pull .env.local`
3. `BLOB_READ_WRITE_TOKEN` is automatically created

The system includes automatic cleanup of temporary files via daily cron job.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.

## Learn more

To learn more about the technologies used in this site template, see the following resources:

- [Tailwind CSS](https://tailwindcss.com/docs) - the official Tailwind CSS documentation
- [Next.js](https://nextjs.org/docs) - the official Next.js documentation
- [Headless UI](https://headlessui.dev) - the official Headless UI documentation
