import React from 'react';
import { render, screen } from '@testing-library/react';
import { UiIcon } from './UiElements.jsx';
import { describe, it, expect } from 'vitest';

describe('UiElements', () => {
  describe('UiIcon', () => {
    it('renders an SVG element', () => {
      const { container } = render(<UiIcon name="chat" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass('ui-icon');
    });

    it('renders a path for chat icon', () => {
      const { container } = render(<UiIcon name="chat" />);
      const path = container.querySelector('path');
      expect(path).toBeInTheDocument();
    });
  });
});
