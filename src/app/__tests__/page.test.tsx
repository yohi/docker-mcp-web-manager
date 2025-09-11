/**
 * ホームページコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';
import HomePage from '../page';

describe('HomePage', () => {
    it('should render page title', () => {
        render(<HomePage />);

        const title = screen.getByRole('heading', {
            name: /Docker MCP Web Manager/i,
            level: 1
        });
        expect(title).toBeInTheDocument();
    });

    it('should render project setup completion message', () => {
        render(<HomePage />);

        const completionMessage = screen.getByRole('heading', {
            name: /プロジェクトセットアップが完了しました/i,
            level: 2
        });
        expect(completionMessage).toBeInTheDocument();
    });

    it('should display technology stack information', () => {
        render(<HomePage />);

        expect(screen.getByText(/技術スタック/i)).toBeInTheDocument();
        expect(screen.getByText(/Next.js 15.5.2/i)).toBeInTheDocument();
        expect(screen.getByText(/Node.js 24.7.0/i)).toBeInTheDocument();
        expect(screen.getByText(/TypeScript 5.9/i)).toBeInTheDocument();
        expect(screen.getByText(/Tailwind CSS 4.1.13/i)).toBeInTheDocument();
    });

    it('should display Docker environment information', () => {
        render(<HomePage />);

        expect(screen.getByText(/Docker環境/i)).toBeInTheDocument();
        expect(screen.getByText(/マルチステージビルド/i)).toBeInTheDocument();
        expect(screen.getByText(/開発・本番環境対応/i)).toBeInTheDocument();
        expect(screen.getByText(/セキュリティ強化/i)).toBeInTheDocument();
    });

    it('should have proper styling classes', () => {
        render(<HomePage />);

        const title = screen.getByRole('heading', { name: /Docker MCP Web Manager/i });
        const container = title.closest('.min-h-screen');
        expect(container).toHaveClass('min-h-screen', 'bg-background');
    });
});
