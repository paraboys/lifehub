import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TypingIndicator, MessageBubble } from './ChatComponents.jsx';

describe('ChatComponents', () => {
  describe('TypingIndicator', () => {
    it('should render nothing if no names provided', () => {
      const { container } = render(<TypingIndicator />);
      expect(container.firstChild).toBeNull();
    });

    it('should render typing indicator for one name', () => {
      const { getByText } = render(<TypingIndicator names={['Alice']} />);
      expect(getByText('Alice is typing')).toBeInTheDocument();
    });
  });

  describe('MessageBubble', () => {
    it('should render a text message successfully', () => {
      const mockMessage = { text: 'Hello world', status: 'SENT', createdAt: new Date() };
      const { getByText } = render(<MessageBubble message={mockMessage} isSelf={true} />);
      expect(getByText('Hello world')).toBeInTheDocument();
    });
  });
});
