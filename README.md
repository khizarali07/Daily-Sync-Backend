# DailySync Backend

Backend API for DailySync AI - A Life Operating System

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

Edit `.env` and set your PostgreSQL connection string and JWT secret.

AI provider selection is controlled by env:

- `AI_PROVIDER=gemini` to use Google Gemini
- `AI_PROVIDER=lmstudio` to use your local LM Studio server

For Gemini mode, set:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional, defaults to `gemini-flash-latest`)

For LM Studio mode, set:

- `LMSTUDIO_BASE_URL` (example: `http://127.0.0.1:1500/v1`)
- `LMSTUDIO_MODEL` (exact loaded model id)
- `LMSTUDIO_API_KEY` (optional unless your LM Studio server requires auth)

3. Run Prisma migrations:

```bash
npm run prisma:migrate
```

4. Generate Prisma Client:

```bash
npm run prisma:generate
```

5. Start the development server:

```bash
npm run dev
```

The API will be available at `http://localhost:5000`

## 📚 API Documentation

**Swagger UI is available at: http://localhost:5000/api-docs**

Complete interactive API documentation with:

- All endpoints documented
- Request/response schemas
- Try it out functionality
- JWT Bearer token authentication support

See [SWAGGER_TESTING_GUIDE.md](../../daily-syc-docs/agent-docs/guides/SWAGGER_TESTING_GUIDE.md) for detailed testing instructions.

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user and receive OTP
- `POST /api/auth/login` - Login and get JWT token
- `POST /api/auth/verify-email` - Verify email with OTP
- `POST /api/auth/resend-otp` - Resend OTP for email verification
- `POST /api/auth/forgot-password` - Request password reset link
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/change-password` - Change password (requires authentication)
- `GET /api/auth/me` - Get current user info (requires authentication)

### Schedule Management

- `POST /api/schedule/upload` - Upload CSV to create task templates
- `GET /api/schedule/templates` - Get all task templates
- `POST /api/schedule/templates` - Create a single task template
- `PUT /api/schedule/templates/:id` - Update a template
- `DELETE /api/schedule/templates/:id` - Delete a task template
- `DELETE /api/schedule/templates` - Delete all templates

## CSV Format

The CSV file should have these columns:

- `name` (required) - Task name
- `startTime` (required) - Start time in HH:MM format (e.g., "06:00")
- `endTime` (required) - End time in HH:MM format (e.g., "07:00")
- `category` (optional) - Category like "Prayer", "Workout"
- `description` (optional) - Task description
- `daysOfWeek` (optional) - Comma-separated days (e.g., "MON,WED,FRI")

Example:

```csv
name,startTime,endTime,category,description,daysOfWeek
Prayer,06:00,06:20,Spiritual,Morning Prayer,
Workout,07:00,08:00,Fitness,Gym Session,MON,WED,FRI
Study,20:00,21:00,Education,Read Books,
```
