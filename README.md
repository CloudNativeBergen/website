# Cloud Native Bergen

Official website for Cloud Native Bergen and Cloud Native Day Bergen.

## Getting started

To get started with this template, first install the pnpm dependencies:

```bash
pnpm install
```

Next, run the development server:

```bash
pnpm run dev
```

Finally, open [http://localhost:3000](http://localhost:3000) in your browser to view the website.

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

Authentication is handled by [next-auth](https://next-auth.js.org/). To enable authentication, you need to create a `.env.local` file in the root of the project and add the following environment variables:

```bash
NEXTAUTH_SECRET=YOUR_SECRET
```

To generate a secret, you can run the following command:

```bash
openssl rand -base64 32
```

### New providers

To add a new provider, you need to add a new provider in the `lib/auth.ts` file and add the corresponding environment variables to the `.env.local` file.

You also need to update the `app/profile/email/route.ts` file to handle the new provider.

### GitHub provider

```bash
AUTH_GITHUB_ID=YOUR_GITHUB_ID
AUTH_GITHUB_SECRET=YOUR_GITHUB_SECRET
```

## Environment Variables

### Exchange Rate API (Optional)

The travel support system uses real-time exchange rates for currency conversion. To enable this feature:

1. Get a free API key from [ExchangeRate-API.com](https://www.exchangerate-api.com/) (1,500 requests/month free)
2. Add to your `.env.local` file:

   ```bash
   NEXT_PUBLIC_EXCHANGE_RATE_API_KEY=your_api_key_here
   ```

If not configured, the system will use fallback exchange rates. See [docs/EXCHANGE_RATE_API.md](docs/EXCHANGE_RATE_API.md) for detailed configuration.

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
