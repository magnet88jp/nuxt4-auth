# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

### Amplify Setup

Generate the latest Amplify outputs before running the Nuxt app so the Todo data client can connect to DynamoDB:

```bash
npx ampx generate outputs -o public/amplify_outputs.json
```

The command above creates `public/amplify_outputs.json`, which the client-side plugin loads at runtime. Re-run it after backend changes.

> Cognito サインインを有効化するには、`amplify push` 後に Amplify Console や AWS CLI でユーザーを作成し、メールの検証を完了してください。アプリ起動後にその資格情報でログインすると、本人の Todo を DynamoDB に保存できます。

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
