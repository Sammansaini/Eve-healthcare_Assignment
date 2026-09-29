# EVE Healthcare API

Backend for diagnostic test bookings and simulated payments. Patients can create an account, browse centres and tests, book an appointment, and pay through a simulated result. A provider webhook can report the same result more than once without creating a second payment. Admins can add centres, tests, and prices.

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
| `DATABASE_URL` | PostgreSQL connection string for normal use. |
| `TEST_DATABASE_URL` | Separate database used only by `npm test`. Its name must end with `_test`. |
| `JWT_SECRET` | Secret used to sign login tokens. Use a long random string. |
| `JWT_EXPIRES_IN` | Token lifetime. Defaults to `7d`. |
| `WEBHOOK_SECRET` | Shared secret the simulated provider sends in `X-Webhook-Secret`. |

Create the development database and apply the SQL files in this order:

```bash
createdb eve_healthcare
psql "postgres://postgres:postgres@localhost:5432/eve_healthcare" -f sql/create_users_and_catalogue.sql
psql "postgres://postgres:postgres@localhost:5432/eve_healthcare" -f sql/seed_catalogue.sql
psql "postgres://postgres:postgres@localhost:5432/eve_healthcare" -f sql/create_bookings_and_payments.sql
psql "postgres://postgres:postgres@localhost:5432/eve_healthcare" -f sql/add_user_roles_and_webhook_events.sql
```

If the database already has users, centres, tests, bookings, and payments, run only the last file:

```bash
psql "postgres://postgres:postgres@localhost:5432/eve_healthcare" -f sql/add_user_roles_and_webhook_events.sql
```

`sql/create_users_and_catalogue.sql` creates `users`, `centres`, `tests`, and `centre_tests`. It does not delete data. Run it on an empty database. If those tables already exist, skip it.

`sql/seed_catalogue.sql` inserts three centres, four tests, and their prices. Run it once. Running it again stops with a duplicate-key error and leaves the existing prices in place.

`sql/create_bookings_and_payments.sql` adds `bookings` and `payments`. It can be run again without deleting rows.

`sql/add_user_roles_and_webhook_events.sql` adds `users.role` when that column is missing, and creates `webhook_events`. It can be run again without deleting rows. Existing users become `USER`.

`sql/reset_development_database.sql` drops every application table. Use it only when you want a clean development or test database, then run the four files above again. The automated tests run this reset only after checking that the database name ends with `_test`.

Start the server:

```bash
npm start
```

For automatic reload during development:

```bash
npm run dev
```

The server listens on port 3000 unless `PORT` is set.

### Make an admin

Signup always creates a `USER`. Promote an existing account with:

```bash
node scripts/promote-admin.js asha@example.com
```

The command reads `DATABASE_URL` from the environment or `.env`. It does not create a password or hardcode an admin account. The user's current token starts working for admin routes on the next request, because the role is read from the database.

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
| POST | `/bookings` | Bearer token | Book a test at a centre |
| GET | `/bookings` | Bearer token | List the signed-in user's bookings |
| GET | `/bookings/:id` | Bearer token | One booking owned by the signed-in user |
| POST | `/bookings/:id/cancel` | Bearer token | Cancel a `PENDING` booking |
| POST | `/payments/` | Bearer token | Simulate payment for a `PENDING` booking |
| POST | `/payments/webhook/` | `X-Webhook-Secret` | Provider payment result. No user JWT. |

Send a user token as `Authorization: Bearer <token>`.

### Signup

```bash
curl -s -X POST http://localhost:3000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Asha Rao","email":"asha@example.com","password":"password123"}'
```

`201` returns the user. The password hash is never included. A `role` field in the body is ignored. The account is `USER`.

### Login

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"asha@example.com","password":"password123"}'
```

`200` returns `token` and `user`. A wrong password and an unknown email both return `401`.

### Current user

```bash
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer <token>"
```

### Centres and tests

```bash
curl -s http://localhost:3000/centres
curl -s http://localhost:3000/centres/1
curl -s http://localhost:3000/tests
```

`GET /centres/1` includes the tests offered at that centre and the price at that centre. The same test can have a different price at another centre.

Admin writes:

```bash
curl -s -X POST http://localhost:3000/centres \
  -H "Authorization: Bearer <admin-token>" \
  -H 'Content-Type: application/json' \
  -d '{"name":"EVE Diagnostics Whitefield","location":"Whitefield, Bengaluru"}'

curl -s -X PATCH http://localhost:3000/centres/1 \
  -H "Authorization: Bearer <admin-token>" \
  -H 'Content-Type: application/json' \
  -d '{"location":"Koramangala 5th Block, Bengaluru"}'

curl -s -X POST http://localhost:3000/tests \
  -H "Authorization: Bearer <admin-token>" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Vitamin D","description":"Measures vitamin D."}'

curl -s -X PATCH http://localhost:3000/tests/1 \
  -H "Authorization: Bearer <admin-token>" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Measures red cells, white cells, and platelets."}'

curl -s -X PUT http://localhost:3000/centres/1/tests/1 \
  -H "Authorization: Bearer <admin-token>" \
  -H 'Content-Type: application/json' \
  -d '{"price":499.00}'
```

A normal user receives `403` for these writes. There are no delete endpoints. Catalogue rows stay in place so existing bookings can keep their foreign keys. Changing a price does not change the amount already stored on a booking.

### Create a booking

```bash
curl -s -X POST http://localhost:3000/bookings \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"centre_id":1,"test_id":1,"appointment_at":"2027-01-15T09:30:00+05:30"}'
```

The patient is the user in the token. The amount is the price of that centre and test in `centre_tests` (499.00 in the seed data). A price sent in the body is ignored.

`appointment_at` must be a future ISO date/time with `Z` or an offset such as `+05:30`.

`201` returns the booking with status `PENDING`.

### List and fetch bookings

```bash
curl -s http://localhost:3000/bookings \
  -H "Authorization: Bearer <token>"

curl -s http://localhost:3000/bookings/1 \
  -H "Authorization: Bearer <token>"
```

The list contains only the signed-in user's bookings. Another user's booking returns `403`. An unknown id returns `404`.

### Cancel a booking

```bash
curl -s -X POST http://localhost:3000/bookings/1/cancel \
  -H "Authorization: Bearer <token>"
```

Only a `PENDING` booking can be cancelled. It then becomes `CANCELLED`.

A booking that is already `CONFIRMED`, `FAILED`, or `CANCELLED` stays as it is, and the API returns `409`. Cancellation is not a refund. A paid booking cannot be undone here.

### Simulated payment

```bash
curl -s -X POST http://localhost:3000/payments/ \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"booking_id":1,"outcome":"SUCCESS"}'
```

Use `"outcome":"FAILED"` to simulate a failed charge.

`outcome` exists only for this simulation. There is no real payment provider. The caller chooses `SUCCESS` or `FAILED` so both results can be demonstrated. The server checks that the booking belongs to the signed-in user and is `PENDING`, then copies the amount from the booking row.

The payment insert and the booking update run in one transaction. The booking row is locked with `FOR UPDATE`, so two overlapping requests cannot both pay it. `payments.booking_id` is unique, so the database also allows only one payment row.

`201` returns the payment and the updated booking:

- `SUCCESS` stores payment status `SUCCESS` and sets the booking to `CONFIRMED`
- `FAILED` stores payment status `FAILED` and sets the booking to `FAILED`

A second call to `POST /payments/` returns `409` and does not change the booking. This patient action is not retried. The webhook below is the endpoint that can safely receive the same result again.

### Payment webhook

```bash
curl -s -X POST http://localhost:3000/payments/webhook/ \
  -H 'Content-Type: application/json' \
  -H "X-Webhook-Secret: <webhook-secret>" \
  -d '{"eventId":"evt_1001","bookingId":1,"status":"SUCCESS"}'
```

This is a simulated provider callback. It does not accept a user JWT. A missing secret returns `401` with `Webhook secret is required`. A wrong secret returns `401` with `Invalid webhook secret`.

`status` must be `SUCCESS` or `FAILED`. The amount is taken from the booking. The event is handled in one transaction:

1. Lock the booking row.
2. If this `eventId` was already stored with the same booking and status, return `200` and leave the payment and booking unchanged.
3. If this `eventId` was already stored with different data, return `409` and change nothing.
4. If the booking is `CANCELLED`, return `409` and do not store the event.
5. If the booking already has a payment with the same status, store this new event as a harmless duplicate, return `200`, and do not create another payment.
6. If the booking already has a payment with the other status, return `409` and do not store the event.
7. Otherwise create the one payment, set the booking to `CONFIRMED` or `FAILED`, store the event, and return `200`.

If the transaction fails, the event row is rolled back with everything else. A later delivery can use that `eventId` for real work. Two different event ids still cannot create two payments for one booking.

`already_processed` is `false` when this delivery created the payment, and `true` when the server recognized a replay or an agreeing duplicate.

## Booking and payment states

| Booking status | Meaning | What you can do |
| --- | --- | --- |
| `PENDING` | Booked, not paid | Pay, receive a webhook, or cancel |
| `CONFIRMED` | Payment succeeded | Nothing further. An agreeing webhook is a harmless duplicate. |
| `FAILED` | Payment failed | Nothing further. There is no retry. |
| `CANCELLED` | Cancelled before payment | Nothing further. A webhook cannot pay it. |

There are no refunds. `CONFIRMED` is not reversed, and `FAILED` is not charged again.

## Database relationships

- `users` stores the account. `email` is unique. `password_hash` is a bcrypt hash. `role` is `USER` or `ADMIN`.
- `centres` stores the centre name and location.
- `tests` stores the test name and description. A test does not have one global price.
- `centre_tests` links a centre to a test and stores that pair's price. Its primary key is `(centre_id, test_id)`.
- `bookings` links one user, one centre, and one test. It stores the appointment, the amount copied from `centre_tests` at booking time, and the status. A foreign key requires `(centre_id, test_id)` to exist in `centre_tests`.
- `payments` links to one booking. `booking_id` is unique. `amount` is copied from the booking. Money uses `NUMERIC(10, 2)`.
- `webhook_events` stores each processed provider event. `event_id` is the primary key. It points at the booking and records the `SUCCESS` or `FAILED` status from that event.

## Tests

Create a second database. `npm test` drops and recreates tables there, so it must not be the development database.

```bash
createdb eve_healthcare_test
```

Put this in `.env`, or pass it for one run:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/eve_healthcare_test npm test
```

The test file refuses to run unless the database name ends with `_test`, is not `eve_healthcare`, and is different from the database name in `DATABASE_URL`. It checks `current_database()` again before applying `sql/reset_development_database.sql` and the setup files.

`npm test` uses Node's built-in test runner. The tests cover signup and login, booking ownership, the catalogue price copied onto a booking, successful and failed payments, a repeated payment, webhook replay, conflicting webhook data, a missing or wrong webhook secret, and admin-only catalogue writes.

## Assumptions

- Signup and login are separate. Signup does not return a token.
- Emails are stored in lowercase.
- Prices are rupees, stored as `NUMERIC(10, 2)` and returned as JSON numbers.
- The booking keeps the catalogue price from the moment it was created.
- The patient simulation and the webhook share one payment row and the same status mapping. The patient endpoint returns `409` on a repeat. The webhook returns `200` for a repeat of the same result, because a provider may deliver an event more than once.
- A failed payment is final. This project does not retry it.
- A confirmed payment is final. This project does not refund it.
- The webhook is authenticated with a shared secret header, not a signed payload.
- Catalogue records are not deleted through the API.

## Status codes

- `400` invalid input, invalid JSON, or a centre/test pair that is not offered
- `401` missing or invalid user token, wrong login, or missing or wrong webhook secret
- `403` another user's booking, or a non-admin catalogue write
- `404` unknown centre, test, booking, or route
- `409` duplicate email, conflicting webhook event, or a booking action the current status does not allow
- `500` unexpected server error, with a generic message

## What I would improve with more time

- Verify webhooks with an HMAC signature instead of a static shared secret.
- Add pagination on the list endpoints.
- Define a real retry and refund flow if the product needs one. Those states are intentionally absent here.
- Publish an OpenAPI document.
- Add rate limiting on login and the webhook.
- Add request ids and structured logs.
