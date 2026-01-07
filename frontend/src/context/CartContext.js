import React, { createContext, useContext, useState, useEffect } from 'react';
import cartService from '../services/cartService';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);
  const [deliveryAddress, setDeliveryAddress] = useState({
    type: 'House',
    address: '1865 Vineyard Drive',
    city: 'Colombo, Sri Lanka'
  });

  const addToCart = (item) => {
    // Build options object for customizations
    const options = {
      size: item.size || null,
      spiceLevel: item.spiceLevel || null,
      extras: item.extras || [],
      instructions: item.instructions || ''
    };

    const quantity = item.quantity || 1;

    // optimistic local update
    setCartItems((prevItems) => {
      // Check if item with same id AND same options exists
      const existingItem = prevItems.find((i) => 
        i.id === item.id && 
        JSON.stringify(i.options) === JSON.stringify(options)
      );
      if (existingItem) {
        return prevItems.map((i) =>
          i.id === item.id && JSON.stringify(i.options) === JSON.stringify(options)
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [...prevItems, { ...item, quantity, options }];
    });

    // sync with backend and capture returned cart item id
    (async () => {
      try {
        const productId = item.id;
        const res = await cartService.addToCart(productId, quantity, options);
        // backend may return created cart item or full cart
        const created = res?.item || res?.cartItem || (Array.isArray(res) ? res[0] : null) || res;
        if (created) {
          setCartItems((prev) => prev.map((i) => {
            if (i.id === item.id && JSON.stringify(i.options) === JSON.stringify(options)) {
              const newId = created._id || created.id || created.cartItemId;
              return { ...i, cartItemId: newId };
            }
            return i;
          }));
        }
      } catch (err) {
        // ignore
      }
    })();
  };

  const removeFromCart = (itemId) => {
    // Resolve backend id before updating local state
    const found = cartItems.find((it) => it.id === itemId || it.cartItemId === itemId);
    const backendId = found?.cartItemId || itemId;

    setCartItems((prevItems) => prevItems.filter((item) => (item.id !== itemId && item.cartItemId !== itemId)));

    cartService.removeFromCart(backendId).catch(() => {});
  };

  const updateQuantity = (itemId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    // Resolve backend id before updating local state
    const found = cartItems.find((it) => it.id === itemId || it.cartItemId === itemId);
    const backendId = found?.cartItemId || itemId;

    setCartItems((prevItems) =>
      prevItems.map((item) =>
        (item.id === itemId || item.cartItemId === itemId) ? { ...item, quantity } : item
      )
    );

    cartService.updateCartItem(backendId, quantity).catch(() => {});
  };

  const clearCart = () => {
    setCartItems([]);
    cartService.clearCart().catch(() => {});
  };

  // Load cart from backend on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await cartService.getCart();
        if (!mounted || !data) return;
        // data may be an array of items or { items: [...] }
        const items = Array.isArray(data) ? data : data.items || [];
        // map backend shape to local shape
        const mapped = items.map((it) => {
          // if item has product field, use that
          const product = it.product || it.productId || {};
          return {
            // `id` is the product id when available; `cartItemId` is the backend cart item id
            id: product._id || product.id || it._id || it.id,
            cartItemId: it._id || it.id,
            productId: product._id || product.id,
            name: product.name || it.name,
            price: Number(product.price ?? it.price) || 0,
            image: product.image || it.image || '',
            quantity: it.quantity || it.qty || 1,
            description: product.description || it.description || '',
            options: it.options || {
              size: null,
              spiceLevel: null,
              extras: [],
              instructions: ''
            }
          };
        });
        setCartItems(mapped);
      } catch (err) {
        // ignore load errors
      }
    })();
    return () => { mounted = false; };
  }, []);

  const getCartTotal = () => {
    return cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  const getCartCount = () => {
    return cartItems.reduce((count, item) => count + item.quantity, 0);
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        getCartTotal,
        getCartCount,
        deliveryAddress,
        setDeliveryAddress
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
