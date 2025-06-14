# Cloud Native Bergen

Official website for Cloud Native Bergen and Cloud Native Day Bergen.

## Getting started

To get started with this template, first install the npm dependencies:

```bash
npm install
```

Next, run the development server:

```bash
npm run dev
```

Finally, open [http://localhost:3000](http://localhost:3000) in your browser to view the website.

## Development Setup

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
npm run format
```

To check for linting issues:

```bash
npm run lint
```

To run TypeScript type checking:

```bash
npm run typecheck
```

## Sanity

Install the Sanity CLI:

```bash
npm install --global sanity@latest
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

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.

## Learn more

To learn more about the technologies used in this site template, see the following resources:

- [Tailwind CSS](https://tailwindcss.com/docs) - the official Tailwind CSS documentation
- [Next.js](https://nextjs.org/docs) - the official Next.js documentation
- [Headless UI](https://headlessui.dev) - the official Headless UI documentation
