# LifeHub SuperApp 🚀

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18.3-61DAFB.svg?logo=react)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933.svg?logo=node.js)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748.svg?logo=prisma)
![Playwright](https://img.shields.io/badge/Tested%20with-Playwright-2EAD33.svg?logo=playwright)
![Jest](https://img.shields.io/badge/Tested%20with-Jest-C21325.svg?logo=jest)

LifeHub is a unified, real-time SuperApp platform combining multiple digital services into a single, cohesive ecosystem. It features a Marketplace, Service Booking, Real-time Chat, Order Management, Digital Wallet, and an Operations Console. 

Built with modern web technologies, LifeHub is designed to be scalable, highly available, and provide a premium, mobile-first user experience.

---

## 🌟 Key Features

*   **🛒 Unified Marketplace:** Browse, search, and purchase products from local shops. Features smart recommendations and real-time inventory.
*   **🛠️ Service Provider Booking:** Find and book local service professionals (plumbers, electricians, etc.) based on location and rating.
*   **💬 Real-Time Chat:** Integrated Socket.io messaging between customers, shopkeepers, service providers, and delivery partners.
*   **📦 Order Management & Logistics:** End-to-end order tracking, from placement to delivery, with OTP-secured handoffs.
*   **💳 Digital Wallet:** Secure P2P wallet transfers and payment gateway integration (Razorpay).
*   **📊 Ops Console & Seller Hub:** Dashboards for shopkeepers and business partners to manage inventory, feedback, and operations.
*   **📱 Progressive Web App (PWA):** Installable on mobile and desktop devices for a native-like experience.

---

## 🏗️ Tech Stack

### Frontend
*   **Framework:** [React 18](https://reactjs.org/) + [Vite](https://vitejs.dev/)
*   **Animations:** [Framer Motion](https://www.framer.com/motion/)
*   **Real-time:** [Socket.io Client](https://socket.io/)
*   **Styling:** Custom Premium UI (Vanilla CSS/CSS Variables)
*   **Testing:** [Vitest](https://vitest.dev/), [React Testing Library](https://testing-library.com/), [Playwright](https://playwright.dev/) (E2E)

### Backend
*   **Runtime/Framework:** [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) (ES Modules)
*   **Database ORM:** [Prisma](https://www.prisma.io/) (PostgreSQL/MySQL ready)
*   **Message Broker/Streaming:** [Apache Kafka](https://kafka.apache.org/) (via KafkaJS)
*   **Caching & Background Jobs:** [Redis](https://redis.io/) + [BullMQ](https://docs.bullmq.io/)
*   **Real-time:** [Socket.io](https://socket.io/)
*   **Security:** JWT Authentication, bcrypt, Express Rate Limit
*   **Testing:** [Jest](https://jestjs.io/), [Supertest](https://github.com/ladjs/supertest)

### Infrastructure
*   **Docker:** `docker-compose.yml` included for local Redis and Kafka setup.

---

## 📁 Project Structure

```text
lifehub/
├── lifehub-frontend/       # React + Vite frontend application
│   ├── src/
│   │   ├── components/     # React components (Auth, Chat, Marketplace, etc.)
│   │   ├── styles.css      # Core styles
│   │   └── premium-ui.css  # Premium design system tokens
│   ├── tests/              # Playwright E2E test suites
│   └── playwright.config.js
│
├── lifehub-backend/        # Node.js + Express backend API
│   ├── prisma/             # Prisma schema and seed scripts
│   ├── src/
│   │   ├── common/         # Middlewares (Auth, Role), Utilities, Security
│   │   ├── modules/        # Domain modules (Auth, Chat, Marketplace, Orders, Payments, Users)
│   │   └── server.js       # App entry point
│   └── jest.config.js
│
└── docker-compose.yml      # Local infrastructure (Redis, Kafka)
```

---

## 🚦 Getting Started

### Prerequisites
*   Node.js (v18 or higher)
*   npm or yarn
*   Docker & Docker Compose (for running Redis and Kafka)

### 1. Infrastructure Setup
Start the required background services (Redis and Kafka) using Docker:
```bash
docker-compose up -d
```

### 2. Backend Setup
```bash
cd lifehub-backend

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Ensure your .env has DATABASE_URL, JWT_SECRET, REDIS_URL, KAFKA_BROKERS, etc.

# Push Prisma schema to your database
npx prisma db push
# Generate Prisma Client
npm run db:generate

# Start the development server
npm run dev
```

### 3. Frontend Setup
```bash
cd lifehub-frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```
The frontend will typically run on `http://localhost:5173` and the backend on `http://localhost:4000`.

---

## 🧪 Testing

The project maintains **industry-standard test coverage (~81 tests)** across Unit, Integration, and End-to-End layers.

### Backend Tests (Jest + Supertest)
```bash
cd lifehub-backend
npm run test
```
*   **Integration Tests:** Verifies real API routes with mocked service layers.
*   **Unit Tests:** Tests individual controller and service logic.

### Frontend Unit & UI Tests (Vitest)
```bash
cd lifehub-frontend
npm run test
```

### End-to-End Tests (Playwright)
```bash
cd lifehub-frontend
# Install Playwright browsers (if running for the first time)
npx playwright install

# Run the E2E suites
npx playwright test
```
*Covers complete user journeys: Auth flows, Chat, Order lifecycle, Wallet interactions, and Marketplace browsing.*

---

## 🤝 Contributing

We welcome contributions to make LifeHub even better! 

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please ensure your code passes all existing test suites and add new tests for any new functionality.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---
*Built with ❤️ for a unified digital experience.*
