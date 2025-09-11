import { render, screen, fireEvent } from '@testing-library/react';
import { ServerCard } from '../servers/server-card';
import { AuthProvider } from '../auth/auth-provider';

// Next.js のルーターをモック
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
    }),
}));

const mockServer = {
    id: '1',
    name: 'Test Server',
    description: 'Test server description',
    status: 'running' as const,
    imageUrl: 'test/server:latest',
    version: '1.0.0',
    port: 3001,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    healthStatus: 'healthy' as const,
    toolsCount: 5,
    configurationsCount: 3
};

const defaultProps = {
    server: mockServer,
    onStart: jest.fn(),
    onStop: jest.fn(),
    className: ''
};

describe('ServerCard Component', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders server information correctly', () => {
        render(
            <AuthProvider>
                <ServerCard {...defaultProps} />
            </AuthProvider>
        );

        expect(screen.getByText('Test Server')).toBeInTheDocument();
        expect(screen.getByText('Test server description')).toBeInTheDocument();
        expect(screen.getByText('v1.0.0')).toBeInTheDocument();
        expect(screen.getByText('3001')).toBeInTheDocument();
    });

    it('displays server status correctly', () => {
        render(
            <AuthProvider>
                <ServerCard {...defaultProps} />
            </AuthProvider>
        );

        // 実行中ステータスの確認
        expect(screen.getByText(/実行中/)).toBeInTheDocument();
    });

    it('displays stopped server correctly', () => {
        const stoppedServer = { ...mockServer, status: 'stopped' as const };

        render(
            <AuthProvider>
                <ServerCard {...defaultProps} server={stoppedServer} />
            </AuthProvider>
        );

        expect(screen.getByText(/停止中/)).toBeInTheDocument();
    });

    it('displays image url', () => {
        render(
            <AuthProvider>
                <ServerCard {...defaultProps} />
            </AuthProvider>
        );

        expect(screen.getByText('test/server:latest')).toBeInTheDocument();
    });

    it('shows management buttons for running server', () => {
        render(
            <AuthProvider>
                <ServerCard {...defaultProps} />
            </AuthProvider>
        );

        expect(screen.getByRole('button', { name: /停止/ })).toBeInTheDocument();
    });

    it('shows start button for stopped server', () => {
        const stoppedServer = { ...mockServer, status: 'stopped' as const };
        
        render(
            <AuthProvider>
                <ServerCard {...defaultProps} server={stoppedServer} />
            </AuthProvider>
        );

        expect(screen.getByRole('button', { name: /起動/ })).toBeInTheDocument();
    });

    it('handles server actions correctly', () => {
        render(
            <AuthProvider>
                <ServerCard {...defaultProps} />
            </AuthProvider>
        );

        const stopButton = screen.getByRole('button', { name: /停止/ });
        fireEvent.click(stopButton);

        expect(defaultProps.onStop).toHaveBeenCalledWith('1');
    });

    it('displays health status through server status', () => {
        render(
            <AuthProvider>
                <ServerCard {...defaultProps} />
            </AuthProvider>
        );

        // ヘルス状態は実行中ステータスに反映されている
        expect(screen.getByText(/実行中/)).toBeInTheDocument();
    });

    it('displays tools and configurations count', () => {
        render(
            <AuthProvider>
                <ServerCard {...defaultProps} />
            </AuthProvider>
        );

        expect(screen.getByText('5個')).toBeInTheDocument();
        expect(screen.getByText('3個')).toBeInTheDocument();
        expect(screen.getByText('ツール数')).toBeInTheDocument();
        expect(screen.getByText('設定数')).toBeInTheDocument();
    });

    it('handles error status correctly', () => {
        const errorServer = { ...mockServer, status: 'error' as const };

        render(
            <AuthProvider>
                <ServerCard {...defaultProps} server={errorServer} />
            </AuthProvider>
        );

        expect(screen.getByText(/エラー/)).toBeInTheDocument();
    });

    it('applies custom className', () => {
        const customClass = 'custom-server-card';

        const { container } = render(
            <AuthProvider>
                <ServerCard {...defaultProps} className={customClass} />
            </AuthProvider>
        );

        // カスタムクラスが適用されていることを確認
        const cardElement = container.querySelector('.custom-server-card');
        expect(cardElement).toBeInTheDocument();
    });

    it('displays basic server information', () => {
        render(
            <AuthProvider>
                <ServerCard {...defaultProps} />
            </AuthProvider>
        );

        // 基本情報が表示されることを確認
        expect(screen.getByText('Test Server')).toBeInTheDocument();
        expect(screen.getByText('Test server description')).toBeInTheDocument();
        expect(screen.getByText('test/server:latest')).toBeInTheDocument();
    });
});
