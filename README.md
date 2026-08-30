This is an [assistant-ui](https://github.com/assistant-ui/assistant-ui) starter customized with:

- Per-user custom provider settings (`baseUrl`, `apiKey`, `model`)
- Role-based hot-plug skills (dynamic role prompt + skill modules)
- MongoDB persistence via Mongoose

## Getting Started

### 1. Configure Environment Variables

Create a `.env.local` file:

```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MONGODB_URI=mongodb://127.0.0.1:27017/assistant_demo

# Optional defaults if user has no saved provider configuration
DEFAULT_PROVIDER_NAME=openai-compatible
DEFAULT_PROVIDER_BASE_URL=https://api.openai.com/v1
DEFAULT_PROVIDER_MODEL=gpt-5.6-luna
DEFAULT_PROVIDER_API_KEY=
```

Notes:

- `MONGODB_URI` is required.
- If `DEFAULT_PROVIDER_API_KEY` is empty, the server falls back to `OPENAI_API_KEY`.
- If MongoDB has username/password, use either a full `MONGODB_URI` with auth params or split fields (`MONGODB_USERNAME`, `MONGODB_PASSWORD`, etc.).
- For special characters in username/password, prefer split fields so the app can safely URL-encode credentials.
- If both are set: when `MONGODB_URI` has embedded credentials, it wins; otherwise split auth fields are used.

### 2. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 3. Run the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Development

You can start customizing the UI by modifying components in `components/assistant-ui/`.

### Provider Configuration UI

- Click the settings icon next to the upload button in the composer.
- Configure per-user `Provider Name`, `Base URL`, `API Key`, and `Model`.
- Click `Test` to verify provider connectivity.
- Click `Save` to persist settings in MongoDB.

### Role-Based Skill Hot Plug

- In the same settings dialog, select a role.
- The selected role dynamically changes system instructions and active skills for subsequent chat requests.
- Built-in skill modules are loaded on demand from `lib/skills/modules/*`.

### API Endpoints

- `GET /api/settings/provider?userId=...` - get effective provider settings
- `PUT /api/settings/provider` - upsert provider settings
- `POST /api/settings/provider/test` - test provider connectivity
- `GET /api/settings/roles?userId=...` - get current role and available roles
- `PUT /api/settings/roles` - switch current role
- `GET /api/health/db` - verify MongoDB connectivity/auth (returns sanitized connection mode)

To add more assistant-ui components:

```bash
npx assistant-ui add
```

### Key Files

- `app/assistant.tsx` - Sets up the runtime provider
- `app/api/chat/route.ts` - Chat API endpoint with dynamic provider/role resolution
- `components/assistant-ui/thread.tsx` - Chat thread component
- `app/[locale]/settings/provider/page.tsx` - Provider settings page (base URL, key, model, temperature)
- `lib/server-settings.ts` - Provider/role persistence and runtime resolution
- `lib/mongodb.ts` - MongoDB connection helper

### Runtime Data Directories

The following directories are created at runtime (via uploads) and are **not** part of the build bundle:

- `skills/` — Skill packages per role, organized as `skills/{roleId}/{skillId}/`. Accessed server-side via Node.js `fs` module. Not served as static assets.
- `resources/` — RAG reference materials per role, organized as `resources/{roleId}/{resourceId}/`. Same access pattern as `skills/`.

Both directories are listed in `.gitignore` and should not be committed. In production, ensure persistent storage (Docker volume, NFS, etc.) is mounted at the project root so uploads survive restarts.
