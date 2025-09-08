import { render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle } from '../alert';
import { AlertCircle, CheckCircle } from 'lucide-react';

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
      expect(alert).toHaveClass('border text-foreground');
    });

    it('supports destructive variant', () => {
      render(
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Something went wrong!</AlertDescription>
        </Alert>
      );
      
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('border-destructive/50 text-destructive');
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong!')).toBeInTheDocument();
    });

    it('accepts custom className', () => {
      render(
        <Alert className="custom-alert">
          <AlertDescription>Custom styled alert</AlertDescription>
        </Alert>
      );
      
      expect(screen.getByRole('alert')).toHaveClass('custom-alert');
    });

    it('forwards ref correctly', () => {
      const ref = jest.fn();
      render(
        <Alert ref={ref}>
          <AlertDescription>Ref alert</AlertDescription>
        </Alert>
      );
      
      expect(ref).toHaveBeenCalled();
    });
  });

  describe('AlertTitle', () => {
    it('renders title with proper styling', () => {
      render(
        <Alert>
          <AlertTitle>Important Notice</AlertTitle>
        </Alert>
      );
      
      const title = screen.getByText('Important Notice');
      expect(title).toBeInTheDocument();
      expect(title).toHaveClass('mb-1 font-medium leading-none tracking-tight');
    });

    it('accepts custom className', () => {
      render(
        <Alert>
          <AlertTitle className="custom-title">Custom Title</AlertTitle>
        </Alert>
      );
      
      expect(screen.getByText('Custom Title')).toHaveClass('custom-title');
    });
  });

  describe('AlertDescription', () => {
    it('renders description with proper styling', () => {
      render(
        <Alert>
          <AlertDescription>This is the alert description.</AlertDescription>
        </Alert>
      );
      
      const description = screen.getByText('This is the alert description.');
      expect(description).toBeInTheDocument();
      expect(description).toHaveClass('text-sm [&_p]:leading-relaxed');
    });

    it('accepts custom className', () => {
      render(
        <Alert>
          <AlertDescription className="custom-description">
            Custom description
          </AlertDescription>
        </Alert>
      );
      
      expect(screen.getByText('Custom description')).toHaveClass('custom-description');
    });
  });

  describe('Alert with Icon', () => {
    it('renders with icon correctly', () => {
      render(
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>Operation completed successfully.</AlertDescription>
        </Alert>
      );
      
      // アイコンのテスト（CheckCircleアイコンが存在するかチェック）
      const alert = screen.getByRole('alert');
      const icon = alert.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass('h-4 w-4');
      
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Operation completed successfully.')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA role', () => {
      render(
        <Alert>
          <AlertDescription>Accessible alert</AlertDescription>
        </Alert>
      );
      
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('supports custom aria-label', () => {
      render(
        <Alert aria-label="Custom alert label">
          <AlertDescription>Alert with custom label</AlertDescription>
        </Alert>
      );
      
      expect(screen.getByLabelText('Custom alert label')).toBeInTheDocument();
    });
  });
});