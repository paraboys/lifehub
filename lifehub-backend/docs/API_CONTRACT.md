# LifeHub API Contract (Production-Hardening Baseline)

Base URL: `http://localhost:4000/api`

Auth:
- Header: `Authorization: Bearer <accessToken>`
- Device header (recommended for chat sync/session): `x-device-id: web-main`

## 1. Authentication

### POST `/auth/signup`
Request:
```json
{
  "name": "Demo Customer",
  "phone": "9000000001",
  "email": "customer@lifehub.local",
  "password": "Lifehub@123",
  "role": "customer"
}
```
Response includes `user.roles`.

### POST `/auth/login`
Request:
```json
{
  "phone": "9000000001",
  "password": "Lifehub@123"
}
```
Response:
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "1",
    "name": "Demo Customer",
    "phone": "9000000001",
    "email": "customer@lifehub.local",
    "roles": ["CUSTOMER"]
  }
}
```

## 2. Grocery Orders

### POST `/orders`
Headers:
- `x-idempotency-key: <uuid>`

Request:
```json
{
  "shopId": "1",
  "total": 555,
  "items": [
    { "productId": "1", "quantity": 1 },
    { "productId": "2", "quantity": 1 }
  ]
}
```

Behavior:
- Validates inventory
- Decrements inventory
- Creates order + workflow instance
- Holds wallet escrow (`ESCROW_HOLD`)

### GET `/orders`
List caller’s orders.

### GET `/orders/:orderId`
Get single order (owner or admin allowed at route level; service currently owner-scoped).

### POST `/orders/:orderId/cancel`
Request:
```json
{ "reason": "USER_CANCELLED" }
```
Behavior:
- Cancels order
- Triggers workflow cancel event
- Refunds held escrow (`ESCROW_REFUND`)

## 3. Service Requests (Plumber/Electrician etc.)

### POST `/service-requests`
Request:
```json
{
  "serviceType": "plumber",
  "description": "Kitchen sink leak",
  "preferredProviderId": "1"
}
```
Behavior:
- Creates `service_requests` row
- Auto/preferred provider assignment
- Creates workflow instance

### GET `/service-requests`
- Customers see own requests
- Providers see assigned requests
- Admin sees all accessible via route + service actor checks

### GET `/service-requests/:requestId`
Actor-aware read: owner, assigned provider, or admin.

### POST `/service-requests/:requestId/assign`
Request:
```json
{ "providerId": "1" }
```

### POST `/service-requests/:requestId/cancel`
Request:
```json
{ "reason": "USER_CANCELLED" }
```

### POST `/service-requests/:requestId/complete`
Owner/assigned provider/admin can mark complete.

## 4. Wallet & Transactions

### GET `/transactions/wallet`
Response includes:
- `wallet`
- `availableBalance`
- `lockedBalance`
- `locks[]`
- `recentTransactions[]`

### POST `/transactions/wallet/topup`
Request:
```json
{ "amount": 500 }
```

### GET `/transactions?limit=20&type=ESCROW_HOLD&status=SUCCESS`
Lists transactions where user is payer/payee.

## 5. Chat (In-App)

### POST `/chat/conversations`
```json
{
  "participantIds": ["2"],
  "type": "DIRECT"
}
```

### GET `/chat/conversations`
### GET `/chat/conversations/:conversationId/messages`
### POST `/chat/conversations/:conversationId/messages`
```json
{
  "content": "hello",
  "messageType": "TEXT"
}
```

E2EE send:
```json
{
  "content": "Encrypted payload",
  "messageType": "E2EE",
  "encryptedPayload": {
    "ciphertext": "base64...",
    "iv": "iv...",
    "alg": "X25519-AESGCM",
    "keyId": "session-key-1"
  }
}
```

## 6. SuperApp Home

### GET `/superapp/home`
Includes:
- `dashboard.activeOrders`
- `dashboard.activeServiceRequests`
- `dashboard.unreadNotifications`
- `recentOrders`
- `recentServiceRequests`
- `nearbyProviders`

## 7. Operations

### GET `/workflows/:workflowId/graph`
Returns workflow graph for visual UI.

### GET `/metrics`
Prometheus metrics endpoint.

---

## Seed & Environment Notes

1. Run seed:
```bash
cd lifehub-backend
npm run seed
```

2. Set workflow IDs from seed output:
- `ORDER_WORKFLOW_ID=<id>`
- `SERVICE_WORKFLOW_ID=<id>`

3. Required infra:
- PostgreSQL
- Redis
- (Optional for full distributed) Kafka
