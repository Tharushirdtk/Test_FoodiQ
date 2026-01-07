# Restaurant Full-Stack Application

A full-stack restaurant application with React frontend and Node.js backend.

## Project Structure

```
restaurant-app/
├── frontend/          # React application
│   ├── public/        # Static files
│   ├── src/          # React source code
│   ├── package.json  # Frontend dependencies
│   └── README.md     # Frontend documentation
├── backend/           # Node.js API server
│   ├── config/       # Database configuration
│   ├── controllers/  # Business logic
│   ├── middleware/   # Authentication middleware
│   ├── models/       # Mongoose schemas
│   ├── routes/       # API routes
│   ├── utils/        # Helper functions
│   ├── tests/        # Unit and integration tests
│   ├── package.json  # Backend dependencies
│   ├── server.js     # Main server file
│   └── README.md     # Backend documentation
└── README.md         # This file
```

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd restaurant-app
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   # Create .env file with your MongoDB URI and JWT secret
   npm run dev
   ```

3. **Setup Frontend** (in a new terminal)
   ```bash
   cd frontend
   npm install
   npm start
   ```

### Environment Variables

Create a `.env` file in the backend directory:

```
MONGO_URI=mongodb://localhost:27017/restaurant
JWT_SECRET=your_jwt_secret_here
PORT=5000
```

## Features

- User authentication with JWT
- Product management (CRUD)
- Real-time updates with WebSockets
- Responsive React frontend
- RESTful API backend

## API Documentation

See `backend/README.md` for detailed API endpoints.

## Testing

```bash
cd backend
npm test
```