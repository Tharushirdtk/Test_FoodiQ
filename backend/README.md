# Restaurant Backend

A simple Node.js backend for a restaurant full-stack coursework project.

## Features

- User authentication with JWT
- Product CRUD operations
- Real-time updates with Socket.io
- MongoDB with Mongoose
- Basic validation and error handling

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables in `.env`:
   ```
   MONGO_URI=mongodb://localhost:27017/restaurant
   JWT_SECRET=your_jwt_secret_here
   PORT=5000
   ```

3. Start MongoDB locally or update MONGO_URI for your database.

4. Run the server:
   ```bash
   npm start
   ```

   For development:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (protected)
- `PUT /api/products/:id` - Update product (protected)
- `DELETE /api/products/:id` - Delete product (protected)

## WebSocket Events

- `productUpdate` - Emitted when products are created, updated, or deleted

## Testing

Run tests with:
```bash
npm test
```

## Folder Structure

- `config/` - Database configuration
- `controllers/` - Business logic
- `middleware/` - Authentication middleware
- `models/` - Mongoose schemas
- `routes/` - API routes
- `utils/` - Helper functions
- `tests/` - Unit and integration tests