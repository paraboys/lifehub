# LifeHub RBAC Matrix

Role names in DB are normalized and exposed in tokens/profile as uppercase:
- `CUSTOMER`
- `SHOPKEEPER`
- `PROVIDER`
- `DELIVERY`
- `BUSINESS`
- `ADMIN`

## Route Group Access

| Route Group | CUSTOMER | SHOPKEEPER | PROVIDER | DELIVERY | BUSINESS | ADMIN |
|---|---:|---:|---:|---:|---:|---:|
| `GET /superapp/home` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /users/me` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /orders` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `GET /orders*` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `POST /service-requests` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `GET /service-requests*` | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `POST /service-requests/:id/assign` | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `POST /service-requests/:id/complete` | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `GET /transactions*` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /transactions/wallet/topup` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /marketplace/providers*` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST/GET /chat*` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST/GET /calls*` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST/GET /media*` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /notifications` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `GET/PUT /notifications/preferences/me` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /notifications/ops/delivery-scan` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `POST /workflows/start|move|transition|event` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `GET /workflows/ops/*` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `GET /workflows/:workflowId/graph` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Runtime Enforcement

- Authentication middleware populates `req.user.roles` from `user_roles -> roles.role_name`.
- Authorization middleware performs case-insensitive role matching.
- Actor-level checks still apply in services:
  - Orders: owner-scoped data access in service.
  - Service requests: owner, assigned provider, or admin actor access.

## Seeded Demo Roles

When running `npm run seed`, role rows are created if missing and demo users are mapped:
- Customer user -> `CUSTOMER`
- Grocery shop user -> `SHOPKEEPER`
- Plumber/Electrician users -> `PROVIDER`
- Delivery user -> `DELIVERY`
- Admin user -> `ADMIN`, `BUSINESS`
