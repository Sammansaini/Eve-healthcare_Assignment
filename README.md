# EVE Healthcare API

Backend for patient accounts and the diagnostic catalogue.

Patients can create an account, log in, and read their own profile. Admins can add centres, tests, and the price of a test at a centre. Catalogue reads are public.

## Requirements

- Node.js 18 or newer
- PostgreSQL 14 or newer

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` before starting the server. Do not commit `.env`.

| Variable | Purpose |
| --- | --- |
| `PORT` | Port for the API. Defaults to 3000. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `JWT_SECRET` | Secret used to sign login tokens. Use a long random string. |
| `JWT_EXPIRES_IN` | Token lifetime. Defaults to `7d`. |

Create the database and load the SQL:

```bash
createdb eve_healthcare
psql "postgres://postgres:postgres@localhost:5432/eve_healthcare" -f sql/001_create_users_and_catalogue.sql
psql "postgres://postgres:postgres@localhost:5432/eve_healthcare" -f sql/seed_catalogue.sql
```

`sql/000_reset_development_database.sql` drops the account and catalogue tables. Use it only when you want a clean development database, then run the two files above again.

Start the server:

```bash
npm start
```

Signup always creates a `USER`. Promote an existing account with:

```bash
node scripts/promote-admin.js asha@example.com
```

The token only identifies the user. Admin routes read `users.role` from the database, so the promotion applies on the next request.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/signup` | No | Create a `USER` account |
| POST | `/auth/login` | No | Return a JWT |
| GET | `/auth/me` | Bearer token | Return the current user |
| GET | `/centres` | No | List centres |
| GET | `/centres/:id` | No | One centre and its priced tests |
| POST | `/centres` | Admin | Create a centre |
| PATCH | `/centres/:id` | Admin | Update a centre name or location |
| PUT | `/centres/:centreId/tests/:testId` | Admin | Set the price of a test at a centre |
| GET | `/tests` | No | List tests |
| POST | `/tests` | Admin | Create a test |
| PATCH | `/tests/:id` | Admin | Update a test name or description |

Send a user token as `Authorization: Bearer <token>`.

Passwords are stored as bcrypt hashes and are never returned. A `role` field sent at signup is ignored.
