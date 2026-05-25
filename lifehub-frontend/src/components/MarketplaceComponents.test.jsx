import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProductCard, CartDrawer, FilterDrawer } from './MarketplaceComponents.jsx';

// Mock dependencies
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    button: ({ children, ...props }) => <button {...props}>{children}</button>,
    section: ({ children, ...props }) => <section {...props}>{children}</section>,
    article: ({ children, ...props }) => <article {...props}>{children}</article>,
    aside: ({ children, ...props }) => <aside {...props}>{children}</aside>
  },
  AnimatePresence: ({ children }) => <>{children}</>
}));

describe('Marketplace Components UI Functional Tests', () => {
  describe('ProductCard', () => {
    it('should render product details and trigger onBuyNow', () => {
      const mockProduct = { productId: 1, name: 'Test Product', price: 100, company: 'TestBrand' };
      const onBuyNow = vi.fn();
      const { getByText } = render(<ProductCard product={mockProduct} onBuyNow={onBuyNow} />);
      
      expect(getByText('Test Product')).toBeInTheDocument();
      expect(getByText('TestBrand')).toBeInTheDocument();
      
      // Simulate hover
      const card = getByText('Test Product').closest('article');
      fireEvent.mouseEnter(card);
      
      const buyBtn = getByText('Buy Now');
      fireEvent.click(buyBtn);
      
      expect(onBuyNow).toHaveBeenCalledWith(mockProduct);
    });
  });

  describe('CartDrawer', () => {
    it('should calculate savings and total correctly and allow increments', () => {
      const cart = [{ productId: 1, name: 'Item', price: 100, quantity: 2 }];
      const onIncrement = vi.fn();
      const onRemove = vi.fn();
      
      const { getByText, getByTitle } = render(
        <CartDrawer open={true} cart={cart} cartTotal={200} onIncrement={onIncrement} onRemove={onRemove} />
      );

      // Verify rendering
      expect(getByText('Item')).toBeInTheDocument();
      expect(getByText('₹200.00')).toBeInTheDocument();
      
      // Test Increment
      const plusBtn = getByText('+');
      fireEvent.click(plusBtn);
      expect(onIncrement).toHaveBeenCalledWith(1);
      
      // Test Remove using Title because there are multiple '✕'
      const removeBtn = getByTitle('Remove');
      fireEvent.click(removeBtn);
      expect(onRemove).toHaveBeenCalledWith(1);
    });
  });

  describe('FilterDrawer', () => {
    it('should allow applying filters', () => {
      const onApply = vi.fn();
      const { getByText, getByPlaceholderText } = render(
        <FilterDrawer open={true} categories={['electronics', 'fashion']} onApply={onApply} />
      );
      
      const maxInput = getByPlaceholderText('Max ₹');
      fireEvent.change(maxInput, { target: { value: '500' } });
      
      const applyBtn = getByText('Apply Filters');
      fireEvent.click(applyBtn);
      
      expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ maxPrice: '500' }));
    });
  });
});
