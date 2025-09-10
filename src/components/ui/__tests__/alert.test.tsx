import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Alert, AlertTitle, AlertDescription } from '../alert';

describe('Alert Components', () => {
  describe('Alert', () => {
    it('renders with default variant', () => {
      render(
        <Alert>
          <AlertTitle>Default Alert</AlertTitle>
          <AlertDescription>This is a default alert.</AlertDescription>
        </Alert>
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveClass('relative w-full rounded-lg border p-4');
      expect(screen.getByText('Default Alert')).toBeInTheDocument();
      expect(screen.getByText('This is a default alert.')).toBeInTheDocument();
    });

    it('renders with destructive variant', () => {
      render(
        <Alert variant="destructive">
          <AlertTitle>Error Alert</AlertTitle>
          <AlertDescription>This is an error alert.</AlertDescription>
        </Alert>
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('border-destructive/50 text-destructive dark:border-destructive');
    });

    it('renders with custom className', () => {
      render(
        <Alert className="custom-alert">
          <AlertTitle>Custom Alert</AlertTitle>
        </Alert>
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('custom-alert');
    });
  });

  describe('AlertTitle', () => {
    it('renders correctly', () => {
      render(<AlertTitle>Alert Title</AlertTitle>);

      const title = screen.getByText('Alert Title');
      expect(title).toBeInTheDocument();
      expect(title).toHaveClass('mb-1 font-medium leading-none tracking-tight');
    });
  });

  describe('AlertDescription', () => {
    it('renders correctly', () => {
      render(<AlertDescription>Alert description text</AlertDescription>);

      const description = screen.getByText('Alert description text');
      expect(description).toBeInTheDocument();
      expect(description).toHaveClass('text-sm [&_p]:leading-relaxed');
    });
  });
});
