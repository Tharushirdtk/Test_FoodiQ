# Restaurant Delivery App - Frontend

A modern, responsive restaurant food delivery application built with React. Features a complete ordering flow from browsing menu items to order tracking.

## 🚀 Features

- **Homepage**: Browse featured items, popular dishes, and signature menu
- **Store/Menu Page**: Filter and search through all available menu items
- **Product Details**: Customize your order with size, spice level, and extras
- **Shopping Cart**: Manage cart items with quantity controls
- **Checkout**: Complete orders with delivery address and payment options
- **Order Tracking**: Real-time order status updates with delivery timeline
- **User Account**: Manage profile, orders, and preferences

## 📦 Installation

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Start the development server:
\`\`\`bash
npm start
\`\`\`

The app will open at [http://localhost:3000](http://localhost:3000)

## 🏗️ Project Structure

\`\`\`
src/
├── pages/              # Page components
│   ├── HomePage.js
│   ├── StorePage.js
│   ├── ProductPage.js
│   ├── CartPage.js
│   ├── CheckoutPage.js
│   ├── OrderTrackingPage.js
│   └── AccountPage.js
├── context/           # React Context
│   └── CartContext.js
├── App.js            # Main app component
└── index.js          # Entry point
\`\`\`

## 🎨 Design Features

- Modern UI with orange (#FF6B35) primary color theme
- Responsive design for mobile and desktop
- Smooth animations and transitions
- Card-based layouts
- Bottom navigation for mobile
- Sticky headers
- Interactive buttons and forms

## 🛠️ Technologies Used

- **React 18** - UI framework
- **React Router 6** - Navigation
- **React Icons** - Icon library
- **Context API** - State management
- **CSS3** - Styling with custom properties

## 📱 Available Pages

1. **Home** (`/`) - Main landing page with featured items
2. **Store** (`/store`) - Browse all menu items
3. **Product** (`/product/:id`) - Product details and customization
4. **Cart** (`/cart`) - Shopping cart management
5. **Checkout** (`/checkout`) - Order checkout process
6. **Order Tracking** (`/order/:id`) - Track order status
7. **Account** (`/account`) - User profile and settings

## 🎯 Key Features

### Cart Management
- Add/remove items
- Update quantities
- Apply voucher codes
- Calculate totals with tax and delivery

### Order Customization
- Size selection
- Spice level options
- Add extras/toppings
- Special instructions

### Order Tracking
- Real-time status updates
- Driver information
- Estimated delivery time
- Order timeline

## 🚀 Build for Production

\`\`\`bash
npm run build
\`\`\`

Creates an optimized production build in the `build` folder.

## 📝 Notes

- All product images are represented with emojis for demonstration
- Replace with actual product images in production
- Add backend API integration for real data
- Implement authentication for user accounts
- Add payment gateway integration

## 🤝 Contributing

Feel free to fork and customize for your needs!

## 📄 License

MIT License
\`\`\`
