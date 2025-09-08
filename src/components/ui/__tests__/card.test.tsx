import { render, screen } from '@testing-library/react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../card';

describe('Card Components', () => {
  describe('Card', () => {
    it('renders with default styling', () => {
      render(<Card data-testid="card">Card content</Card>);
      
      const card = screen.getByTestId('card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('rounded-lg border bg-card text-card-foreground shadow-sm');
    });

    it('accepts custom className', () => {
      render(<Card className="custom-card" data-testid="card">Custom</Card>);
      expect(screen.getByTestId('card')).toHaveClass('custom-card');
    });

    it('forwards ref correctly', () => {
      const ref = jest.fn();
      render(<Card ref={ref}>Ref card</Card>);
      expect(ref).toHaveBeenCalled();
    });
  });

  describe('CardHeader', () => {
    it('renders with proper styling', () => {
      render(
        <Card>
          <CardHeader data-testid="header">Header content</CardHeader>
        </Card>
      );
      
      const header = screen.getByTestId('header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveClass('flex flex-col space-y-1.5 p-6');
    });

    it('accepts custom className', () => {
      render(
        <Card>
          <CardHeader className="custom-header" data-testid="header">
            Custom Header
          </CardHeader>
        </Card>
      );
      
      expect(screen.getByTestId('header')).toHaveClass('custom-header');
    });
  });

  describe('CardTitle', () => {
    it('renders with proper styling', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
          </CardHeader>
        </Card>
      );
      
      const title = screen.getByText('Card Title');
      expect(title).toBeInTheDocument();
      expect(title).toHaveClass('text-2xl font-semibold leading-none tracking-tight');
    });

    it('accepts custom className', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle className="custom-title">Custom Title</CardTitle>
          </CardHeader>
        </Card>
      );
      
      expect(screen.getByText('Custom Title')).toHaveClass('custom-title');
    });
  });

  describe('CardDescription', () => {
    it('renders with proper styling', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription>Card description text</CardDescription>
          </CardHeader>
        </Card>
      );
      
      const description = screen.getByText('Card description text');
      expect(description).toBeInTheDocument();
      expect(description).toHaveClass('text-sm text-muted-foreground');
    });

    it('accepts custom className', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription className="custom-desc">Custom description</CardDescription>
          </CardHeader>
        </Card>
      );
      
      expect(screen.getByText('Custom description')).toHaveClass('custom-desc');
    });
  });

  describe('CardContent', () => {
    it('renders with proper styling', () => {
      render(
        <Card>
          <CardContent data-testid="content">Main content</CardContent>
        </Card>
      );
      
      const content = screen.getByTestId('content');
      expect(content).toBeInTheDocument();
      expect(content).toHaveClass('p-6 pt-0');
    });

    it('accepts custom className', () => {
      render(
        <Card>
          <CardContent className="custom-content" data-testid="content">
            Custom content
          </CardContent>
        </Card>
      );
      
      expect(screen.getByTestId('content')).toHaveClass('custom-content');
    });
  });

  describe('CardFooter', () => {
    it('renders with proper styling', () => {
      render(
        <Card>
          <CardFooter data-testid="footer">Footer content</CardFooter>
        </Card>
      );
      
      const footer = screen.getByTestId('footer');
      expect(footer).toBeInTheDocument();
      expect(footer).toHaveClass('flex items-center p-6 pt-0');
    });

    it('accepts custom className', () => {
      render(
        <Card>
          <CardFooter className="custom-footer" data-testid="footer">
            Custom footer
          </CardFooter>
        </Card>
      );
      
      expect(screen.getByTestId('footer')).toHaveClass('custom-footer');
    });
  });

  describe('Complete Card Structure', () => {
    it('renders full card structure correctly', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Test Card</CardTitle>
            <CardDescription>This is a test card description.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>This is the main content of the card.</p>
          </CardContent>
          <CardFooter>
            <button>Action Button</button>
          </CardFooter>
        </Card>
      );
      
      expect(screen.getByText('Test Card')).toBeInTheDocument();
      expect(screen.getByText('This is a test card description.')).toBeInTheDocument();
      expect(screen.getByText('This is the main content of the card.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Action Button' })).toBeInTheDocument();
    });

    it('works with minimal structure', () => {
      render(
        <Card>
          <CardContent>Simple card with just content</CardContent>
        </Card>
      );
      
      expect(screen.getByText('Simple card with just content')).toBeInTheDocument();
    });
  });
});