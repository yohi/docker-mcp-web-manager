import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';

describe('UI Components', () => {
  describe('Card Component', () => {
    it('should render card with header, title, and content', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Test Title</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Test content</p>
          </CardContent>
        </Card>
      );

      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <Card className="custom-card">
          <CardContent>Content</CardContent>
        </Card>
      );

      expect(container.firstChild).toHaveClass('custom-card');
    });
  });

  describe('Button Component', () => {
    it('should render button with text', () => {
      render(<Button>Click me</Button>);
      
      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
    });

    it('should handle click events', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Click me</Button>);
      
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should be disabled when disabled prop is true', () => {
      render(<Button disabled>Disabled Button</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should apply variant classes', () => {
      const { rerender } = render(<Button variant="outline">Outline</Button>);
      let button = screen.getByRole('button');
      expect(button).toHaveClass('border-input');

      rerender(<Button variant="destructive">Destructive</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveClass('bg-destructive');

      rerender(<Button variant="ghost">Ghost</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveClass('hover:bg-accent');
    });

    it('should apply size classes', () => {
      const { rerender } = render(<Button size="sm">Small</Button>);
      let button = screen.getByRole('button');
      expect(button).toHaveClass('h-9', 'px-3');

      rerender(<Button size="lg">Large</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveClass('h-11', 'px-8');
    });

    it('should render as different element when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/test');
    });
  });

  describe('Badge Component', () => {
    it('should render badge with text', () => {
      render(<Badge>New</Badge>);
      
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('should apply variant classes', () => {
      const { rerender } = render(<Badge variant="secondary">Secondary</Badge>);
      let badge = screen.getByText('Secondary');
      expect(badge).toHaveClass('bg-secondary');

      rerender(<Badge variant="destructive">Error</Badge>);
      badge = screen.getByText('Error');
      expect(badge).toHaveClass('bg-destructive');

      rerender(<Badge variant="outline">Outline</Badge>);
      badge = screen.getByText('Outline');
      expect(badge).toHaveClass('border');
    });

    it('should apply custom className', () => {
      render(<Badge className="custom-badge">Custom</Badge>);
      
      const badge = screen.getByText('Custom');
      expect(badge).toHaveClass('custom-badge');
    });
  });

  describe('Alert Component', () => {
    it('should render alert with description', () => {
      render(
        <Alert>
          <AlertDescription>This is an alert message</AlertDescription>
        </Alert>
      );

      expect(screen.getByText('This is an alert message')).toBeInTheDocument();
    });

    it('should apply variant classes', () => {
      const { rerender, container } = render(
        <Alert variant="destructive">
          <AlertDescription>Error message</AlertDescription>
        </Alert>
      );

      expect(container.firstChild).toHaveClass('border-destructive/50');

      rerender(
        <Alert variant="default">
          <AlertDescription>Default message</AlertDescription>
        </Alert>
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should render with icons and complex content', () => {
      const TestIcon = () => <svg data-testid="test-icon" />;
      
      render(
        <Alert>
          <TestIcon />
          <AlertDescription>
            <strong>Error:</strong> Something went wrong
          </AlertDescription>
        </Alert>
      );

      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
      expect(screen.getByText('Error:')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });
});